import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { describeSync, syncMirror } from './mirror';

/**
 * The Sync's tree logic, against fixture trees: a page added upstream, a page
 * rewritten, a page deleted, and a sibling of the Mirror left alone.
 *
 * Issue #5 asked for these in `node:test`. They are vitest, because `npm test` is
 * vitest and the deploy of ADR 0009 gates on `npm test` — a `node:test` file would
 * satisfy the letter of that line by running nowhere.
 */

let scratch: string;
let fixtureCount = 0;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'argus-sync-'));
});

/** Writes a tree of files, creating the directories they need and nothing else —
 *  so an empty tree leaves no directory behind, which is how the Mirror looks
 *  before it exists at all. */
async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents, 'utf8');
  }
}

/** Every file under a directory, by relative path. A directory that is not there
 *  reads as empty: that is what the Mirror is before the first Sync. */
async function readTree(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  const files: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const file = join(entry.parentPath, entry.name);
    files[relative(root, file).split(sep).join('/')] = await readFile(file, 'utf8');
  }

  return files;
}

/** When each of these files was last written, to nanosecond precision — the only
 *  way to tell a file left alone from one rewritten with the same bytes. */
async function timestamps(root: string, paths: readonly string[]): Promise<Record<string, bigint>> {
  const written: Record<string, bigint> = {};

  for (const path of paths) {
    written[path] = (await stat(join(root, path), { bigint: true })).mtimeNs;
  }

  return written;
}

/**
 * A Guide and a Mirror on disk, laid out the way the two repositories lay them
 * out: the Guide under `docs/guide/` in a checkout of `argusappsec/argus`, and
 * the Mirror as one directory inside this repository's `content/docs/`, where a
 * Translation would sit beside it.
 */
async function fixture(trees: {
  guide: Record<string, string>;
  mirror?: Record<string, string>;
  beside?: Record<string, string>;
}) {
  const root = join(scratch, `case-${fixtureCount++}`);
  const source = join(root, 'argus/docs/guide');
  const content = join(root, 'site/src/content/docs');
  const mirror = join(content, 'guide');

  await writeTree(source, trees.guide);
  await writeTree(mirror, trees.mirror ?? {});
  await writeTree(content, trees.beside ?? {});

  return { source, mirror, content };
}

