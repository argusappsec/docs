/**
 * Stand-in Token layers, for the tests in this directory only.
 *
 * They are achromatic — black, white, and the grey that sits exactly on the AA
 * threshold — for two reasons. The ratios stay checkable by hand, so a test
 * asserting 4.54 is asserting something a reader can confirm. And the Palette's
 * five values stay where `tokens.css` can be the only file that holds them.
 */

import type { TokenRole } from './stylesheet';

export interface AchromaticOptions {
  /** The Palette property `text` points at. Lower it to break a claim. */
  readonly text?: string;
  /** Tokens to leave undeclared, standing in for a Token deleted from the CSS. */
  readonly omit?: readonly TokenRole[];
}

/**
 * Every pair ADR 0004 claims measures 21 here, so a test only has to spoil the
 * one Token it is about.
 */
export function achromaticTokenLayer({
  text = '--palette-ink',
  omit = [],
}: AchromaticOptions = {}): string {
  const light: Record<TokenRole, string> = {
    bg: 'var(--palette-page)',
    surface: 'white',
    text: `var(${text})`,
    'text-muted': 'color-mix(in oklab, var(--color-text) 65%, var(--color-bg))',
    border: 'color-mix(in oklab, var(--color-text) 20%, var(--color-bg))',
    primary: 'var(--palette-ink)',
    accent: 'var(--palette-page)',
  };

  const declarations = Object.entries(light)
    .filter(([role]) => !omit.includes(role as TokenRole))
    .map(([role, value]) => `      --color-${role}: ${value};`)
    .join('\n');

  return `
    /* @palette */
    :root {
      --palette-ink: #000000;
      --palette-page: #ffffff;
      --palette-fog: #767676;
    }

    /* @tokens light */
    @theme static {
${declarations}
    }

    /* @tokens dark */
    :root:not([data-theme='light']) {
      --color-bg: var(--palette-ink);
      --color-text: var(--palette-page);
      --color-primary: var(--palette-page);
    }
  `;
}
