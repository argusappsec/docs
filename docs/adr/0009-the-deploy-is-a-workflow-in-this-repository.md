# ADR 0009 — The deploy is a workflow in this repository

**Status:** Accepted
**Date:** 2026-08-04

## Context

ADR 0005 chose Cloudflare and left "Pages or Workers with static assets" open,
calling it a line of configuration rather than a decision. Two lines were open,
and only the second one is configuration.

The first is **who runs the build**. Cloudflare's Git integration connects the
repository from the dashboard, builds on every push, and gives every branch and
every pull request a preview — with no secret in GitHub at all. What it costs is
that the build command, the output directory and the Node version then live in a
dashboard: invisible to the repository, absent from every diff, and unable to
appear in a review. This repository tests the expiry date inside its own
`security.txt` because that failure would be silent, and a deploy configured
somewhere nobody can read is the same shape of problem. It also cannot make the
tests a gate — Cloudflare runs one build command, so folding `astro check` and
vitest into that string leaves them enforced by a text field.

The second is **Pages or Workers**, and that one really is configuration.

## Decision

**A GitHub Actions workflow running `wrangler pages deploy`, on a Pages project
named `argusappsec`.**

`.github/workflows/deploy.yml` checks, tests and builds every branch, then
uploads `dist/`. The branch name is passed straight through as `--branch`, and
Cloudflare compares it against the project's production branch — `main` — to
decide whether what it just received is the live site or a preview at
`<branch>.argusappsec.pages.dev`. One command covers both cases, which is the
point: there is no second code path that could publish a feature branch to
production.

Pages over Workers with static assets, because the per-branch preview URL is a
first-class Pages feature and is the thing issue #6 is actually about. On Workers
the same result is assembled out of `wrangler versions upload` and a preview
alias. Both work; Pages needs less arranging, and ADR 0008 already assumed it in
prose.

`src/deploy/deploy.test.ts` is what the choice buys, and it holds the parts that
would otherwise fail quietly: that every gate runs before the upload and there is
only one upload, that the whole run is a single job so that ordering means
anything at all, that `--branch` is never a literal and never interpolated into a
shell, that the referenced secrets are exactly the two below, that neither the
workflow nor a job widens the token, that a newer push cancels an older one on
the same branch, and that `astro.config.mjs` still sets neither `outDir` nor —
ADR 0005's late-discovered requirement — `base`.

## Consequences

- **Two secrets, and together they are one connection.**
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, the latter wanting
  *Cloudflare Pages: Edit* and nothing else. The test asserts the set is exactly
  those two, so a third one arrives as a red build and a conversation rather than
  as a line in a diff nobody read.

- **A fork's pull request gets no preview**, because secrets are withheld from it
  by design. The trigger is therefore branch pushes: contributors with write
  access get previews, and an outside contribution is reviewed as a diff.
  Cloudflare's Git integration would not have changed this. The trigger that
  *would* — `pull_request_target` — runs fork code with the secrets available, so
  the test refuses the whole `pull_request` family rather than the one name
  somebody thought of.

- **Wrangler is not in the dependency tree.** Adding it took `npm audit` from one
  pre-existing advisory to four — miniflare, then undici — for a CLI run once per
  deploy. Its version is pinned at the call site instead, and the test asserts it
  is exact, because the lockfile is no longer there to do it.

- **Two things live in Cloudflare and no test here can see them**: that the
  project exists with `main` as its production branch, and that both secrets are
  set. Both fail loudly on the first run, which is why they are left to it.

- **The actions are pinned to a major tag, not a commit.** They are GitHub's own
  `actions/checkout` and `actions/setup-node`, and the Cloudflare secrets are
  scoped to the one step that needs them, so neither can read a credential. A
  tampered tag could still tamper with `dist/`. Recorded rather than solved: SHA
  pins without something to update them rot into a build that stops getting
  security fixes.

- **The repository is public from here.** The Sync of ADR 0002 runs on a
  schedule, and Actions minutes are unmetered on a public repository while a
  private one spends a monthly allowance on every run — so this is one decision,
  not two. The history was read for secrets before the flip and had nothing to
  redact. Public also means a preview URL is reachable by anyone who finds one,
  which is the requirement and not a side effect.

- **Nothing is measured yet.** ADR 0008's beacon is injected by Cloudflare in
  front of a proxied zone, and until issue #8 puts the site on the apex there is
  no zone — only a `pages.dev` hostname. The measurement starts with the domain,
  not with the deploy.

- **The project name is now part of every preview hostname.** Renaming it later
  breaks links people have pasted at each other, though not a public contract:
  ADR 0005 already records that the apex is where the URLs become one.
