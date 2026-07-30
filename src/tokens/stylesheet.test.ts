import { describe, expect, it } from 'vitest';

import { findHexLiterals, readTokenLayer, resolveToken } from './stylesheet';

// A miniature Token layer in the same shape as `tokens.css`, so the reader is
// exercised against the convention rather than against the real file.
const FIXTURE = `
@layer theme {
  /* @palette */
  :root {
    --palette-night: #0b2239; /* night */
    --palette-paper: #f4f7f6; /* paper */
  }

  /* @tokens light */
  @theme {
    --color-bg: var(--palette-paper);
    --color-text: var(--palette-night);
    --color-border: color-mix(in oklab, var(--palette-night) 18%, var(--palette-paper));
    --color-surface: white;
  }

  /* @tokens dark */
  :root:not([data-theme='light']) {
    --color-bg: var(--palette-night);
    --color-text: var(--palette-paper);
  }
}
`;

describe('readTokenLayer', () => {
  it('reads each Palette value with the annotation naming where it came from', () => {
    const { palette } = readTokenLayer(FIXTURE);

    expect(palette).toEqual([
      { property: '--palette-night', hex: '#0b2239', provenance: 'night' },
      { property: '--palette-paper', hex: '#f4f7f6', provenance: 'paper' },
    ]);
  });

  it('keys Tokens by their role, dropping the custom-property prefix', () => {
    const { declarations } = readTokenLayer(FIXTURE);

    expect([...declarations.get('light')!.keys()]).toEqual(['bg', 'text', 'border', 'surface']);
  });

  it('keeps the two themes apart', () => {
    const { declarations } = readTokenLayer(FIXTURE);

    expect(declarations.get('light')!.get('bg')).toBe('var(--palette-paper)');
    expect(declarations.get('dark')!.get('bg')).toBe('var(--palette-night)');
  });

  it('does not mistake a comment for a declaration', () => {
    const { declarations } = readTokenLayer(FIXTURE);

    expect([...declarations.get('dark')!.keys()]).toEqual(['bg', 'text']);
  });
});

describe('resolveToken', () => {
  const layer = readTokenLayer(FIXTURE);

  it('follows a Palette reference to its colour', () => {
    expect(resolveToken(layer, 'light', 'text')).toEqual({
      kind: 'colour',
      rgb: { r: 11, g: 34, b: 57 },
    });
  });

  it('lets dark inherit a Token it does not override', () => {
    expect(resolveToken(layer, 'dark', 'border')).toEqual({
      kind: 'derived',
      value: 'color-mix(in oklab, var(--palette-night) 18%, var(--palette-paper))',
    });
  });

  it('reports a color-mix() Token as derived rather than measuring it', () => {
    expect(resolveToken(layer, 'light', 'border')).toMatchObject({ kind: 'derived' });
  });

  it('reports a value that is neither a Palette reference nor a mix as derived', () => {
    expect(resolveToken(layer, 'light', 'surface')).toEqual({ kind: 'derived', value: 'white' });
  });

  it('reports an unknown Token as missing', () => {
    expect(resolveToken(layer, 'light', 'secondary')).toEqual({ kind: 'missing' });
  });

  it('reports a dangling Palette reference as missing', () => {
    const dangling = readTokenLayer(`
      /* @palette */
      :root {}

      /* @tokens light */
      @theme { --color-primary: var(--palette-verdigris); }
    `);

    expect(resolveToken(dangling, 'light', 'primary')).toEqual({ kind: 'missing' });
  });
});

describe('findHexLiterals', () => {
  it('finds every hex colour written out in full', () => {
    expect(findHexLiterals(FIXTURE)).toEqual(['#0b2239', '#f4f7f6']);
  });

  it('finds a hex colour hidden in a derived Token, so none can slip in unannotated', () => {
    expect(findHexLiterals('@theme { --color-bg: color-mix(in oklab, #fff 50%, #000); }')).toEqual([
      '#fff',
      '#000',
    ]);
  });
});
