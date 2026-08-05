import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { HookParameters } from 'astro';
import { beforeAll, describe, expect, it } from 'vitest';

import { linkGuard } from './guard';

let scratch: string;
let fixtureCount = 0;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'argus-links-'));
});

/**
 * Runs the guard over a built site, written to disk exactly as Astro writes one:
 * a directory per page with an `index.html` inside it, and anything out of
 * `public/` copied in beside them.
 */
async function runGuard(output: Record<string, string>): Promise<void> {
  const dir = join(scratch, `dist-${fixtureCount++}`);

  for (const [path, contents] of Object.entries(output)) {
    const file = join(dir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents, 'utf8');
  }

  const done = linkGuard().hooks['astro:build:done']!;

  return done({
    dir: pathToFileURL(`${dir}/`),
    pages: [],
    assets: new Map(),
    logger: { info: () => {} },
  } as unknown as HookParameters<'astro:build:done'>);
}

function page(...hrefs: readonly string[]): string {
  const links = hrefs.map((href) => `<a href="${href}">go</a>`).join('\n');

  return `<!doctype html><html><body>${links}</body></html>`;
}

describe('linkGuard', () => {
  it('lets the build through when every link names a page the site publishes', async () => {
    await expect(
      runGuard({
        'index.html': page('/guide/', '/privacy/'),
        'guide/index.html': page('/guide/configuration/'),
        'guide/configuration/index.html': page('/guide/'),
        'privacy/index.html': page('/guide/'),
      }),
    ).resolves.toBeUndefined();
  });

  it('stops the build, naming the page that carries the link and the slug it asks for', async () => {
    await expect(
      runGuard({
        'index.html': page('/guide/'),
        'guide/index.html': page('/guide/deployment/k8s/'),
      }),
    ).rejects.toThrow(/\/guide\/ → \/guide\/deployment\/k8s\//);
  });

  it('sends the reader upstream, because the Mirror is a copy', async () => {
    await expect(
      runGuard({ 'guide/index.html': page('/guide/gone/') }),
    ).rejects.toThrow(/argusappsec\/argus/);
  });

  it('leaves a third-party link and an anchor alone', async () => {
    await expect(
      runGuard({
        'guide/index.html': page(
          'https://github.com/argusappsec/argus',
          'mailto:security@argusappsec.com',
          '#llm-providers',
        ),
      }),
    ).resolves.toBeUndefined();
  });

  it('passes an anchor into a page that exists', async () => {
    await expect(
      runGuard({
        'guide/llm-providers/index.html': page('/guide/configuration/#llm-providers'),
        'guide/configuration/index.html': page(),
      }),
    ).resolves.toBeUndefined();
  });

  it('passes a link to a file the site serves without rendering it', async () => {
    // `public/` copies through to `dist/` verbatim, so a path served that way is
    // as real as a page — the guard would otherwise fail the footer.
    await expect(
      runGuard({
        'privacy/index.html': page('/.well-known/security.txt', '/argus.svg'),
        '.well-known/security.txt': 'Contact: mailto:security@argusappsec.com',
        'argus.svg': '<svg />',
      }),
    ).resolves.toBeUndefined();
  });

  it('passes the site’s own 404 page, which is a file rather than a directory', async () => {
    await expect(
      runGuard({ '404.html': page('/guide/'), 'guide/index.html': page('/404') }),
    ).resolves.toBeUndefined();
  });

  it('stops the build when it finds no pages at all, rather than checking nothing', async () => {
    // A guard measuring an empty tree is a guard that passes forever. This is
    // the failure the check itself has to survive.
    await expect(runGuard({ 'argus.svg': '<svg />' })).rejects.toThrow(/no pages/);
  });
});
