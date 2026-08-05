import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readWorkflow, type Step } from '../workflows/workflow.ts';
import { MIRROR } from './mirror';

/**
 * The rules the Sync has to keep, read off the workflow that performs it and the
 * script that workflow invokes.
 *
 * Issue #5 asked for the logic as a script rather than as workflow YAML, because
 * a script can be tested; `./mirror.test.ts` is what that bought. What stays in
 * YAML is still load-bearing, and every rule below fails the way this repository
 * keeps writing tests about — quietly. A workflow that stages more than the Mirror
 * commits somebody's Translation, a run that commits without starting a deploy
 * leaves the site frozen while every job goes green, and a second secret in the
 * file looks exactly like no secret at all.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WORKFLOW = '.github/workflows/sync.yml';

/** The workflow that publishes what the Sync commits. ADR 0011: a push made with
 *  the built-in token starts nothing, so the Sync has to start this by name. */
const DEPLOY = '.github/workflows/deploy.yml';

/** The repository that authors the Guide. Hard-coded rather than read out of the
 *  file under test: this is the one fact ADR 0001 gives the Publisher. */
const UPSTREAM = 'argusappsec/argus';

const SYNC = readWorkflow(WORKFLOW);

describe('the sync workflow', () => {
  it('runs on a schedule and by hand, and on nothing else', () => {
    // A `push` trigger is the tempting third one and the dangerous one: this
    // workflow commits and pushes, so on a feature branch it would rewrite that
    // branch's Mirror, and on `main` it would run for every commit that has
    // nothing to do with the Guide.
    expect(Object.keys(SYNC.triggers()).sort()).toEqual(['schedule', 'workflow_dispatch']);
  });

  it('comes round at least once a day', () => {
    const schedule = SYNC.triggers()['schedule'] as { cron?: string }[] | undefined;

    expect(schedule?.length, `no cron in ${WORKFLOW}`).toBeGreaterThan(0);

    for (const { cron } of schedule!) {
      const fields = String(cron).trim().split(/\s+/);

      // Five fields, and the last three unrestricted. This is the typo that would
      // not look like one: `17 */6 1 * *` is a Sync that runs on the first of the
      // month, and a Guide two weeks stale reads exactly like a Guide nobody
      // edited.
      expect(fields, `\`${cron}\` is not a five-field cron`).toHaveLength(5);
      expect(
        fields.slice(2),
        `\`${cron}\` skips days — the Sync would be stale for most of them`,
      ).toEqual(['*', '*', '*']);
    }
  });

  it('is one job, so the order of the steps is the order of the Sync', () => {
    // Everything below reads the steps as a sequence, and that only means
    // something inside a single job. A commit moved to a second job without
    // `needs:` would run beside the script rather than after it, and would commit
    // whatever the Mirror held before.
    expect(
      Object.keys(SYNC.jobs()),
      'more than one job — the ordering below stops meaning anything',
    ).toHaveLength(1);
    expect(scriptAt(), 'the commit runs before the script that produces it').toBeLessThan(commitAt());
  });

  it('reads the Guide from the repository that authors it, and passes it no token', () => {
    const { with: inputs } = upstreamCheckout();

    // Public, per ADR 0002, which is the whole reason no credential exists here.
    // A `token:` would be the first one — and a cross-repository token is what
    // that ADR refuses.
    expect(inputs?.token, `a token for ${UPSTREAM} — it is public, and ADR 0002 wants none`).toBeUndefined();

    // The credential checkout persists by default belongs to *this* repository.
    // Left in a tree that is only ever read, it is a credential sitting where
    // nothing needs one.
    expect(inputs?.['persist-credentials']).toBe(false);
  });

  it('hands the script the checkout it made, and keeps that checkout out of the repository', () => {
    const path = String(upstreamCheckout().with?.path);

    expect(path, `the ${UPSTREAM} checkout has no path of its own`).toBeTruthy();

    // The script takes the checkout root and joins the Guide's own path onto it,
    // so renaming this directory has to break here rather than at 00:17 on a
    // Sunday.
    expect(SYNC.steps()[scriptAt()]?.run).toMatch(new RegExp(`node src/sync/sync\\.ts\\s+${path}\\b`));

    // It lands inside the working tree, which is where actions/checkout requires
    // it. Ignored, so the same command run by hand cannot commit a copy of
    // `argus` into this repository.
    expect(readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8')).toMatch(new RegExp(`^${path}/?$`, 'm'));
  });

  it('names the Mirror in every git command, and reaches nothing else', () => {
    // The sibling guarantee of ADR 0002, spelled a second time where it costs one
    // word: a Translation is a directory beside the Mirror, so a `git` command
    // scoped to the Mirror's path cannot carry one even if the script wrote there.
    //
    // Every one of them, not just the staging. A scoped `git add` with an unscoped
    // commit sweeps up whatever else the index holds — nothing on a runner, and
    // somebody's work in progress the first time these commands are run by hand.
    for (const command of ['git add [^\\n]*', 'git diff --cached --quiet --', 'git commit [^\\n]*--']) {
      expect(commitScript(), `\`${command}\` does not name the Mirror`).toMatch(
        new RegExp(`${command} ${MIRROR}\\b`),
      );
    }
  });

  it('commits nothing, and deploys nothing, when the Mirror already matches', () => {
    const script = commitScript();

    // Staged, then compared. `git diff` alone would miss a page the Guide added,
    // because an untracked file is not a difference until it is staged — and the
    // run would push nothing while reporting success.
    const guard = script.indexOf('git diff --cached --quiet');

    expect(guard, 'no `git diff --cached --quiet` — the commit is unconditional').toBeGreaterThan(-1);
    expect(script.indexOf('git add'), 'the guard reads the index before anything is staged').toBeLessThan(
      guard,
    );

    // Everything the guard exists to skip comes after it.
    for (const after of ['git commit', 'git push', 'gh workflow run']) {
      expect(script.indexOf(after), `\`${after}\` is not behind the guard`).toBeGreaterThan(guard);
    }
  });

  it('starts a deploy that exists and can be started', () => {
    const named = /gh workflow run (\S+)/.exec(commitScript())?.[1];

    expect(named, 'the Sync commits and starts nothing — ADR 0011').toBeDefined();
    expect(DEPLOY.endsWith(`/${named}`), `${named} is not ${DEPLOY}`).toBe(true);

    // The dispatch is an API call against a workflow that has to accept one. If
    // deploy.yml ever drops `workflow_dispatch`, this is a 404 at 00:17 and a site
    // that stops updating; here it is a red test.
    expect(
      Object.keys(readWorkflow(DEPLOY).triggers()),
      `${DEPLOY} no longer accepts a dispatch — the Sync cannot publish what it commits`,
    ).toContain('workflow_dispatch');
  });

  it('takes a token that can write the Mirror and start a workflow, and nothing more', () => {
    // `contents: write` commits, `actions: write` starts the deploy. That second
    // one cannot write code, which is what makes it the small half of ADR 0011's
    // trade. Left implicit, both would follow a repository-wide default that can
    // be widened from a settings page this file cannot see.
    expect(SYNC.document.permissions, 'no explicit permissions block').toEqual({
      contents: 'write',
      actions: 'write',
    });

    // A job's own block *replaces* the one above rather than narrowing it, so the
    // widening would be invisible from the top of the file.
    for (const [name, job] of Object.entries(SYNC.jobs())) {
      expect(
        job.permissions,
        `job \`${name}\` sets its own permissions, which replace the workflow's`,
      ).toBeUndefined();
    }

    // ADR 0002's load-bearing property: no secret exists to create, rotate or
    // leak. The built-in token is spelled `github.token` — reaching for the
    // `secrets` context here means something new is being kept. Read with the
    // comments blanked, so prose *about* a secret is not mistaken for one in use.
    expect([...SYNC.uncommented().matchAll(/secrets\.([A-Z0-9_]+)/g)].map(([, name]) => name)).toEqual([]);
  });

  it('never cancels a Sync that may be mid-commit', () => {
    const { concurrency } = SYNC.document;

    // Two Syncs racing both push to `main`, and the loser fails on a stale ref.
    expect(concurrency?.group, `no concurrency group in ${WORKFLOW}`).toBeDefined();

    // But not by cancelling: a run killed between `git commit` and `git push`
    // leaves the commit on a runner about to be deleted, and the Mirror
    // unpublished until the next run happens to find a difference.
    expect(
      concurrency?.['cancel-in-progress'],
      'a cancelled Sync can lose a commit it already made',
    ).not.toBe(true);
  });

  it('installs nothing, because the Sync imports only what Node ships', () => {
    // The Sync runs before `npm ci` would, and has to: its job is to land the
    // Mirror so that the deploy's build can judge it. A Sync that needed the
    // site's dependency tree would stop landing documentation the day that tree
    // broke.
    for (const step of SYNC.steps()) {
      expect(step.run ?? '', 'the Sync installs dependencies it should not need').not.toMatch(
        /\bnpm (ci|install)\b/,
      );
    }

    for (const file of ['mirror.ts', 'sync.ts']) {
      const imports = [
        ...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/from '([^']+)'/g),
      ].map(([, from]) => from!);

      expect(imports.length, `${file} imports nothing at all`).toBeGreaterThan(0);
      for (const from of imports) {
        expect(from.startsWith('node:') || from.startsWith('./'), `${file} imports ${from}`).toBe(true);
      }
    }

    // And the script is TypeScript run directly, so the Node it runs on has to be
    // one that strips types without a flag.
    expect(nodeVersion(WORKFLOW), `no node-version in ${WORKFLOW}`).toBeDefined();
    expect(
      nodeVersion(WORKFLOW),
      'the Sync and the deploy pin different Nodes — one repository, one Node, moved in both places',
    ).toEqual(nodeVersion(DEPLOY));
  });

  it('knows where the Mirror is', () => {
    // Not a constant compared against itself: the path has to name the directory
    // this site really publishes the Guide from, because the workflow scopes its
    // commit to that same constant. A typo would stage nothing, commit nothing,
    // and report a Mirror already up to date forever.
    const mirrored = readdirSync(join(REPO_ROOT, MIRROR), { recursive: true }).map(String);

    expect(mirrored.filter((path) => path.endsWith('.md')).length, `no pages under ${MIRROR}`).toBeGreaterThan(0);
  });
});

