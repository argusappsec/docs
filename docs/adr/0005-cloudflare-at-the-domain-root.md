# ADR 0005 — Cloudflare, served from the domain root

**Status:** Accepted
**Date:** 2026-07-30

## Context

`argusappsec.com` is registered, its nameservers are already Cloudflare, and its
MX records point at iCloud Mail — that is how the published vulnerability
disclosure address `security@argusappsec.com` works. It has no A or CNAME record:
today the domain is mail only.

The Guide's internal links are root-absolute paths under `/guide/…`, written by
hand in `argusappsec/argus`. Astro does not inject `base` into them, so a site
served under a sub-path breaks every one of them. `argus` ADR 0022 calls this the
requirement "most likely to be discovered late".

## Decision

**Cloudflare, on the apex `argusappsec.com`, with `www` redirecting to it.**

Serving from the domain root is not a branding preference — it is the third
requirement of `argus` ADR 0022. On `argusappsec.github.io/docs` Astro would need
`base: '/docs'` and the URL prefix would become `/docs/guide/`, breaking the
Guide's links. The domain choice and the prefix choice are one decision.

Cloudflare over the alternatives:

- **No new vendor.** The DNS is already there, so the apex and its certificate
  are configuration rather than a delegation. Preview deployments are unlimited
  on the free plan, which matters because the Landing will be iterated by eye.
- **No non-commercial clause.** Vercel's Hobby plan is free and legitimate for
  this project today, but it defines commercial usage as any deployment used for
  *"the purpose of financial gain of anyone involved in any part of the
  production of the project"*, and notes explicitly that **asking for donations
  falls under commercial usage**. A GitHub Sponsors button on the Landing, or an
  announcement of a hosted Argus, would change the billing plan. A content
  decision must not trigger a billing decision on the site of an open-source
  project.
- **GitHub Pages** would work through a Cloudflare CNAME but has no preview
  deployments.

Free-plan limits are not a constraint here: 500 builds per month, and builds are
triggered by commits rather than by cron runs — the Sync commits only when the
Guide actually changed.

## Consequences

- **The MX records are untouched.** Pointing the apex at a host adds an A or
  CNAME record and leaves mail alone. Recorded because breaking a security tool's
  vulnerability disclosure address would be the worst possible first day.
- **Renaming a Guide page now breaks a public URL**, as `argus` ADR 0022 already
  notes. Serving from the root makes the site's URLs the project's public
  contract.
- **Pages or Workers with static assets is left open**, and is a line of config
  rather than a decision: Astro's static output deploys to either.
