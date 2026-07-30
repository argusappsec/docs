import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { HookParameters } from 'astro';
import { beforeAll, describe, expect, it } from 'vitest';

import { achromaticTokenLayer } from './fixtures';
import { contrastGuard } from './guard';

let scratch: string;
let fixtureCount = 0;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'argus-tokens-'));
});

async function runGuard(css: string): Promise<void> {
  const stylesheet = join(scratch, `tokens-${fixtureCount++}.css`);
  await writeFile(stylesheet, css, 'utf8');

  return runSetup(contrastGuard({ stylesheet: pathToFileURL(stylesheet) }));
}

async function runSetup(integration: ReturnType<typeof contrastGuard>): Promise<void> {
  const setup = integration.hooks['astro:config:setup']!;
  await setup({ logger: { info: () => {} } } as unknown as HookParameters<'astro:config:setup'>);
}

describe('contrastGuard', () => {
  it('lets the build through: every claim in ADR 0004 holds against the real Token layer', async () => {
    await expect(runSetup(contrastGuard())).resolves.toBeUndefined();
  });

  it('passes a Token layer that satisfies every claim', async () => {
    await expect(runGuard(achromaticTokenLayer())).resolves.toBeUndefined();
  });

  it('stops the build, naming the offending pair and the ratio it measured', async () => {
    // `text` drops to a mid grey, so `text` on `bg` measures 4.54 where ADR
    // 0004 recorded 14.96.
    await expect(runGuard(achromaticTokenLayer({ text: '--palette-fog' }))).rejects.toThrow(
      /light · text on bg — measured 4\.54, ADR 0004 records 14\.96/,
    );
  });

  it('stops the build when the marker comments are gone, rather than measuring nothing', async () => {
    const unmarked = achromaticTokenLayer().replaceAll(/\/\* @\w+[\w ]*\*\//g, '');

    await expect(runGuard(unmarked)).rejects.toThrow(/is not a Token of the light theme/);
  });
});
