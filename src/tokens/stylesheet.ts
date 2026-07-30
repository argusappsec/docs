/**
 * Reads the Token layer out of `tokens.css`.
 *
 * The stylesheet is the single source: the Palette is transcribed there and
 * nowhere else, so the build's contrast check has to read CSS rather than a
 * TypeScript copy of it — a copy would be a sixth, seventh and eighth literal
 * that could drift away from the values actually shipped.
 *
 * Parsing is deliberately shallow. Three annotation comments — `@palette`,
 * `@tokens light`, `@tokens dark` — name the blocks that matter, so the reader
 * never has to understand selectors, at-rules or the cascade.
 */

import { parseHexColour, type Rgb } from './contrast';

export type Theme = 'light' | 'dark';

/** The roles ADR 0004 tabulates. `tokens.css` declares these and no others. */
export type TokenRole =
  | 'bg'
  | 'surface'
  | 'text'
  | 'text-muted'
  | 'border'
  | 'primary'
  | 'accent';

/** One of the five hand-transcribed brand colours. */
export interface PaletteColour {
  /** The custom property it is bound to, e.g. `--palette-night`. */
  readonly property: string;
  readonly hex: string;
  /** The trailing annotation: the brand colour this value was copied from. */
  readonly provenance: string;
}

export interface TokenLayer {
  readonly palette: readonly PaletteColour[];
  /** Per theme: Token role (`bg`, `primary`, …) to its declared value. */
  readonly declarations: ReadonlyMap<Theme, ReadonlyMap<string, string>>;
}

/**
 * What a Token turns out to be once its Palette reference is followed.
 * `derived` covers every value the checker refuses to measure — a
 * `color-mix()`, a bare keyword — which is what keeps a derived Token from
 * accidentally acquiring an accessibility claim it was never given.
 */
export type Resolution =
  | { readonly kind: 'colour'; readonly rgb: Rgb }
  | { readonly kind: 'derived'; readonly value: string }
  | { readonly kind: 'missing' };

const PALETTE_PREFIX = '--palette-';
const TOKEN_PREFIX = '--color-';

/** `--name: value;` plus the same-line trailing comment, when there is one. */
const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);(?:[^\S\n]*\/\*(.*?)\*\/)?/g;
/** Every hex form CSS accepts, not only the two `parseHexColour` can read. */
const HEX_LITERAL = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi;
const PALETTE_REFERENCE = /^var\(\s*(--palette-[\w-]+)\s*\)$/;

/**
 * Returns the text between the braces of the first block following `marker`.
 * Brace-matched rather than lazily matched to `}`, so a nested rule cannot
 * truncate the block.
 */
function blockAfter(css: string, marker: string): string {
  const markerAt = css.indexOf(marker);
  if (markerAt === -1) return '';

  const open = css.indexOf('{', markerAt);
  if (open === -1) return '';

  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

function declarationsIn(block: string, prefix: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, property, value] of block.matchAll(DECLARATION)) {
    if (property!.startsWith(prefix)) {
      found.set(property!.slice(prefix.length), value!.trim());
    }
  }
  return found;
}

export function readTokenLayer(css: string): TokenLayer {
  const paletteBlock = blockAfter(css, '/* @palette */');
  const palette: PaletteColour[] = [];
  for (const [, property, value, annotation] of paletteBlock.matchAll(DECLARATION)) {
    if (!property!.startsWith(PALETTE_PREFIX)) continue;
    palette.push({
      property: property!,
      hex: value!.trim(),
      provenance: (annotation ?? '').trim(),
    });
  }

  return {
    palette,
    declarations: new Map<Theme, ReadonlyMap<string, string>>([
      ['light', declarationsIn(blockAfter(css, '/* @tokens light */'), TOKEN_PREFIX)],
      ['dark', declarationsIn(blockAfter(css, '/* @tokens dark */'), TOKEN_PREFIX)],
    ]),
  };
}

/**
 * Resolves a Token to the colour it renders as in `theme`. Dark falls back to
 * light for anything it does not override, mirroring the cascade: a Token
 * whose value is the same in both themes is declared once.
 */
export function resolveToken(layer: TokenLayer, theme: Theme, token: string): Resolution {
  const declared =
    layer.declarations.get(theme)?.get(token) ?? layer.declarations.get('light')?.get(token);
  if (declared === undefined) return { kind: 'missing' };

  const reference = PALETTE_REFERENCE.exec(declared);
  if (!reference) return { kind: 'derived', value: declared };

  const colour = layer.palette.find((entry) => entry.property === reference[1]);
  if (!colour) return { kind: 'missing' };

  return { kind: 'colour', rgb: parseHexColour(colour.hex) };
}

/**
 * Every hex colour written out in a stylesheet, wherever it appears. ADR 0004
 * allows the design system exactly five, one per brand colour; this is how
 * that budget is counted.
 */
export function findHexLiterals(css: string): string[] {
  return [...css.matchAll(HEX_LITERAL)].map(([hex]) => hex);
}
