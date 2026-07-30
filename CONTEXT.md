# Argus Site — Domain Glossary

This repository is the public face of Argus: a landing page that argues the case
for the project, and the published form of its documentation. It publishes prose
it does not author.

## Publishing

**Publisher**:
The role this repository plays. It owns presentation, navigation, Translations
and hosting; it never owns the English prose of the Guide.

**Guide**:
The task-oriented documentation for operators who host Argus and developers who
receive its reviews. Authored in `argusappsec/argus` under `docs/guide/`, which
is its only source of truth.
_Avoid_: docs, user docs, manual, handbook

**Mirror**:
The copy of the Guide inside this repository, at `src/content/docs/guide/`.
Written only by the Sync, never by hand — a typo is fixed in `argusappsec/argus`.
_Avoid_: the docs folder, content, vendored docs

**Sync**:
The scheduled job in this repository that replaces the Mirror with the current
state of the Guide. It deletes as well as adds, so a page removed upstream also
leaves the site.
_Avoid_: import, mirroring job, pipeline

**Translation**:
A localized copy of a Guide page. Owned by this repository, and living outside
the Mirror so the Sync can never overwrite it.
_Avoid_: localization, i18n content

**Agent docs**:
The repository-root `docs/` directory: skill configuration and this
repository's ADRs. Unrelated to the Mirror despite the shared word.
_Avoid_: docs (unqualified), the docs folder

## The landing

**Landing**:
The page at `/`. Its audience has never heard of Argus.
_Avoid_: homepage, showcase, vetrina

**Argument**:
The case for Argus — deterministic scanners are precise but shallow, language
models alone drown the signal, and an organization's own context is the missing
third ingredient. An Argument does not go stale, so the Landing may restate it
in its own form.

**Inventory**:
Any enumeration that changes as Argus changes: scanners, built-in skills,
channels, quick-start commands, version numbers, model providers. The Landing
never restates an Inventory — it links to the Guide. A restated Inventory is a
site that will eventually lie.

Inventories live in the prose bodies of Guide pages, which this repository does
not own and which are reformatted freely upstream, so extracting one would make
the build depend on somebody else's table formatting. The Landing may read the
Mirror's **frontmatter** — stable and schema-validated — and nothing else.

## Design system

**Palette**:
The five named brand colors, authoritative in `argusappsec/argus` under
`brand/`. Not owned here; their values are transcribed by hand.
_Avoid_: theme, brand colors, color scheme

**Token**:
A semantic role in this repository's design system — `primary`, `accent`, `bg`,
`text`, `border`. A Token names a job, never a color, and its value may differ
between light and dark because no Palette color reads accessibly on both.
_Avoid_: variable, custom property, CSS var
