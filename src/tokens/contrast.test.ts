import { describe, expect, it } from 'vitest';

import { contrastRatio, parseHexColour } from './contrast';

// The hex strings below are test fixtures, not Palette values: they are the
// achromatic reference points every WCAG implementation is checked against.
// The Palette's own five values live only in `tokens.css`.
const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

describe('parseHexColour', () => {
  it('reads the six-digit form', () => {
    expect(parseHexColour('#0b2239')).toEqual({ r: 11, g: 34, b: 57 });
  });

  it('is case-insensitive', () => {
    expect(parseHexColour('#0B2239')).toEqual(parseHexColour('#0b2239'));
  });

  it('expands the three-digit form', () => {
    expect(parseHexColour('#fff')).toEqual(WHITE);
  });

  it('rejects a value that is not a hex colour', () => {
    expect(() => parseHexColour('color-mix(in oklab, red, blue)')).toThrow(/hex colour/);
  });

  it('rejects a hex colour of the wrong length', () => {
    expect(() => parseHexColour('#0b223')).toThrow(/hex colour/);
  });
});

describe('contrastRatio', () => {
  it('measures the widest possible pair at 21', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
  });

  it('measures a colour against itself at 1', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 10);
  });

  it('is symmetric — WCAG contrast has no foreground or background', () => {
    const gray = parseHexColour('#767676');
    expect(contrastRatio(gray, WHITE)).toBeCloseTo(contrastRatio(WHITE, gray), 10);
  });

  it('measures the WCAG threshold grey against white at 4.5', () => {
    // #767676 is the canonical darkest grey that still passes AA on white.
    expect(contrastRatio(parseHexColour('#767676'), WHITE)).toBeCloseTo(4.54, 2);
  });

  it('applies the sRGB linearisation, not a naive channel average', () => {
    // Mid-grey sits at 50% in sRGB but at ~21.6% relative luminance, which puts
    // it at 5.28 against white rather than the 2-ish a linear model would give.
    expect(contrastRatio(parseHexColour('#808080'), WHITE)).toBeCloseTo(3.95, 2);
  });
});
