# ADR 0011 — The Sync starts the deploy, because its own push cannot

**Status:** Accepted
**Date:** 2026-08-05

## Context

ADR 0002 has the Sync commit the Mirror straight to `main`, and makes "no secret
exists to create, rotate or leak" the property that decision rests on. ADR 0009
has the deploy run as a workflow here, triggered by a push. Read together they
finish the sentence issue #5 opens: merging documentation upstream is the whole
act of shipping it.

Except Actions declines to chain. An event raised with the built-in token creates
no workflow run — the loop-prevention rule, and it does not care that the loop in
question is two different workflows. So the Sync's push lands a new Mirror and
nothing publishes it. The site keeps serving the Mirror from whenever a human last
pushed, every job in the run is green, and nothing anywhere is logged. The symptom
is documentation that stopped moving, which is the same shape of silent failure
this repository writes tests about — and the one no test here can see.

Three ways out, all worse:

- **A personal access token for the push.** It would rewrite ADR 0002's
  load-bearing property into "one secret, rotated by hand, with write access to
  the default branch" — the largest credential in the repository, held so that a
  workflow could hear about a commit.
- **The Sync deploys too.** A second `wrangler pages deploy`, and with it a second
  copy of the branch logic that decides what production is. ADR 0009 kept exactly
  one on purpose.
- **Cloudflare's Git integration**, which would hear the push. ADR 0009 refused it
  for the reason that has not changed: the build command would live in a dashboard
  nobody can review.

The fourth is written into the rule itself. `workflow_dispatch` and
`repository_dispatch` are the documented exceptions: raised with the built-in
token, they do start a run.

## Decision

**The Sync starts the deploy, with the token it already has.**

`gh workflow run deploy.yml --ref "$GITHUB_REF_NAME"`, in the same step as the
commit and behind the same guard, so a run that found nothing to commit starts
nothing. It costs one line in the permissions block — `actions: write`, which can
start a workflow and cannot write code — and no secret at all: the built-in token
is spelled `github.token`.

`src/sync/sync.test.ts` holds the three halves that would fail quietly: that the
dispatch sits behind the guard rather than firing on every run, that it names a
workflow file which exists, and that the named file still declares
`workflow_dispatch`. That last one is a cross-file assertion because the failure
is one: a dispatch at a workflow that stopped accepting them is an API 404 at
00:17, not a broken build.

## Consequences

- **The deploy's history now says `workflow_dispatch` where it said `push`.** The
  run is attributed to the Sync rather than to the commit it publishes; the commit
  is one click away in the run's own log.

- **`actions: write` can start any workflow in this repository.** There are two,
  and the other one is the Sync — which would find no difference and stop. The
  permission is scoped to a repository and cannot reach `argus`. Recorded rather
  than fenced, because the fence would be a token GitHub does not offer.

- **A failed dispatch leaves the Mirror committed and unpublished.** The next Sync
  finds no difference, so it dispatches nothing: the site stays a Mirror behind
  until someone starts the deploy by hand. The alarm is a red run in a workflow
  that otherwise never goes red. Deploying on a schedule as well would close it,
  at the cost of rebuilding and re-uploading the whole site every six hours to
  cover a case that has not happened yet.

- **Freshness is now two runs deep**: the Sync's cron interval, then the deploy's
  build. A Guide page merged upstream is live within roughly six hours and a
  couple of minutes.

- **ADR 0002's exit gets cheaper.** The day the six hours annoy us, `argus`
  dispatches this repository's Sync with a fine-grained token scoped to
  `actions: write` — the same mechanism as this decision, from one repository
  further out, and with the cron left as the safety net.
