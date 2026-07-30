# ADR 0002 — The Mirror is a committed copy, pulled on a schedule

**Status:** Accepted
**Date:** 2026-07-30

## Context

The Guide has to reach this repository somehow. It could be fetched during the
site build — by submodule, sparse checkout or release tarball — leaving nothing
committed here. Or it could be copied in and committed, which puts derived
content under version control.

Whichever way, something has to tell us when the English changed, because that
is the moment a Translation becomes wrong. Pre-1.0 the Guide changes often, so
this is the load-bearing question, not a detail of plumbing.

## Decision

**The Mirror is committed, and this repository pulls it.** A scheduled job here
checks out `argusappsec/argus`, replaces `src/content/docs/guide/` with the
current `docs/guide/`, and commits straight to `main`.

Three parts, each for its own reason:

- **Committed, not fetched.** The Sync commit's diff *is* the staleness signal
  for Translations: the paragraphs that changed in English are visible as a
  diff, without building any tracking system. A submodule bump would show a SHA
  and nothing else — the one form that loses exactly the signal we need.
- **Pull, not push.** `argus` is public, so reading it needs no credential, and
  writing here uses the built-in `GITHUB_TOKEN`. **No secret exists to create,
  rotate or leak.** A push job in `argus` would need write access here and would
  have to know this repository's internal layout, which ADR 0001 says it must
  not.
- **Direct to `main`, no review gate.** There are no Translations yet, so the
  diff-as-signal has no reader to serve and a gate would be pure friction on
  every upstream docs change. The gate arrives with the first Translation.

The Sync deletes as well as adds, so a page removed upstream leaves the site
instead of lingering forever. That is safe because the Mirror is a directory of
its own, a sibling of every Translation directory, rather than a set of files
interleaved with them.

## Consequences

- **Docs are live within the cron interval, not immediately.** Accepted pre-1.0.
  The exit, when the latency annoys us, is a `workflow_dispatch` triggered from
  `argus` with a fine-grained token scoped to `actions: write` only — able to
  start a workflow, unable to write code — with the cron kept as a safety net.
- **The cron is free only while this repository is public**, and GitHub disables
  scheduled workflows after 60 days of repository inactivity. That is the quiet
  way this Sync dies, and there is no alarm for it.
- **A malformed Mirror cannot break production.** The build fails and the last
  good deploy stays up. The site build validates internal links for this reason;
  `argus` ADR 0022 leaves the upstream half of that check explicitly unwritten.
- **Absolute links in the Guide are not locale-aware.** They are root-absolute
  by `argus` ADR 0022, and Astro no more injects a locale into them than it
  injects `base`. A Translation linking `/guide/configuration/` sends its reader
  back to English, so **the first Translation requires a locale-prefixing
  transform here** — presentation, owned by the Publisher, and cheap while it is
  expected rather than discovered.
