import { describe, expect, it } from 'vitest';

import {
  anchorTargets,
  brokenLinks,
  describeBrokenLinks,
  internalLinks,
  requestedPath,
  type SiteOutput,
} from './links';

/**
 * A built site, as the walk over `dist/` hands it over: pages carrying HTML,
 * and every path the site serves. The two are separate because a path can be
 * served without being a page — `/argus.svg` is a file copied verbatim — and
 * because a page carrying a link is what the failure has to name.
 */
function site(pages: Record<string, string>, files: readonly string[] = []): SiteOutput {
  const paths = Object.keys(pages);

  return {
    pages: paths.map((path) => ({ path, html: pages[path]! })),
    served: new Set([...paths, ...paths.map((path) => path.replace(/\/$/, '')), ...files]),
  };
}

function link(href: string): string {
  return `<p>See <a href="${href}">the other page</a>.</p>`;
}

/** What the guard asks of a finished build, composed the same way it composes it. */
function brokenIn({ pages, served }: SiteOutput) {
  return brokenLinks(internalLinks(pages), served);
}

describe('reading the links out of a rendered page', () => {
  it('finds a root-absolute link', () => {
    expect(anchorTargets(link('/guide/configuration/'))).toEqual(['/guide/configuration/']);
  });

  it('finds every link on the page, in the order they were written', () => {
    const html = `${link('/guide/skills/')}${link('/privacy/')}`;

    expect(anchorTargets(html)).toEqual(['/guide/skills/', '/privacy/']);
  });

  it('reads an anchor whose href is not its first attribute, or is single-quoted', () => {
    const html = `<a class="nav-link" data-x='1' href='/guide/'>Docs</a>`;

    expect(anchorTargets(html)).toEqual(['/guide/']);
  });

  it('reads an anchor broken across lines, the way a formatter leaves it', () => {
    const html = '<a\n  class="button"\n  href="/guide/getting-started/"\n>Start</a>';

    expect(anchorTargets(html)).toEqual(['/guide/getting-started/']);
  });

  it('leaves a third-party site alone', () => {
    // The Argus repository is the link this rule exists for: it is written on
    // the Landing and in the Guide, and it is not this site's to resolve.
    const html = `${link('https://github.com/argusappsec/argus')}${link('//example.com/x')}`;

    expect(anchorTargets(html)).toEqual([]);
  });

  it('leaves a mailto: address alone', () => {
    expect(anchorTargets(link('mailto:security@argusappsec.com'))).toEqual([]);
  });

  it('leaves an anchor within the page alone', () => {
    expect(anchorTargets(link('#llm-providers'))).toEqual([]);
  });

  it('leaves a relative link alone', () => {
    // ADR 0022 upstream mandates root-absolute paths, so a relative link is not
    // a form the Guide contains — and resolving one needs the page's own URL,
    // which is knowledge this check deliberately does not carry.
    expect(anchorTargets(link('../configuration/'))).toEqual([]);
  });

  it('ignores an href that is not a link', () => {
    // The favicon and the canonical URL are `href` too, and neither is a link a
    // reader can follow to a 404.
    const html = '<link rel="icon" href="/argus.svg"><link rel="canonical" href="/nowhere/">';

    expect(anchorTargets(html)).toEqual([]);
  });
});

describe('resolving a link to the path it asks the site for', () => {
  it('drops the anchor, so a heading on a real page is a real link', () => {
    expect(requestedPath('/guide/configuration/#llm-providers')).toBe('/guide/configuration/');
  });

  it('drops a query string', () => {
    expect(requestedPath('/guide/?q=skills')).toBe('/guide/');
  });

  it('reads a bare anchor on the site root as the root', () => {
    expect(requestedPath('/#reviews')).toBe('/');
  });

  it('leaves a plain path as it was written', () => {
    expect(requestedPath('/privacy/')).toBe('/privacy/');
  });
});

describe('the internal links of a built site', () => {
  it('passes a link to a page the site publishes', () => {
    const built = site({
      '/guide/': link('/guide/configuration/'),
      '/guide/configuration/': '<p>The reference.</p>',
    });

    expect(brokenIn(built)).toEqual([]);
  });

  it('reports a link to a slug the site does not publish, naming the page and the target', () => {
    const built = site({ '/guide/getting-started/': link('/guide/deployment/k8s/') });

    expect(brokenIn(built)).toEqual([
      {
        page: '/guide/getting-started/',
        target: '/guide/deployment/k8s/',
        path: '/guide/deployment/k8s/',
      },
    ]);
  });

  it('keeps the link as it was written, next to what it resolved to', () => {
    const built = site({ '/guide/': link('/guide/gone/#step-2') });

    expect(brokenIn(built)[0]).toEqual({
      page: '/guide/',
      target: '/guide/gone/#step-2',
      path: '/guide/gone/',
    });
  });

  it('passes an anchor into a page that exists', () => {
    const built = site({
      '/guide/llm-providers/': link('/guide/configuration/#llm-providers'),
      '/guide/configuration/': '<h2 id="llm-providers">LLM providers</h2>',
    });

    expect(brokenIn(built)).toEqual([]);
  });

  it('says nothing about an anchor that names no heading', () => {
    // Where an anchor points is between the reader and their browser: a page
    // renders headings from prose this repository does not own, and a guard
    // that slugified them by hand would fail on the Guide's next `:::note`.
    const built = site({
      '/guide/skills/': link('/guide/configuration/#not-a-heading-on-that-page'),
      '/guide/configuration/': '<p>No such heading.</p>',
    });

    expect(brokenIn(built)).toEqual([]);
  });

  it('passes a page served without a trailing slash', () => {
    const built = site({ '/guide/': link('/privacy'), '/privacy/': '<p>Privacy.</p>' });

    expect(brokenIn(built)).toEqual([]);
  });

  it('passes a link to a file the site serves verbatim', () => {
    const built = site({ '/privacy/': link('/.well-known/security.txt') }, [
      '/.well-known/security.txt',
    ]);

    expect(brokenIn(built)).toEqual([]);
  });

  it('reports a broken link once, however many times the page writes it', () => {
    const built = site({ '/guide/': `${link('/guide/gone/')}${link('/guide/gone/')}` });

    expect(brokenIn(built)).toHaveLength(1);
  });

  it('reports the same target on two pages separately, because each is its own fix', () => {
    const built = site({ '/guide/': link('/guide/gone/'), '/privacy/': link('/guide/gone/') });

    expect(brokenIn(built).map(({ page }) => page)).toEqual(['/guide/', '/privacy/']);
  });

  it('reports in a stable order, whatever order the build wrote the files in', () => {
    const pages = ['/privacy/', '/guide/', '/guide/skills/'];
    const built = site(Object.fromEntries(pages.map((path) => [path, link('/guide/gone/')])));
    const reversed: SiteOutput = { ...built, pages: [...built.pages].reverse() };

    expect(brokenIn(reversed).map(({ page }) => page)).toEqual(
      brokenIn(built).map(({ page }) => page),
    );
  });
});

describe('the failure the build prints', () => {
  it('names every broken link, and where the page it lives on is authored', () => {
    const message = describeBrokenLinks([
      { page: '/guide/getting-started/', target: '/guide/gone/#helm', path: '/guide/gone/' },
    ]);

    expect(message).toContain('/guide/getting-started/');
    expect(message).toContain('/guide/gone/');
    expect(message).toContain('/guide/gone/#helm');
    // The Mirror is read-only: a fix applied here is overwritten by the next
    // Sync, so the message has to send the reader upstream.
    expect(message).toContain('argusappsec/argus');
  });
});
