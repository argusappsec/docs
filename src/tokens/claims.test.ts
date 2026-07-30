import { describe, expect, it } from 'vitest';

import { checkContrastClaims, describeViolations, type ContrastClaim } from './claims';
import { achromaticTokenLayer, type AchromaticOptions } from './fixtures';
import { readTokenLayer } from './stylesheet';

function layer(options?: AchromaticOptions) {
  return readTokenLayer(achromaticTokenLayer(options));
}

function claim(over: Partial<ContrastClaim> = {}): ContrastClaim {
  return {
    theme: 'light',
    foreground: 'text',
    background: 'bg',
    ratio: 21,
    level: 'AAA',
    why: 'body copy',
    ...over,
  };
}

describe('checkContrastClaims', () => {
  it('passes a pair that measures what ADR 0004 recorded', () => {
    expect(checkContrastClaims(layer(), [claim()])).toEqual([]);
  });

  it('passes a pair that measures better than recorded', () => {
    expect(checkContrastClaims(layer(), [claim({ ratio: 7 })])).toEqual([]);
  });

  it('fails a pair that no longer reaches its recorded ratio', () => {
    const degraded = checkContrastClaims(layer({ text: '--palette-fog' }), [claim({ ratio: 7 })]);

    expect(degraded).toHaveLength(1);
    expect(degraded[0]!.measured).toBeCloseTo(4.54, 2);
  });

  it('reads the recorded ratio as a two-decimal figure, the way the ADR wrote it', () => {
    // The grey on white measures 4.5407 — an ADR reading "4.54" is satisfied,
    // one reading "4.55" is not. Comparing raw floats would fail both.
    const faded = layer({ text: '--palette-fog' });

    expect(checkContrastClaims(faded, [claim({ ratio: 4.54 })])).toEqual([]);
    expect(checkContrastClaims(faded, [claim({ ratio: 4.55 })])).toHaveLength(1);
  });

  it('checks each theme against its own Token values', () => {
    expect(checkContrastClaims(layer(), [claim({ theme: 'dark' })])).toEqual([]);
  });

  it('fails a claim made about a derived Token, rather than letting it lapse', () => {
    const lapsed = checkContrastClaims(layer(), [claim({ foreground: 'border' })]);

    expect(lapsed).toHaveLength(1);
    expect(lapsed[0]!.measured).toBeNull();
    expect(lapsed[0]!.detail).toMatch(/color-mix/);
  });

  it('fails a claim about a Token that has been deleted from the stylesheet', () => {
    const gone = checkContrastClaims(layer({ omit: ['accent'] }), [claim({ background: 'accent' })]);

    expect(gone).toHaveLength(1);
    expect(gone[0]!.detail).toMatch(/`accent` is not a Token of the light theme/);
  });

  it('reports every violation, not just the first', () => {
    const violations = checkContrastClaims(layer({ text: '--palette-fog' }), [
      claim({ ratio: 7 }),
      claim({ foreground: 'border' }),
    ]);

    expect(violations).toHaveLength(2);
  });
});

describe('describeViolations', () => {
  it('names the offending pair, its theme and its measured ratio', () => {
    const message = describeViolations(
      checkContrastClaims(layer({ text: '--palette-fog' }), [claim({ ratio: 7 })]),
    );

    expect(message).toContain('light');
    expect(message).toContain('text on bg');
    expect(message).toContain('4.54');
    expect(message).toContain('7');
    expect(message).toContain('ADR 0004');
  });
});
