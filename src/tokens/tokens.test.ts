import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ADR_0004_CLAIMS } from './claims';
import { contrastRatio } from './contrast';
import {
  findHexLiterals,
  readTokenLayer,
  resolveToken,
  type Theme,
  type TokenRole,
} from './stylesheet';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOKENS_CSS = 'src/tokens/tokens.css';

const CSS = readFileSync(join(REPO_ROOT, TOKENS_CSS), 'utf8');
const LAYER = readTokenLayer(CSS);

/** ADR 0004's table, which is also the Token layer's whole vocabulary. */
const ROLES: TokenRole[] = ['bg', 'surface', 'text', 'text-muted', 'border', 'primary', 'accent'];

/** The words the Palette uses for its colours. No Token may borrow one. */
const BRAND_WORDS = ['night', 'paper', 'peacock', 'teal', 'verdigris', 'ocellus', 'gold'];

/** WCAG 2 thresholds for body-sized text. A claim has to earn the level it states. */
const WCAG_MINIMUM = { AA: 4.5, AAA: 7 } as const;

describe('the Palette', () => {
  it('is the design system’s entire budget of literal colour values', () => {
    // The brand artwork under `src/assets/` and `public/` is out of scope: it
    // is copied verbatim from `argusappsec/argus`, not authored here, and ADR
    // 0004 accepts it as an asset rather than as part of the Token layer. So
    // is the Mirror, whose prose this repository does not own.
    const literals = sourceFiles().flatMap((file) =>
      findHexLiterals(readFileSync(join(REPO_ROOT, file), 'utf8')).map((hex) => `${file}: ${hex}`),
    );

    expect(literals).toEqual(LAYER.palette.map(({ hex }) => `${TOKENS_CSS}: ${hex}`));
  });

  it('annotates every value with the brand colour it was transcribed from', () => {
    for (const { property, provenance } of LAYER.palette) {
      expect(provenance, property).not.toBe('');
    }
  });

  it('transcribes five distinct colours', () => {
    expect(new Set(LAYER.palette.map(({ hex }) => hex)).size).toBe(5);
  });
});

describe('the Tokens', () => {
  it('names the seven roles ADR 0004 tabulates, and only those', () => {
    expect([...LAYER.declarations.get('light')!.keys()]).toEqual(ROLES);
  });

  it('has no `secondary` — verdigris is `primary` in dark', () => {
    expect(ROLES).not.toContain('secondary');
    expect(CSS).not.toMatch(/--color-secondary/);
  });

  it('names no Token after a brand colour', () => {
    for (const role of ROLES) {
      for (const word of BRAND_WORDS) {
        expect(role, `Token \`${role}\` borrows the Palette's word "${word}"`).not.toContain(word);
      }
    }
  });

  it('changes only the four Tokens the theme actually flips', () => {
    expect([...LAYER.declarations.get('dark')!.keys()]).toEqual([
      'bg',
      'surface',
      'text',
      'primary',
    ]);
  });

  it('derives every Token that is not a Palette value with color-mix()', () => {
    // `surface` in light is the single exception ADR 0004 writes into its own
    // table: white is not a brand colour, so it cannot be mixed out of five
    // that are all darker than paper.
    for (const theme of ['light', 'dark'] as const) {
      for (const [role, value] of LAYER.declarations.get(theme)!) {
        const permitted =
          value.startsWith('var(--palette-') ||
          value.startsWith('color-mix(') ||
          (theme === 'light' && role === 'surface' && value === 'white');

        expect(permitted, `${theme} \`${role}\` is declared as \`${value}\``).toBe(true);
      }
    }
  });
});

describe('the cascade', () => {
  it('declares both Token blocks outside the layers, so specificity decides between them', () => {
    // Tailwind emits `@theme` unlayered. Wrapping the dark override in a layer
    // — any layer — loses to that however specific the selector is, and the
    // symptom is a dark-mode page rendered in light-mode colours.
    expect(depthAt('/* @tokens light */')).toBe(0);
    expect(depthAt('/* @tokens dark */')).toBe(0);
  });

  it('keeps the Starlight mapping in `utilities`, the layer that outranks Starlight’s own', () => {
    expect(CSS).toMatch(/@layer utilities \{[\s\S]*?--sl-color-bg:/);
  });
});

describe('ADR 0004’s contrast table', () => {
  it.each(ADR_0004_CLAIMS)(
    'measures $ratio for $theme $foreground on $background — $why',
    ({ theme, foreground, background, ratio }) => {
      expect(contrastRatio(colourOf(theme, foreground), colourOf(theme, background))).toBeCloseTo(
        ratio,
        2,
      );
    },
  );

  it('claims nothing about a Token that is derived rather than transcribed', () => {
    const claimed = new Set(ADR_0004_CLAIMS.flatMap((c) => [c.foreground, c.background]));

    for (const role of claimed) {
      for (const theme of ['light', 'dark'] as const) {
        expect(resolveToken(LAYER, theme, role), `${theme} \`${role}\``).toMatchObject({
          kind: 'colour',
        });
      }
    }
  });

  it('leaves `surface`, `text-muted` and `border` unasserted', () => {
    const claimed = new Set(ADR_0004_CLAIMS.flatMap((c) => [c.foreground, c.background]));

    expect([...claimed].sort()).toEqual(['accent', 'bg', 'primary', 'text']);
  });

  it('records a ratio that reaches the WCAG level the claim states', () => {
    // Otherwise a row could be labelled AA while recording 3.0, and the build
    // would go on enforcing a number that never passed anything.
    for (const claim of ADR_0004_CLAIMS) {
      expect(claim.ratio, claimTitle(claim)).toBeGreaterThanOrEqual(WCAG_MINIMUM[claim.level]);
    }
  });
});

/**
 * Every file in this repository that could render a colour: its stylesheets,
 * its components and the TypeScript around them. Paths are repo-relative, so a
 * failure says which file overspent the budget.
 */
function sourceFiles(): string[] {
  // Test fixtures are not shipped colour, and neither is what this repository
  // does not author: the Mirror's prose and the brand artwork.
  const excluded = /(^|\/)(content|assets)(\/|$)|(\.test|fixtures)\.ts$/;

  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = relative(REPO_ROOT, join(directory, entry.name));
      if (excluded.test(path)) return [];
      if (entry.isDirectory()) return walk(join(REPO_ROOT, path));
      return /\.(css|ts|astro)$/.test(entry.name) ? [path] : [];
    });

  return [...walk(join(REPO_ROOT, 'src')), 'astro.config.mjs'];
}

/** How many blocks enclose `marker`. Zero means the block sits at top level. */
function depthAt(marker: string): number {
  const blanked = CSS.replace(/\/\*[\s\S]*?\*\//g, (comment) => ' '.repeat(comment.length));
  const upTo = blanked.slice(0, CSS.indexOf(marker));

  return (upTo.match(/\{/g) ?? []).length - (upTo.match(/\}/g) ?? []).length;
}

function claimTitle({ theme, foreground, background }: (typeof ADR_0004_CLAIMS)[number]): string {
  return `${theme} · ${foreground} on ${background}`;
}

function colourOf(theme: Theme, role: TokenRole) {
  const resolved = resolveToken(LAYER, theme, role);
  if (resolved.kind !== 'colour') throw new Error(`${theme} \`${role}\` has no measurable colour`);
  return resolved.rgb;
}
