/**
 * The accessibility claims ADR 0004 makes, and the check that keeps them true.
 *
 * ADR 0004's contrast table is the reason the Tokens are named after roles: no
 * brand colour except the two neutrals reads accessibly on both backgrounds,
 * so `primary` has to flip with the theme. That table is load-bearing, and a
 * table is only load-bearing while somebody is still measuring it.
 *
 * Only pairs the ADR makes a claim about appear here. A `color-mix()`-derived
 * Token — `surface`, `text-muted`, `border` — claims nothing and is asserted
 * nowhere; the checker treats a claim that lands on one as a violation rather
 * than quietly skipping it, so a claim cannot be retired by editing CSS.
 */

import { contrastRatio } from './contrast';
import { resolveToken, type Theme, type TokenLayer, type TokenRole } from './stylesheet';

export interface ContrastClaim {
  readonly theme: Theme;
  readonly foreground: TokenRole;
  readonly background: TokenRole;
  /** The ratio recorded in ADR 0004, to two decimals. */
  readonly ratio: number;
  readonly level: 'AA' | 'AAA';
  /** What the pair is for — the sentence the ADR would give if asked. */
  readonly why: string;
}

export interface ContrastViolation {
  readonly claim: ContrastClaim;
  /** The measured ratio, or `null` when the pair could not be measured at all. */
  readonly measured: number | null;
  readonly detail: string;
}

/**
 * Transcribed from the contrast table in `docs/adr/0004`. Each of its four
 * passing rows is a pair of colours, and becomes two claims here: a colour
 * pair is symmetric, but a pair of Tokens is not — `primary` on `bg` and `bg`
 * on `primary` are different promises about different pixels, and either can
 * be broken on its own by an edit to one theme.
 */
export const ADR_0004_CLAIMS: readonly ContrastClaim[] = [
  {
    theme: 'light',
    foreground: 'text',
    background: 'bg',
    ratio: 14.96,
    level: 'AAA',
    why: 'night on paper — body copy',
  },
  {
    theme: 'dark',
    foreground: 'text',
    background: 'bg',
    ratio: 14.96,
    level: 'AAA',
    why: 'paper on night — body copy',
  },
  {
    theme: 'light',
    foreground: 'primary',
    background: 'bg',
    ratio: 5.68,
    level: 'AA',
    why: 'peacock teal on paper — links and headings',
  },
  {
    theme: 'dark',
    foreground: 'primary',
    background: 'bg',
    ratio: 4.95,
    level: 'AA',
    why: 'verdigris on night — links and headings',
  },
  {
    theme: 'light',
    foreground: 'bg',
    background: 'primary',
    ratio: 5.68,
    level: 'AA',
    why: 'paper on peacock teal — text inverted onto a primary fill',
  },
  {
    theme: 'dark',
    foreground: 'bg',
    background: 'primary',
    ratio: 4.95,
    level: 'AA',
    why: 'night on verdigris — text inverted onto a primary fill',
  },
  {
    theme: 'light',
    foreground: 'text',
    background: 'accent',
    ratio: 8.52,
    level: 'AAA',
    why: 'night on ocellus gold — gold fills in light and carries text',
  },
  {
    theme: 'dark',
    foreground: 'accent',
    background: 'bg',
    ratio: 8.52,
    level: 'AAA',
    why: 'ocellus gold on night — gold speaks in dark',
  },
];

/** Two decimals, matching how ADR 0004 wrote the ratios down. */
function asRecorded(ratio: number): number {
  return Number(ratio.toFixed(2));
}

function claimLabel(claim: ContrastClaim): string {
  return `${claim.theme} · ${claim.foreground} on ${claim.background}`;
}

export function checkContrastClaims(
  layer: TokenLayer,
  claims: readonly ContrastClaim[] = ADR_0004_CLAIMS,
): ContrastViolation[] {
  const violations: ContrastViolation[] = [];

  for (const claim of claims) {
    const unmeasurable: string[] = [];
    const colours = ([claim.foreground, claim.background] as const).map((token) => {
      const resolved = resolveToken(layer, claim.theme, token);
      if (resolved.kind === 'colour') return resolved.rgb;
      unmeasurable.push(
        resolved.kind === 'missing'
          ? `\`${token}\` is not a Token of the ${claim.theme} theme`
          : `\`${token}\` is derived (${resolved.value}) and carries no measurable colour`,
      );
      return null;
    });

    if (unmeasurable.length > 0) {
      violations.push({ claim, measured: null, detail: unmeasurable.join('; ') });
      continue;
    }

    const measured = contrastRatio(colours[0]!, colours[1]!);
    if (asRecorded(measured) < claim.ratio) {
      violations.push({
        claim,
        measured,
        detail: `measured ${asRecorded(measured)}, ADR 0004 records ${claim.ratio} (${claim.level})`,
      });
    }
  }

  return violations;
}

export function describeViolations(violations: readonly ContrastViolation[]): string {
  const lines = violations.map(
    ({ claim, detail }) => `  ${claimLabel(claim)} — ${detail}\n      ${claim.why}`,
  );
  return [
    `${violations.length} contrast claim(s) in ADR 0004 no longer hold:`,
    ...lines,
    'Either restore the Token values or reopen ADR 0004 — the table is the promise, not the CSS.',
  ].join('\n');
}
