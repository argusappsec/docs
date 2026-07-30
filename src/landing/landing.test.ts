import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The Landing's rules that a machine can hold it to.
 *
 * Not all of them can be: whether the page restates an Inventory is editorial
 * discipline, and no test will notice a hand-written list of scanners creeping
 * into the prose. What is checkable is the mechanism underneath — that the page
 * reads frontmatter rather than prose, that it ships no island, and that its
 * colour is all Tokens — and that is what is checked here.
 *
 * These read the page's source rather than its behaviour, which is the exception
 * this repository already makes in `tokens.test.ts` for the same reason: every
 * failure below is silent. A dropped animation, a colour written by hand, a
 * second script — none of them turn the build red or look wrong on the page, so
 * the source is the only place the check can stand.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LANDING = 'src/pages/index.astro';

const SOURCE = readFileSync(join(REPO_ROOT, LANDING), 'utf8');

/** Starlight's key for the reader's theme choice, which the Landing shares. */
const THEME_STORAGE_KEY = 'starlight-theme';

describe('the Landing', () => {
  it('never parses the prose body of a Guide page', () => {
    // The Mirror's bodies are somebody else's prose, reformatted upstream at
    // will. Reading one would make this build depend on a table's layout in
    // another repository — so the page reads frontmatter, and this is the rule
    // that says it kept doing so.
    expect(SOURCE).not.toMatch(/\.(?:body|rendered)\b/);
    expect(SOURCE).not.toMatch(/\brender\s*\(/);
  });

  it('ships no component island', () => {
    expect(SOURCE).not.toMatch(/\bclient:(load|idle|visible|only|media)\b/);
  });

  it('carries exactly one script, inline, and it is the theme resolver', () => {
    const scripts = SOURCE.match(/<script[^>]*>/g) ?? [];

    // Zero JavaScript is the rule and the theme is the one exception ADR 0007
    // argues for. A second script has to argue for itself.
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('is:inline');
    expect(SOURCE).toContain(THEME_STORAGE_KEY);
  });

  it('resolves the theme from the key Starlight actually stores it under', () => {
    // The Landing and the Guide have to agree about the reader's choice, and
    // they agree by both reading this one key. Starlight owns it, so it is read
    // out of Starlight here rather than trusted: a rename upstream should fail
    // this test rather than silently split the two halves of the site.
    const components = join(REPO_ROOT, 'node_modules/@astrojs/starlight/components');
    const keys = readdirSync(components)
      .filter((file) => file.endsWith('.astro'))
      .flatMap((file) => [
        ...readFileSync(join(components, file), 'utf8').matchAll(
          /(?:localStorage\.(?:get|set)Item|storageKey =)\s*\(?\s*(?:'([^']+)'|"([^"]+)")/g,
        ),
      ])
      .flatMap(([, single, double]) => [single, double])
      .filter((key): key is string => key !== undefined);

    expect(
      keys,
      'Starlight no longer stores its theme under a literal key here — re-check how the Landing resolves the theme',
    ).not.toHaveLength(0);
    expect(new Set(keys)).toContain(THEME_STORAGE_KEY);
  });

  it('writes down no colour of its own', () => {
    // `tokens.test.ts` already caps the repository's budget of hex literals at
    // the Palette's five. This is the other half: a colour can also arrive as
    // `rgb()` or as a keyword, and neither of those is a Token either.
    const literal =
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch|hwb|color)\(|\b(?:white|black|gray|grey|silver|red|orange|yellow|green|blue|purple|teal|navy|gold)\b/i;

    for (const [property, value] of declarations()) {
      // A mask reads only the alpha channel, so `black` in a mask stop means
      // "opaque here" and paints nothing. Dressing it as a Token would make the
      // rule pass without making the mask any more honest.
      if (property.endsWith('mask') || property.startsWith('mask-')) continue;

      expect(value, `${property}: ${value}`).not.toMatch(literal);
    }
  });

  it('keeps the `animation` shorthand out of any rule that sets a timeline', () => {
    // The build minifies with Lightning CSS, which folds `animation-timeline`
    // into an `animation` shorthand standing in the same rule. The result —
    // `animation: 1s linear both rise view()` — is invalid, because the timeline
    // was removed from that shorthand, so the declaration is dropped and the
    // scroll-driven reveals silently stop happening everywhere. Longhands are
    // what keep them; nothing else in the build would notice.
    const timelined = ruleBodies().filter((body) => body.includes('animation-timeline'));

    expect(timelined, 'no rule sets a timeline — has the reveal moved?').not.toHaveLength(0);

    for (const body of timelined) {
      expect(body.replace(/\s+/g, ' ')).not.toMatch(/(?:^|[\s;])animation\s*:/);
    }
  });

  it('names a Token wherever it paints', () => {
    // The stricter half of the same rule, over the properties that can only be
    // a colour decision: whatever they are set to has to come from a Token.
    const paints = [
      'color',
      'background',
      'background-color',
      'background-image',
      'border',
      'border-block',
      'border-color',
      'border-left',
      'border-top',
      'box-shadow',
      'fill',
      'outline',
      'stroke',
    ];

    for (const [property, value] of declarations()) {
      if (!paints.includes(property)) continue;
      // A shorthand that sets no colour — `border: 0` — decides no colour and so
      // has no Token to name.
      if (/^(?:0|none|inherit|currentcolor|transparent)$/i.test(value)) continue;

      expect(value, `${property}: ${value}`).toMatch(/var\(--color-/);
    }
  });
});

/** The Landing's stylesheet with its comments blanked, so the prose explaining
 *  why gold fills in light is never mistaken for a colour value. */
function stylesheet(): string {
  const style = /<style>([\s\S]*?)<\/style>/.exec(SOURCE)?.[1];
  expect(style, `${LANDING} has no stylesheet`).toBeDefined();

  return style!.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Every declaration in the Landing's stylesheet, as `[property, value]`. */
function declarations(): [string, string][] {
  return [...stylesheet().matchAll(/(?:^|[\s;{])([a-z-]+)\s*:\s*([^;{}]+)/g)].map(
    ([, property, value]) => [property!, value!.trim()],
  );
}

/** Each declaration block on its own — the innermost braces, since a block of
 *  declarations contains no further braces. */
function ruleBodies(): string[] {
  return [...stylesheet().matchAll(/\{([^{}]*)\}/g)].map(([, body]) => body!);
}