describe('syncMirror', () => {
  it('copies a page the Guide has and the Mirror does not', async () => {
    const { source, mirror } = await fixture({
      guide: { 'index.md': '# Argus user guide\n', 'channels/slack.md': '# Slack\n' },
      mirror: { 'index.md': '# Argus user guide\n' },
    });

    const change = await syncMirror(source, mirror);

    expect(change.added).toEqual(['channels/slack.md']);
    expect(await readTree(mirror)).toEqual({
      'index.md': '# Argus user guide\n',
      'channels/slack.md': '# Slack\n',
    });
  });

  it('overwrites a page the Guide has rewritten', async () => {
    const { source, mirror } = await fixture({
      guide: { 'skills.md': '# Skills\n\nEleven of them.\n' },
      mirror: { 'skills.md': '# Skills\n\nNine of them.\n' },
    });

    const change = await syncMirror(source, mirror);

    expect(change).toMatchObject({ added: [], changed: ['skills.md'], deleted: [] });
    expect(await readTree(mirror)).toEqual({ 'skills.md': '# Skills\n\nEleven of them.\n' });
  });

  it('deletes a page that has left the Guide, and the directory it emptied', async () => {
    // The reason the Sync is allowed to delete: a page removed upstream would
    // otherwise stay on the site forever, and nobody would ever be told. The
    // emptied directory goes too — a `channels/` with nothing in it is a
    // navigation group waiting to render blank.
    const { source, mirror } = await fixture({
      guide: { 'index.md': '# Argus user guide\n' },
      mirror: {
        'index.md': '# Argus user guide\n',
        'channels/irc.md': '# IRC\n',
        'channels/nested/deep.md': '# Deeper\n',
      },
    });

    const change = await syncMirror(source, mirror);

    expect(change.deleted).toEqual(['channels/irc.md', 'channels/nested/deep.md']);
    expect(await readTree(mirror)).toEqual({ 'index.md': '# Argus user guide\n' });
    await expect(stat(join(mirror, 'channels'))).rejects.toThrow(/ENOENT/);
  });

  it('leaves a sibling of the Mirror byte-for-byte alone', async () => {
    // The Sync deletes, and this is the guarantee that makes that safe: a
    // Translation is a *sibling* directory rather than files interleaved with the
    // Mirror's, so destructive replacement structurally cannot reach one. Nothing
    // here is an exclusion list somebody has to remember to extend.
    const { source, mirror, content } = await fixture({
      guide: { 'index.md': '# Argus user guide\n' },
      mirror: { 'index.md': '# Old\n', 'skills.md': '# Skills\n' },
      beside: { 'it/guide/index.md': '# Guida di Argus\n', 'privacy.md': '# Privacy\n' },
    });

    const before = await timestamps(content, ['it/guide/index.md', 'privacy.md']);

    await syncMirror(source, mirror);

    expect(await readTree(join(content, 'it'))).toEqual({
      'guide/index.md': '# Guida di Argus\n',
    });
    expect(await timestamps(content, ['it/guide/index.md', 'privacy.md'])).toEqual(before);
  });

  it('rewrites nothing when the Mirror already matches the Guide', async () => {
    // The acceptance criterion is that such a run produces no commit. Reporting
    // no change is half of it; not touching the files is the half that would
    // otherwise leave every page in the diff as a mode-and-mtime change.
    const pages = { 'index.md': '# Argus user guide\n', 'channels/mcp.md': '# MCP\n' };
    const { source, mirror } = await fixture({ guide: pages, mirror: pages });

    const before = await timestamps(mirror, Object.keys(pages));
    const change = await syncMirror(source, mirror);

    expect(change).toEqual({ added: [], changed: [], deleted: [] });
    expect(await timestamps(mirror, Object.keys(pages))).toEqual(before);
  });

  it('refuses a Guide with no pages instead of emptying the Mirror', async () => {
    // The Sync's own version of the empty-tree failure the link guard refuses. A
    // Guide moved out of `docs/guide/` upstream would read as "every page was
    // deleted", and the Sync would commit an empty Mirror to a green build.
    const { source, mirror } = await fixture({
      guide: {},
      mirror: { 'index.md': '# Argus user guide\n' },
    });

    await expect(syncMirror(source, mirror)).rejects.toThrow(/no pages/);
    expect(await readTree(mirror)).toEqual({ 'index.md': '# Argus user guide\n' });
  });

  it('names the directory it looked in when the Guide is not there at all', async () => {
    const { source, mirror } = await fixture({ guide: { 'index.md': '#\n' } });

    await expect(syncMirror(join(source, 'missing'), mirror)).rejects.toThrow(/docs\/guide/);
  });

  it('replaces a Mirror seeded by hand, leaving no trace of the bootstrap', async () => {
    // How the Mirror got here: issue #2 copied a few pages in to have something
    // to render. The first real Sync has to end with the Mirror equal to the
    // Guide, whatever the bootstrap happened to leave behind.
    const guide = {
      'index.md': '# Argus user guide\n',
      'skills.md': '# Skills\n',
      'channels/mcp.md': '# MCP\n',
    };
    const { source, mirror } = await fixture({
      guide,
      mirror: { 'index.md': '# Argus user guide (draft)\n', 'scaffold.md': '# Placeholder\n' },
    });

    const change = await syncMirror(source, mirror);

    expect(await readTree(mirror)).toEqual(guide);
    expect(change).toEqual({
      added: ['channels/mcp.md', 'skills.md'],
      changed: ['index.md'],
      deleted: ['scaffold.md'],
    });
  });
});

describe('describeSync', () => {
  it('names every page it touched, because the run’s log is the only reader', async () => {
    const { source, mirror } = await fixture({
      guide: { 'index.md': '# New\n', 'channels/mcp.md': '# MCP\n' },
      mirror: { 'index.md': '# Old\n', 'gone.md': '# Gone\n' },
    });

    const report = describeSync(await syncMirror(source, mirror));

    expect(report).toContain('+ channels/mcp.md');
    expect(report).toContain('~ index.md');
    expect(report).toContain('- gone.md');
  });

  it('says plainly when there was nothing to do', () => {
    expect(describeSync({ added: [], changed: [], deleted: [] })).toMatch(/already matches/);
  });
});
