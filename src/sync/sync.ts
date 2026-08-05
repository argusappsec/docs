import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The `.ts` on the import is what lets `node src/sync/sync.ts` resolve it: Node
// strips the types and runs the file, so the Sync needs no build step and no
// install. `allowImportingTsExtensions` in Astro's own tsconfig is what makes the
// same spelling typecheck.
import { describeSync, GUIDE, MIRROR, syncMirror } from './mirror.ts';

/**
 * The Sync, as `.github/workflows/sync.yml` runs it:
 *
 *     node src/sync/sync.ts <path to a checkout of argusappsec/argus>
 *
 * A checkout is the argument because a checkout is what the workflow has. Where
 * the Guide sits inside it, and where the Mirror sits inside this repository, are
 * both layout facts and both live in `./mirror.ts` beside the logic — issue #5
 * asked for a script rather than YAML so that the half worth testing could be
 * tested, and a path spelled twice is a path that will eventually disagree.
 *
 * The workflow spells the Mirror's path once more, in the pathspec that scopes its
 * commit to it, and `./sync.test.ts` holds that spelling to the constant below.
 *
 * The Mirror is resolved from this file's own location rather than the working
 * directory: the workflow's step and a developer's shell start in different
 * places, and a Sync that wrote a `src/content/docs/guide/` under whichever
 * directory it was invoked from would report success either way.
 *
 * Nothing outside `node:` is imported, which is what lets this run before `npm
 * ci` would — the Sync lands the Mirror, and the deploy's build is what judges
 * it.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const [checkout] = process.argv.slice(2);

if (checkout === undefined) {
  console.error('usage: node src/sync/sync.ts <path to a checkout of argusappsec/argus>');
  process.exit(2);
}

try {
  console.log(describeSync(await syncMirror(join(checkout, GUIDE), join(REPO_ROOT, MIRROR))));
} catch (error) {
  // The message, not the stack: what goes wrong here is a path that no longer
  // holds the Guide, and `./mirror.ts` writes that sentence for a reader who is
  // scrolling a job log.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
