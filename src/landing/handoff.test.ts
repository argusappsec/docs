import { describe, expect, it } from 'vitest';

import { guideHandoff, type MirrorPage } from './handoff';

/**
 * A Mirror page as the content collection hands it over: an id and the
 * frontmatter. The ids are the real ones — `guide` for the Guide's own front
 * page, `guide/<path>` for everything else — because the hrefs the Landing
 * renders are derived from them.
 */
function page(id: string, data: Partial<MirrorPage['data']> = {}): MirrorPage {
  return { id, data: { title: id, ...data } };
}

describe('the Guide handoff', () => {
  it('makes the Guide’s own front page the overview, at the Guide’s root', () => {
    const { overview, pages } = guideHandoff([page('guide', { title: 'Argus user guide' })]);

    expect(overview).toEqual({ href: '/guide/', title: 'Argus user guide' });
    expect(pages).toEqual([]);
  });

  it('gives every other page the URL the Guide’s own internal links use', () => {
    const { pages } = guideHandoff([page('guide/channels/github', { title: 'GitHub channel' })]);

    expect(pages).toEqual([{ href: '/guide/channels/github/', title: 'GitHub channel' }]);
  });

  it('carries the title and description across verbatim', () => {
    const { pages } = guideHandoff([
      page('guide/skills', { title: 'Skills', description: 'Using, writing and overriding them.' }),
    ]);

    expect(pages[0]).toEqual({
      href: '/guide/skills/',
      title: 'Skills',
      description: 'Using, writing and overriding them.',
    });
  });

  it('orders pages by the order the Guide’s frontmatter gives', () => {
    // The property this buys: a page added upstream arrives in the right place
    // with no edit here. Declared out of order so the sort is doing the work.
    const { pages } = guideHandoff([
      page('guide/skills', { sidebar: { order: 50 } }),
      page('guide/getting-started', { sidebar: { order: 10 } }),
      page('guide/configuration', { sidebar: { order: 20 } }),
    ]);

    expect(pages.map(({ href }) => href)).toEqual([
      '/guide/getting-started/',
      '/guide/configuration/',
      '/guide/skills/',
    ]);
  });

  it('sends an unordered page to the end, and breaks a tie by id', () => {
    // Starlight's own rule, so the Landing's reading order cannot disagree with
    // the sidebar the reader meets on the next page.
    const { pages } = guideHandoff([
      page('guide/zebra'),
      page('guide/alpaca'),
      page('guide/beta', { sidebar: { order: 20 } }),
      page('guide/alpha', { sidebar: { order: 20 } }),
    ]);

    expect(pages.map(({ href }) => href)).toEqual([
      '/guide/alpha/',
      '/guide/beta/',
      '/guide/alpaca/',
      '/guide/zebra/',
    ]);
  });

  it('leaves out a page the Guide marked as a draft', () => {
    const { pages } = guideHandoff([page('guide/half-written', { draft: true })]);

    expect(pages).toEqual([]);
  });

  it('leaves out a page the Guide hides from its own navigation', () => {
    const { pages } = guideHandoff([page('guide/aside', { sidebar: { hidden: true } })]);

    expect(pages).toEqual([]);
  });

  it('ignores anything outside the Mirror', () => {
    // Translations land as siblings of the Mirror (ADR 0002), and a Translation
    // is not something the Landing links to while no locale exists.
    const { overview, pages } = guideHandoff([
      page('it/guide/getting-started'),
      page('guide-for-contributors'),
    ]);

    expect({ overview, pages }).toEqual({ overview: null, pages: [] });
  });

  it('survives a Mirror with nothing in it', () => {
    // The build fails on a broken Mirror for better reasons than this one; the
    // Landing still has no business throwing while it does.
    expect(guideHandoff([])).toEqual({ overview: null, pages: [] });
  });

  it('reads the frontmatter and nothing else', () => {
    // The rule the whole handoff exists to keep: Inventories live in the prose
    // bodies of Guide pages, which this repository does not own and which are
    // reformatted freely upstream. Frontmatter is schema-validated; a body is
    // somebody else's table formatting.
    const withBody = {
      ...page('guide/configuration', { title: 'Configuration' }),
      body: '| Key | Default |\n| --- | --- |\n| `provider.type` | `gemini` |',
      rendered: { html: '<table><tr><td>provider.type</td></tr></table>' },
    };

    const { pages } = guideHandoff([withBody]);

    expect(pages).toEqual([{ href: '/guide/configuration/', title: 'Configuration' }]);
  });
});
