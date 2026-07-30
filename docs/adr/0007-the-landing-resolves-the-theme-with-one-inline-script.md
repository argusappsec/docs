# ADR 0007 — The Landing resolves the theme with one inline script

**Status:** Accepted
**Date:** 2026-07-30

## Context

The Landing is a plain Astro page with zero JavaScript by default — that is how
both ADR 0003 and the issue that specified it word the requirement. It therefore
sits outside Starlight's layout, and the theme is the one thing it loses by
sitting there.

Verified against the installed Starlight 0.41.5:

- The theme is applied by `data-theme` on `<html>`, set by an inline script in
  `components/ThemeProvider.astro`, which only Starlight's own page layout
  renders. Nothing sets the attribute on a route Starlight does not own.
- The reader's choice is stored in `localStorage` under `starlight-theme`, and
  "auto" is stored as `''` — so an empty value correctly falls through to the
  operating system's preference.
- The Token layer's dark block matches `:root:not([data-theme='light'])`, which
  is deliberate: it agrees with Starlight's own stylesheet about what a document
  with no attribute looks like.

Put together: with no script on the Landing, the attribute is never set, and the
Landing is **dark for every reader** — including one who selected light in the
Guide two clicks earlier, and one whose operating system asks for light. The
site would contradict its reader on its first page.

## Decision

**The Landing carries one inline script, in the head, and it is the same
expression Starlight's `ThemeProvider` uses on the same storage key.** Three
lines: read the key, fall back to `prefers-color-scheme`, set `data-theme`.

It is inline and in the head because a theme resolved after first paint is a
flash of the wrong colours, and inline in the head is the only place that avoids
one. It is not an island, it is not a bundle, and it is the only script the page
declares.

The Landing gets **no theme picker**. The control lives in the Guide, and the
choice made there carries back to `/`.

## Consequences

- **The zero-JavaScript rule has exactly one exception, and it is named.** A test
  asserts the page declares one script, that it is `is:inline`, and that no
  `client:*` directive appears — so a second script has to argue for itself
  rather than arrive quietly.
- **The Landing depends on a key Starlight owns.** A rename upstream would split
  the two halves of the site without any error, so a test reads the key out of
  Starlight's own components and fails if it is not the one the Landing uses.
- **A reader who first meets the site at `/` cannot change its theme there.**
  They get their operating system's preference, which is the best guess
  available, and a picker on the Landing remains cheap to add later.
- **With scripting off the Landing is dark**, which is the same default the Token
  layer and Starlight's stylesheet already take. Consistent rather than correct
  for everyone.
- **Astro's prefetch script still ships**, on this page and every other: Starlight
  sets `prefetch: config.prefetch ?? { prefetchAll: true }`, so the site opts in
  by default. It *is* removable — `prefetch: false` in `astro.config.mjs` would do
  it — and it is kept deliberately: the decision belongs to the whole site rather
  than to this page, and on a page whose only job is handing off to the Guide, 2 kB
  that makes the next click instant is the cheapest thing on it. So the Landing
  declares one script and is served two; only the first is its own.

## Alternatives considered

- **A Starlight splash page at `/`.** Gets the theme, the picker and the header
  for free. Rejected: it drags Starlight's chrome and its JavaScript onto a page
  specified as a plain Astro page with zero JavaScript, and it would put English
  prose this repository authors inside `src/content/docs/`, which is otherwise
  the Mirror's home.
- **Resolving the theme in CSS with `prefers-color-scheme`.** Rejected on two
  counts: the Token layer switches on an attribute rather than a media query, so
  this would mean a second copy of the light Token values for one page — and it
  would still ignore the reader's explicit choice, which is the part that
  matters.
- **Accepting an always-dark Landing.** Rejected: cheapest to build, and the
  failure it accepts is the site disagreeing with a preference the reader set on
  the site itself.
