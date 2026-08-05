import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

import {
  brokenLinks,
  describeBrokenLinks,
  internalLinks,
  type PublishedPage,
  type SiteOutput,
} from './links';

const INDEX = `${sep}index.html`;

/**
 * Reads the built site off disk: the pages whose links are checked, and every
 * path the site serves.
 *
 * The output directory is the whole universe on purpose. It holds the pages
 * Astro rendered *and* the files copied verbatim out of `public/`, so a link to
 * `/.well-known/security.txt` resolves for the same reason `/guide/skills/`
 * does — the deploy uploads this directory and nothing else.
 */
async function readSiteOutput(dir: URL): Promise<SiteOutput> {
  const root = fileURLToPath(dir);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const pages: PublishedPage[] = [];
  const served = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const file = join(entry.parentPath, entry.name);
    const path = `/${relative(root, file).split(sep).join('/')}`;
    served.add(path);

    if (!path.endsWith('.html')) continue;

    // `dist/guide/skills/index.html` is served at `/guide/skills/`, and
    // `dist/404.html` at `/404/`. Both are also reachable without the trailing
    // slash, which is how the Guide's own links are not written but a hand-typed
    // one might be.
    const page = file.endsWith(INDEX)
      ? path.slice(0, -'index.html'.length)
      : `${path.slice(0, -'.html'.length)}/`;

    served.add(page);
    if (page !== '/') served.add(page.slice(0, -1));

    pages.push({ path: page, html: await readFile(file, 'utf8') });
  }

  return { pages, served };
}

/**
 * Fails the build when the site links to a page it does not publish.
 *
 * This is this repository's half of a rule `argus` ADR 0022 states and leaves
 * unenforced; the grep in that repository's CI is the other half. See
 * `./links.ts` for why the check reads the rendered site rather than the Mirror,
 * and ADR 0010 for what that costs.
 *
 * It runs in `astro:build:done`, the last hook of a build and the first moment
 * every page exists. Throwing there fails the build, which is the point: the
 * upload is a later step, so the deployment already running stays up.
 */
export function linkGuard(): AstroIntegration {
  return {
    name: 'argus:link-guard',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const site = await readSiteOutput(dir);

        // An empty tree has no broken links, so a guard that accepted one would
        // pass forever the day the build output moves.
        if (site.pages.length === 0) {
          throw new Error(`Found no pages under ${fileURLToPath(dir)} — nothing was checked.`);
        }

        const links = internalLinks(site.pages);
        const broken = brokenLinks(links, site.served);

        if (broken.length > 0) {
          throw new Error(describeBrokenLinks(broken));
        }

        logger.info(
          `${links.length} internal links resolve across ${site.pages.length} pages (ADR 0022)`,
        );
      },
    },
  };
}
