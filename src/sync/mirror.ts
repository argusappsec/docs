import { mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

/**
 * The Sync: it replaces the Mirror with the current state of the Guide.
 *
 * The Guide is authored in `argusappsec/argus` and this repository only publishes
 * it, so somebody has to move it. ADR 0002 chose a pull on a schedule; issue #5
 * chose a *script* over logic in workflow YAML, because a workflow cannot be
 * tested and this can. What the workflow keeps is the checkout, the commit and the
 * deploy it starts; everything about which files move is below.
 *
 * It deletes as well as adds, because a page removed upstream would otherwise
 * stay on the site forever with nobody to notice. That is safe for one structural
 * reason: the Mirror is a directory of its own, and a Translation is a sibling of
 * it rather than a file interleaved with its pages. The guarantee comes from the
 * layout, not from an exclusion list somebody has to remember to extend.
 */

/** Where the Guide is authored, inside a checkout of `argusappsec/argus`. */
export const GUIDE = 'docs/guide';

/**
 * Where the Mirror lives here. `docsLoader()` hard-codes its base to
 * `<srcDir>/content/docs` and does not expose it, which is why the Mirror sits at
 * this path and why every Guide URL is prefixed `/guide/`.
 */
export const MIRROR = 'src/content/docs/guide';

/** What the Sync did to the Mirror, as paths relative to the Mirror's root. */
export interface MirrorChange {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly deleted: readonly string[];
}

/** English, so a run's report reads in the order a maintainer would scan. */
const COLLATOR = new Intl.Collator('en');

/**
 * An absent file or directory as an answer rather than a failure: the Mirror does
 * not exist before the first Sync, and the Guide's directory may have moved.
 *
 * Only that one error. A directory this job cannot read, or a page that turns out
 * to be something else, would otherwise arrive as "the Mirror is empty" or "this
 * page is new" — a Sync reporting success while deleting the site.
 */
function whenAbsent<T>(fallback: T): (error: unknown) => T {
  return (error) => {
    if ((error as { code?: string }).code === 'ENOENT') return fallback;

    throw error;
  };
}

/**
 * Every file under a directory, by path relative to it, sorted.
 *
 * A directory that is not there reads as empty, which is the Mirror before the
 * first Sync. Only files are listed: a symlink is neither followed nor copied,
 * because a Mirror is a copy of pages and nothing a link could point at is
 * inside it.
 */
async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(whenAbsent([]));

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort((a, b) => COLLATOR.compare(a, b));
}

/**
 * Removes the directories a deletion emptied, deepest first. An empty
 * `channels/` is a navigation group that renders blank, and git would not
 * record it either way — so what is on disk after a Sync is what a fresh clone
 * would hold.
 */
async function pruneEmptyDirectories(root: string): Promise<void> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(whenAbsent([]));
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort((a, b) => b.length - a.length);

  for (const directory of directories) {
    // Whatever still holds a page stays, and `rmdir` says so by failing.
    await rmdir(directory).catch(() => {});
  }
}

/**
 * Replaces the Mirror with the current state of the Guide, and reports what that
 * cost: the pages added, the pages rewritten, and the pages that have left.
 *
 * A page whose bytes already match is not rewritten. That is what makes a run
 * with nothing to do produce no commit, and it is the reason the return value is
 * a list of paths rather than a count of files copied.
 */
export async function syncMirror(source: string, mirror: string): Promise<MirrorChange> {
  const pages = await filesUnder(source);

  // A Guide moved out of `docs/guide/` upstream reads exactly like a Guide whose
  // every page was deleted, and this Sync commits without review — so it would
  // empty the site and report success. Refusing an empty source is the only place
  // that difference can be caught.
  if (pages.length === 0) {
    throw new Error(
      `Found no pages under ${source} — syncing that would empty the Mirror.\n` +
        'The Guide is authored in `argusappsec/argus` under `docs/guide/`; check whether it ' +
        'still is, and whether the checkout this was pointed at succeeded.',
    );
  }

  const added: string[] = [];
  const changed: string[] = [];

  for (const path of pages) {
    const target = join(mirror, path);
    const page = await readFile(join(source, path));
    const mirrored = await readFile(target).catch(whenAbsent(null));

    if (mirrored?.equals(page)) continue;

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, page);
    (mirrored === null ? added : changed).push(path);
  }

  const upstream = new Set(pages);
  const deleted = (await filesUnder(mirror)).filter((path) => !upstream.has(path));

  for (const path of deleted) {
    await rm(join(mirror, path));
  }

  if (deleted.length > 0) {
    await pruneEmptyDirectories(mirror);
  }

  return { added, changed, deleted };
}

/**
 * A run's report, for the log of a job nobody is watching.
 *
 * It names the pages rather than counting them, because this is where a Sync
 * that quietly rewrote the wrong tree would show itself, and the commit it
 * produces carries only a subject line.
 */
export function describeSync(change: MirrorChange): string {
  const { added, changed, deleted } = change;
  const touched = [
    ...added.map((path) => `  + ${path}`),
    ...changed.map((path) => `  ~ ${path}`),
    ...deleted.map((path) => `  - ${path}`),
  ];

  if (touched.length === 0) {
    return 'The Mirror already matches the Guide — nothing to commit.';
  }

  return [
    `The Mirror now matches the Guide: ${added.length} added, ${changed.length} changed, ${deleted.length} deleted.`,
    ...touched,
  ].join('\n');
}