/** The checkout of the repository that is not this one. */
function upstreamCheckout(): Step {
  const found = SYNC.steps().filter((step) => step.with?.repository === UPSTREAM);

  expect(found, `expected exactly one checkout of ${UPSTREAM} in ${WORKFLOW}`).toHaveLength(1);

  return found[0]!;
}

/** Where the script runs among the steps. */
function scriptAt(): number {
  const found = SYNC.steps().flatMap((step, at) =>
    /\bsrc\/sync\/sync\.ts\b/.test(step.run ?? '') ? [at] : [],
  );

  expect(found, `expected exactly one step running the Sync in ${WORKFLOW}`).toHaveLength(1);

  return found[0]!;
}

/** Where the commit sits. Exactly one: a second one is a second chance to stage
 *  something other than the Mirror. */
function commitAt(): number {
  const found = SYNC.steps().flatMap((step, at) => (/\bgit commit\b/.test(step.run ?? '') ? [at] : []));

  expect(found, `expected exactly one committing step in ${WORKFLOW}`).toHaveLength(1);

  return found[0]!;
}

function commit(): Step {
  return SYNC.steps()[commitAt()]!;
}

/** The committing step's shell, with its backslash continuations folded away —
 *  so a rule about a command does not depend on where the line was wrapped. */
function commitScript(): string {
  return (commit().run ?? '').replace(/\\\n\s*/g, ' ');
}

/** The Node a workflow pins, read out of its `setup-node` step. */
function nodeVersion(file: string): unknown {
  return readWorkflow(file)
    .steps()
    .find((step) => step.uses?.startsWith('actions/setup-node@'))?.with?.['node-version'];
}
