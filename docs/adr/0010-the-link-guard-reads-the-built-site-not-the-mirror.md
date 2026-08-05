# ADR 0010 — The link guard reads the built site, not the Mirror

**Status:** Accepted
**Date:** 2026-08-05

## Context

`argus` ADR 0022 rewrote the Guide's internal links as root-absolute site paths
and left the rule unenforced — a CI check there "would be a grep", and was kept
out to keep that change scoped to documentation. The same ADR notes that the
eighteen links it had to remove are evidence of how quickly the rule erodes
without one. Issue #4 is this repository's half.

Where the check reads from is the whole decision, and there are two candidates.

**The Mirror's Markdown**, globbed at `astro:config:setup`, where the contrast
guard of ADR 0004 already runs. It fails before a single page renders, it works
in `astro dev`, and it names the source file. But it has to re-derive which slugs
exist — `index.md` becomes the directory, a `draft: true` page is built in
development and dropped in production — so the guard would carry its own opinion
of Starlight's routing and could be wrong in either direction. It also sees only
Markdown: the Landing's `/guide/channels/github/` links are written by hand in
`src/pages/index.astro`, and those are the ones a rename upstream breaks
silently, since nobody is reading a diff of somebody else's repository.

**The rendered site**, at `astro:build:done`. Nothing is derived: the pages are
the ones about to be uploaded, `<a href>` is already resolved, and a page missing
from the output is missing for exactly the reason a reader would get a 404.

## Decision

**The guard walks the build output and checks every `<a href>` that starts with
`/` against the paths that output serves.**

`src/links/links.ts` holds the rule and `src/links/guard.ts` the walk. A path is
served if the build wrote a page there or copied a file there, so
`/.well-known/security.txt` resolves for the same reason `/guide/skills/` does —
the deploy uploads that directory and nothing else. A target's anchor and query
are dropped before the lookup.

**Anchors are not checked.** Where `#llm-providers` lands is between the reader
and their browser; a guard that slugified headings by hand would start failing on
prose this repository does not own, the first time the Guide reformats one.

**Nothing is skipped and nothing is listed.** A link with a scheme, one starting
`//`, a `mailto:` and a bare `#anchor` are not this site's to resolve, and that
is a property of the link rather than an exception granted to it. A relative link
is left alone too: resolving one needs the linking page's URL, and ADR 0022
mandates root-absolute paths upstream, so the form does not occur.

## Consequences

- **The failure arrives at the end of the build, not the start.** Every page is
  rendered and written before the guard runs, and only then does the build exit
  non-zero. Nothing is uploaded, because the deploy of ADR 0009 makes the build a
  gate and a later step does the upload — so the running deployment stays up. The
  cost is a full render for a failure a glob would have found in a second.

- **`astro dev` does not run it.** `astro:build:done` has no dev equivalent, so
  the feedback loop for a hand-written link on the Landing is `npm run build`.
  Accepted because the reader this guard is written for is CI: the Sync commits
  without review, and a warning in a terminal nobody is watching is what this
  replaces.

- **The failure names a URL rather than a file.** `/guide/getting-started/ →
  /guide/deployment/k8s/`. For a Guide page that is the better half of the
  mapping anyway: the Mirror is a copy, so the message says where the page is
  authored and sends the reader to `argusappsec/argus` instead of inviting a fix
  that the next Sync would undo.

- **The Landing is held to the same rule as the Guide**, at no extra cost, which
  the Markdown reading would not have done.

- **An empty output fails.** A guard measuring nothing has no broken links to
  find and would pass forever the day the build output moves, so finding no pages
  at all is itself the error.

- **A `draft: true` page is a broken link, correctly.** Astro drops it from a
  production build, so a link to it resolves to nothing — which is what a reader
  would get, and what the Markdown reading would have called fine.
