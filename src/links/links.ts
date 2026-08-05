/**
 * The rule that a link inside this site has to name a page this site publishes.
 *
 * `argus` ADR 0022 rewrote the Guide's internal links as root-absolute site
 * paths and left the rule unenforced, noting that the eighteen links it had to
 * remove are evidence of how quickly the rule erodes without a check. This is
 * the half of that check which lives here.
 *
 * It is a guard and not a fixer. Nothing in this repository may edit the Mirror,
 * and a link quietly rewritten to something plausible is worse than a red build:
 * the Sync commits without review, so a warning would have no reader. So the
 * build fails, the previous deploy stays up, and a bad Mirror costs the site its
 * freshness rather than its correctness.
 *
 * What is checked is the *rendered* site rather than the Markdown behind it. A
 * link is broken when a reader clicking it gets a 404, and by the time the pages
 * are written there is no derivation left to get wrong: the anchors are resolved
 * and the pages are the ones that will be uploaded. It also means the Landing's
 * hand-written `/guide/…` links are checked by the same rule as the Guide's own,
 * which matters because a page renamed upstream breaks them silently.
 */

/** One page of the built site: the path it is served at, and its HTML. */
export interface PublishedPage {
  readonly path: string;
  readonly html: string;
}

export interface SiteOutput {
  /** Every page the build wrote. Their links are what gets checked. */
  readonly pages: readonly PublishedPage[];
  /**
   * Every path the site serves. Wider than `pages`: a file copied verbatim out
   * of `public/` is served without being a page, and a page is served both with
   * and without its trailing slash.
   */
  readonly served: ReadonlySet<string>;
}

export interface InternalLink {
  /** The page carrying the link, as the site serves it. */
  readonly page: string;
  /** The link exactly as written, anchor and query included. */
  readonly target: string;
  /** The path it asks the site for, once anchor and query are dropped. */
  readonly path: string;
}

/**
 * `href` on an `<a>`, and only there. `<link rel="canonical">` and the favicon
 * carry an `href` too, and neither is something a reader can follow to a 404.
 * Written to survive attributes on either side of it and a tag broken across
 * lines, which is how a formatter leaves the Landing's markup.
 */
const ANCHOR_HREF = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gis;

/** English, so the report reads in the order a maintainer would scan. */
const COLLATOR = new Intl.Collator('en');

/**
 * Every link on a page that this site is responsible for resolving.
 *
 * A target with a scheme, or one beginning `//`, belongs to somebody else — the
 * Argus repository, a vendor's documentation — and is left alone. So is a
 * relative link: resolving one needs the linking page's own URL, and ADR 0022
 * mandates root-absolute paths upstream, so the form does not occur.
 */
export function anchorTargets(html: string): string[] {
  return [...html.matchAll(ANCHOR_HREF)]
    .map(([, quoted, single]) => (quoted ?? single ?? '').trim())
    .filter((href) => href.startsWith('/') && !href.startsWith('//'));
}

/**
 * The path a link asks the site for. The anchor is dropped rather than checked:
 * where it lands is between the reader and their browser, and a guard that
 * slugified the Guide's headings by hand would start failing on prose this
 * repository does not own.
 */
export function requestedPath(target: string): string {
  const path = target.split(/[#?]/, 1)[0]!;

  return path === '' ? '/' : path;
}

/**
 * Every internal link the site renders, once each. A page writing the same dead
 * link twice is one fix; the same dead link on two pages is two, so the pair is
 * what identifies a link and not the target alone.
 *
 * Sorted, because the order pages are read off disk is the filesystem's business
 * and a build's failure should not depend on it.
 */
export function internalLinks(pages: readonly PublishedPage[]): InternalLink[] {
  const links = new Map<string, InternalLink>();

  for (const page of pages) {
    for (const target of anchorTargets(page.html)) {
      links.set(`${page.path} ${target}`, {
        page: page.path,
        target,
        path: requestedPath(target),
      });
    }
  }

  return [...links.values()].sort(
    (a, b) => COLLATOR.compare(a.page, b.page) || COLLATOR.compare(a.target, b.target),
  );
}

/** The rule itself: a link this site renders and a page it does not publish. */
export function brokenLinks(
  links: readonly InternalLink[],
  served: ReadonlySet<string>,
): InternalLink[] {
  return links.filter((link) => !served.has(link.path));
}

export function describeBrokenLinks(broken: readonly InternalLink[]): string {
  const lines = broken.map(
    ({ page, target, path }) =>
      `  ${page} → ${path}${target === path ? '' : `\n      written as ${target}`}`,
  );

  return [
    `${broken.length} internal link(s) point at a page this site does not publish:`,
    ...lines,
    'A page under /guide/ is authored in `argusappsec/argus` under `docs/guide/` and the',
    'Mirror is only a copy, so a link fixed here is undone by the next Sync. Every other',
    'page is authored in this repository.',
  ].join('\n');
}
