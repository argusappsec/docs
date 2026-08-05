import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readWorkflow, type Step } from '../workflows/workflow.ts';

/**
 * The rules the deploy has to keep, read off the workflow that performs it.
 *
 * ADR 0009 chose a workflow in this repository over Cloudflare's dashboard Git
 * integration precisely so these could be checked, and this is the file that
 * cashes that in. Every failure below is silent in the way this repository keeps
 * writing tests about: a deploy that skipped the tests still reports success, a
 * feature branch that publishes over production still says "Deployment
 * complete", and a second secret in the workflow looks exactly like the first.
 *
 * What no test here can check is the half that lives in Cloudflare — that the
 * project exists, that its production branch is `main`, and that the two secrets
 * are set. Those fail loudly on the first run, which is why they are left to it.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WORKFLOW = '.github/workflows/deploy.yml';

const DEPLOY = readWorkflow(WORKFLOW);
const PACKAGE = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

/** The one connection to Cloudflare, which happens to be spelled as two
 *  entries. Anything else under `secrets.` is a new thing to keep, and issue #6
 *  asks for none. */
const HOSTING_SECRETS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];

/** Astro's default, and so the directory the upload has to name. */
const OUTPUT_DIR = 'dist';

describe('the deploy workflow', () => {
  it('deploys every branch, and never code from a fork', () => {
    // A preview URL per branch is what issue #6 is for, so the trigger is every
    // branch rather than a list somebody has to remember to extend.
    const push = DEPLOY.triggers()['push'] as { branches?: readonly string[] } | undefined;

    expect(push?.branches, `no branch push trigger in ${WORKFLOW}`).toContain('**');

    // The whole `pull_request` family is refused, not just the obvious name.
    // `pull_request` withholds the secrets, so on a public repository it would
    // paint a red X on every outside contribution and deploy nothing.
    // `pull_request_target` is the worse half: it runs with the secrets
    // available to a fork's own code. ADR 0009 records the trade.
    expect(
      Object.keys(DEPLOY.triggers()).filter((event) => event.startsWith('pull_request')),
      'a fork must not reach the Cloudflare credentials — see ADR 0009',
    ).toEqual([]);
  });

  it('is one job, so the order of the steps is the order of the deploy', () => {
    // Everything below reads the steps as a sequence, and that only means
    // something within a single job. A second job without `needs:` runs in
    // parallel, so an upload moved there would still sit after the gates as this
    // file counts them — and would upload while the tests were failing.
    expect(Object.keys(DEPLOY.jobs()), 'more than one job — the ordering guard below stops meaning anything').toHaveLength(1);
  });

  it('uploads nothing until the checks, the tests and the build have passed', () => {
    // The acceptance criterion is that a failing build leaves the running
    // deployment alone, and this is how it is met: every gate is a step before
    // the upload, and a step that fails ends the job. Nothing about that is
    // visible in the deployment itself, so it is asserted here.
    for (const gate of [/npm ci\b/, /npm run check\b/, /npm test\b/, /npm run build\b/]) {
      const at = DEPLOY.steps().findIndex((step) => gate.test(step.run ?? ''));

      expect(at, `no step runs ${gate.source}`).toBeGreaterThan(-1);
      expect(at, `${gate.source} runs after the upload`).toBeLessThan(uploadAt());
    }
  });

  it('lets the branch decide production, and never says which branch that is', () => {
    // Cloudflare compares `--branch` against the project's production branch and
    // decides for itself. Passing the ref through means a feature branch cannot
    // publish to production even by accident; a literal branch name here would be
    // exactly that accident, spelled out.
    const variable = /--branch="?\$\{?([A-Z_]+)\}?"?/.exec(upload().run ?? '')?.[1];

    expect(variable, 'a hard-coded branch would let a preview publish to production').toBeDefined();

    // And it arrives through the environment rather than interpolated into the
    // script. Git allows `;`, `$` and a backtick in a ref name, so a `${{ }}`
    // written inline is a shell handed to anyone who can push a branch.
    expect(upload().env?.[variable!], `${variable} is not bound to the ref name`).toMatch(
      /^\$\{\{\s*github\.ref_name\s*\}\}$/,
    );
  });

  it('uploads the directory Astro writes, from the root Astro writes it for', () => {
    // `base` is the requirement ADR 0005 calls the one "most likely to be
    // discovered late": under a sub-path, every root-absolute `/guide/…` link in
    // the Guide breaks — and those links are written in another repository,
    // where nobody here would go looking.
    expect(
      astroConfig(),
      'astro.config.mjs now sets base — ADR 0005 serves this site from the domain root',
    ).not.toMatch(/\bbase\s*:/);

    // `outDir` left at Astro's default is what makes the upload path correct.
    // Setting it without changing the upload would deploy whatever `dist/` held
    // last — stale on a developer's machine, empty in CI, and green either way.
    expect(astroConfig(), 'astro.config.mjs now sets outDir — the upload has to follow it').not.toMatch(
      /\boutDir\b/,
    );
    expect(upload().run).toMatch(new RegExp(`pages deploy ${OUTPUT_DIR}\\b`));
  });

  it('carries the hosting connection and no other secret', () => {
    const referenced = [...DEPLOY.source.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(([, name]) => name!);

    expect(referenced, 'the workflow reads no secret at all — how does it authenticate?').not.toHaveLength(0);
    expect([...new Set(referenced)].sort()).toEqual(HOSTING_SECRETS);
  });

  it('takes a token that cannot write to the repository', () => {
    // The job reads the checkout and nothing else. Left implicit, these follow a
    // repository-wide default that can be widened from a settings page this file
    // cannot see.
    expect(DEPLOY.document.permissions, 'no explicit permissions block').toEqual({ contents: 'read' });

    // A job's own block *replaces* the one above rather than narrowing it, so the
    // widening would be invisible from the top of the file.
    for (const [name, job] of Object.entries(DEPLOY.jobs())) {
      expect(job.permissions, `job \`${name}\` sets its own permissions, which replace the workflow's`).toBeUndefined();
    }
  });

  it('lets a newer push win the branch it shares', () => {
    const { concurrency } = DEPLOY.document;

    // Two runs on one branch race to upload, and the loser is whichever finished
    // first — so the older commit can end up being the one served. Nothing
    // reports that; both runs go green.
    expect(concurrency?.group, 'a concurrency group that ignores the ref would serialise the whole repository').toMatch(
      /github\.ref/,
    );
    expect(concurrency?.['cancel-in-progress']).toBe(true);
  });

  it('builds on a Node the project claims to support', () => {
    const pinned = setupNode()?.['node-version'];

    // Pinned rather than resolved from `engines.node`, which says ">=22.12.0" and
    // would put the build on a new major the week it ships. This is the other
    // direction: the pin has to stay inside what package.json promises.
    expect(pinned, `no node-version in ${WORKFLOW}`).toBeDefined();

    const floor = /(\d+)/.exec(PACKAGE.engines?.node ?? '')?.[1];

    expect(floor, 'package.json no longer says which Node this project runs on').toBeDefined();
    expect(Number(String(pinned).split('.')[0])).toBeGreaterThanOrEqual(Number(floor));
  });

  it('names the exact wrangler it deploys with', () => {
    // Wrangler is deliberately *not* a devDependency — ADR 0009 records what it
    // drags in. The cost of keeping it out is that its version lives in the
    // workflow instead of the lockfile, so it has to be exact: `@latest` would
    // fetch a release nobody reviewed, at deploy time, on the one job able to
    // replace the live site.
    expect(upload().run, 'wrangler has to carry an exact version').toMatch(
      /wrangler@\d+\.\d+\.\d+\b/,
    );
    expect(
      PACKAGE.devDependencies?.wrangler,
      'wrangler is back in the tree — either drop it again or drop the pin above',
    ).toBeUndefined();
  });
});

/** Where the upload sits among the steps. Exactly one is expected: a second
 *  upload is a second chance to get `--branch` wrong. */
function uploadAt(): number {
  const found = DEPLOY.steps().flatMap((step, at) => (/\bwrangler\b/.test(step.run ?? '') ? [at] : []));

  expect(found, `expected exactly one wrangler step in ${WORKFLOW}`).toHaveLength(1);

  return found[0]!;
}

/** The step that replaces what Cloudflare serves. */
function upload(): Step {
  return DEPLOY.steps()[uploadAt()]!;
}

/** The `with` block of the step that installs Node. */
function setupNode(): Record<string, unknown> | undefined {
  return DEPLOY.steps().find((step) => step.uses?.startsWith('actions/setup-node@'))?.with;
}

/** `astro.config.mjs` with its comments blanked, so the prose explaining what a
 *  `base` would do to the Guide's links is never mistaken for setting one. */
function astroConfig(): string {
  return readFileSync(join(REPO_ROOT, 'astro.config.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}
