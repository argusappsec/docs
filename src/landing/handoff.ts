/**
 * The Landing's handoff to the Guide, built from the Mirror's frontmatter.
 *
 * The Landing may restate the Argument and must never restate an Inventory, and
 * the list of Guide pages is the one enumeration it needs: a reader who is
 * convinced has to be told where to read next. So it is not written down here —
 * it is read from the Mirror, and a page added, renamed or removed upstream
 * changes the Landing on the next Sync with no edit in this repository.
 *
 * Only frontmatter is read. Inventories live in the prose bodies of Guide
 * pages, which this repository does not own and which are reformatted freely
 * upstream; frontmatter is schema-validated by Starlight, so it is the one part
 * of a Guide page this repository can depend on without depending on somebody
 * else's table formatting. Hence the parameter type below: it describes
 * frontmatter and an id, and a body it cannot see is a body it cannot parse.
 */

/** The Mirror's directory inside the `docs` collection, and the Guide's URL prefix. */
const MIRROR = 'guide';

/** Where the Guide starts. Exported so the prefix is written down once. */
export const GUIDE_ROOT = `/${MIRROR}/`;

/** English, because the Mirror is English. A Translation would sort in its own. */
const COLLATOR = new Intl.Collator('en');

/** The frontmatter fields the Landing reads. A subset of Starlight's own schema. */
export interface MirrorFrontmatter {
  readonly title: string;
  readonly description?: string | undefined;
  readonly draft?: boolean | undefined;
  readonly sidebar?:
    | {
        readonly order?: number | undefined;
        readonly hidden?: boolean | undefined;
      }
    | undefined;
}

/** A page of the Mirror, as the `docs` collection hands it over. */
export interface MirrorPage {
  readonly id: string;
  readonly data: MirrorFrontmatter;
}

export interface GuideLink {
  /** Root-absolute and trailing-slashed, the form the Guide's own links use. */
  readonly href: string;
  readonly title: string;
  readonly description?: string | undefined;
}

export interface GuideHandoff {
  /** The Guide's own front page, or `null` if the Mirror has none. */
  readonly overview: GuideLink | null;
  /** Every other page of the Mirror, in the Guide's own order. */
  readonly pages: readonly GuideLink[];
}

/**
 * Starlight's sorting rule, mirrored: ascending `sidebar.order`, a page without
 * one last, ties broken by id. The Landing shows a flat list where the sidebar
 * shows a tree, so the two cannot be the same code — but they must not disagree
 * about reading order, because the reader meets the sidebar on the next page.
 */
function byGuideOrder(a: MirrorPage, b: MirrorPage): number {
  const order = (page: MirrorPage) => page.data.sidebar?.order ?? Number.MAX_VALUE;

  return order(a) - order(b) || COLLATOR.compare(a.id, b.id);
}

/**
 * The id *is* the URL path: the loader strips `index` from the Guide's front
 * page, so its id is `guide` and its href is the Guide's root.
 */
function linkTo({ id, data }: MirrorPage): GuideLink {
  return {
    href: `/${id}/`,
    title: data.title,
    ...(data.description === undefined ? {} : { description: data.description }),
  };
}

/**
 * A page the Guide keeps out of its own navigation, or has not finished
 * writing, is not a page to send a first-time reader to.
 */
function isPublished({ data }: MirrorPage): boolean {
  return data.draft !== true && data.sidebar?.hidden !== true;
}

export function guideHandoff(entries: readonly MirrorPage[]): GuideHandoff {
  // A Translation lands as a sibling of the Mirror, so an id outside it is not
  // the Guide — and while no locale exists, not something the Landing links to.
  const mirrored = entries.filter(
    (entry) => entry.id === MIRROR || entry.id.startsWith(`${MIRROR}/`),
  );

  const overview = mirrored.find((entry) => entry.id === MIRROR);
  const pages = mirrored
    .filter((entry) => entry.id !== MIRROR && isPublished(entry))
    .sort(byGuideOrder);

  return {
    overview: overview ? linkTo(overview) : null,
    pages: pages.map(linkTo),
  };
}
