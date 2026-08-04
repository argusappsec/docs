---
title: Privacy
description: What this website measures, what it does not, and who to write to about it.
---

This page describes what happens to data when you visit `argusappsec.com`. It is
short because the site is small: static pages, no accounts, no forms, no
advertising, and nothing stored on your device.

Argus itself is different software, running on infrastructure you own. What it
does with your code and your organization's knowledge is documented in the
[user guide](/guide/), and none of it passes through this website.

## Who is responsible

**Davide Imola** is the data controller for this website. Write to
**privacy@argusappsec.com** about anything on this page.

Vulnerability reports about Argus go to `security@argusappsec.com` instead, so
that the two never sit in the same queue.

## Audience measurement

The site uses **Cloudflare Web Analytics** to count visits. It records the page
address, the referring page, your browser, operating system and device type, your
screen size, your country, and how quickly the page loaded.

It does not use cookies, local storage, or anything else kept on your device.
Cloudflare's own documentation states that Web Analytics "does not use any
client-side state, such as cookies or localStorage, to collect usage metrics" and
does not "fingerprint individuals via their IP address, User Agent string, or any
other data". Your IP address is what makes any web request work, and Cloudflare
derives your country from it before removing it as the measurement is aggregated
at its edge.

Cloudflare keeps unsampled measurements for **7 days**, after which they are
aggregated down to roughly a 10% sample. There is no second copy anywhere: the
dashboard Cloudflare provides is the only place this data exists.

The legal basis is legitimate interest, under Article 6(1)(f) of the GDPR:
knowing which pages people read is what tells us which pages to write. Your
consent is not asked for because nothing is written to your device, which is what
consent for cookies exists to cover.

**To opt out**, block `static.cloudflareinsights.com`. Any content blocker does
it, and the site works exactly the same without it.

## Serving the site

The site is served by **Cloudflare**, which necessarily sees the address of every
request and the IP address it came from, as any web server does. This is the same
company that provides the measurement above, so counting visits introduces nobody
new.

## If you write to us

An email tells us your address and whatever you put in it. We use it to answer
you and keep it as long as that takes. The mailbox is hosted by **Apple**, on
iCloud Mail.

## What does not happen here

- No cookies, and no consent banner, because there is nothing to consent to.
- No profiling, no automated decisions, no advertising, no data sold or shared
  for anyone else's purposes.
- No tracking of you across other websites.
- No newsletter, no account, and no form to fill in.

## Where data goes

Cloudflare, Inc. and Apple Inc. are both United States companies and act as
processors for the two purposes above. Each does so under a data processing
agreement incorporating the European Commission's standard contractual clauses.

## Your rights

You can ask for access to your data, for it to be corrected or erased, for its
processing to be restricted, and you can object to it. Write to the address at
the top of this page.

One honest limit: the measurement data carries no identifier for you. We cannot
tell which of it is yours, so there is nothing in it we could show you or delete
on request. Article 11(2) of the GDPR covers exactly this case. Email is
different, and rights over it work normally.

If you think this is being handled badly you can complain to the Italian
supervisory authority, the [Garante per la protezione dei dati
personali](https://www.garanteprivacy.it/), or to the authority where you live.

## Changes

This page lives in the repository that builds this website, so every change to it
is a public commit with a date and a reason attached.

**Last updated: 4 August 2026.**
