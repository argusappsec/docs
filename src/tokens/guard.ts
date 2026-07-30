import { readFile } from 'node:fs/promises';

import type { AstroIntegration } from 'astro';

import { ADR_0004_CLAIMS, checkContrastClaims, describeViolations } from './claims';
import { readTokenLayer } from './stylesheet';

const TOKEN_LAYER = new URL('./tokens.css', import.meta.url);

export interface ContrastGuardOptions {
  /** The Token layer to measure. Overridden only by this module's own tests. */
  readonly stylesheet?: URL;
}

/**
 * Fails the build when the Token layer stops honouring ADR 0004.
 *
 * The ADR's contrast table was measured by hand, once. Everything downstream
 * of it — role naming, `primary` flipping with the theme, gold filling instead
 * of speaking in light — is an argument built on those numbers, so a Palette
 * value edited here has to be caught rather than discovered on the site.
 *
 * It runs in `astro:config:setup`, which is the first hook of both `dev` and
 * `build`: the failure arrives before a single page is rendered.
 */
export function contrastGuard({
  stylesheet = TOKEN_LAYER,
}: ContrastGuardOptions = {}): AstroIntegration {
  return {
    name: 'argus:contrast-guard',
    hooks: {
      'astro:config:setup': async ({ logger }) => {
        const layer = readTokenLayer(await readFile(stylesheet, 'utf8'));
        const violations = checkContrastClaims(layer);

        if (violations.length > 0) {
          throw new Error(describeViolations(violations));
        }

        logger.info(`${ADR_0004_CLAIMS.length} contrast claims hold (ADR 0004)`);
      },
    },
  };
}
