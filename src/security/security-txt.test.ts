import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The alarm for `public/.well-known/security.txt`.
 *
 * RFC 9116 requires an `Expires` field and means it: past that timestamp the
 * file is stale and a finder is told not to trust what it says. Which makes it
 * the same shape of failure this repository keeps writing tests about — nothing
 * breaks, nothing is logged, and the site quietly publishes an address nobody
 * has confirmed still reaches a person.
 *
 * So the deadline is a test rather than a note. It fails a month early, on
 * purpose: a red build while someone is around to fix it beats a correct build
 * and an expired disclosure contact.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SECURITY_TXT = 'public/.well-known/security.txt';

/** How long before expiry the build starts complaining. */
const NOTICE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

const SOURCE = readFileSync(join(REPO_ROOT, SECURITY_TXT), 'utf8');

/** Field values by lowercased name. Comments are dropped, and a field may
 *  legitimately repeat — `Contact` does, in order of preference. */
function fields(): Map<string, string[]> {
  const found = new Map<string, string[]>();

  for (const line of SOURCE.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;

    const match = /^([A-Za-z-]+):\s*(.+?)\s*$/.exec(line);
    expect(match, `not a field and not a comment: ${line}`).not.toBeNull();

    const [, name, value] = match!;
    found.set(name!.toLowerCase(), [...(found.get(name!.toLowerCase()) ?? []), value!]);
  }

  return found;
}

describe('security.txt', () => {
  it('has not expired, and says so a month before it does', () => {
    const expires = fields().get('expires');

    // RFC 9116: exactly one `Expires`, and a finder must be able to parse it.
    expect(expires, 'no `Expires` field — RFC 9116 requires one').toHaveLength(1);

    const deadline = new Date(expires![0]!);
    expect(deadline.getTime(), `\`Expires\` is not a date: ${expires![0]}`).not.toBeNaN();

    const daysLeft = Math.floor((deadline.getTime() - Date.now()) / DAY);

    expect(
      daysLeft,
      `security.txt expires in ${daysLeft} days. Renew \`Expires\` in ${SECURITY_TXT}, ` +
        'and check that both contacts still reach someone while you are there.',
    ).toBeGreaterThan(NOTICE_DAYS);

    // The other direction: a deadline years out is the same as no deadline, and
    // the RFC asks for less than a year.
    expect(daysLeft, '`Expires` is further out than a year, which the RFC asks it not to be').toBeLessThan(400);
  });

  it('offers at least one contact, and every one of them is reachable as a URI', () => {
    const contacts = fields().get('contact');

    expect(contacts, 'no `Contact` field — it is the one thing the file is for').not.toBeUndefined();

    for (const contact of contacts!) {
      // A bare address is the common mistake: the field takes a URI, so mail
      // needs its scheme.
      expect(contact, `\`Contact\` is not a URI: ${contact}`).toMatch(/^(?:mailto:|https:\/\/|tel:)/);
    }
  });

  it('names the canonical URI the site is actually served from', () => {
    // Read out of the config rather than repeated here, so moving the domain
    // fails this test instead of silently publishing the old one. `Canonical`
    // is what tells a finder the file was not copied from somebody else's site.
    const config = readFileSync(join(REPO_ROOT, 'astro.config.mjs'), 'utf8');
    const site = /site:\s*'([^']+)'/.exec(config)?.[1];

    expect(site, 'no `site` in astro.config.mjs — has ADR 0005 changed?').toBeDefined();
    expect(fields().get('canonical')).toEqual([`${site}/.well-known/security.txt`]);
  });
});
