/**
 * WCAG 2 contrast, as the build measures it.
 *
 * ADR 0004 records a contrast ratio next to each Token pair that carries an
 * accessibility claim. Those numbers were measured once, by hand; this module
 * is what lets the build measure them again on every run, so a Palette value
 * edited in this repository cannot quietly invalidate the table.
 */

/** An opaque sRGB colour. Channels are 0–255. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Reads `#rgb` or `#rrggbb`. Throws on anything else — including the
 * `color-mix()` values the Token layer uses for derived Tokens, which by
 * design carry no claim and must never be silently measured as something else.
 */
export function parseHexColour(value: string): Rgb {
  const hex = value.trim();
  if (!HEX.test(hex)) {
    throw new Error(`Not a hex colour: ${value}`);
  }
  const digits =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((d) => d + d)
          .join('')
      : hex.slice(1);
  const channels = parseInt(digits, 16);
  return { r: (channels >> 16) & 0xff, g: (channels >> 8) & 0xff, b: channels & 0xff };
}

/** WCAG 2 relative luminance: sRGB channels linearised, then weighted. */
function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG 2 contrast ratio, between 1 and 21. Symmetric: which colour is the
 * foreground is a fact about the design, not about the measurement.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [darker, lighter] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => x - y);
  return (lighter! + 0.05) / (darker! + 0.05);
}
