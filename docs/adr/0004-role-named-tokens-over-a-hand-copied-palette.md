# ADR 0004 — Role-named Tokens over a hand-copied Palette

**Status:** Accepted
**Date:** 2026-07-30

## Context

The brand lives in `argusappsec/argus` under `brand/`: four SVG/PNG assets and a
five-colour Palette documented in prose — `#0B2239` night, `#0E6E63` peacock
teal, `#16A08C` verdigris, `#E9B44C` ocellus gold, `#F4F7F6` paper. That folder
is referenced by no code, no Makefile and no CI: it is an asset folder.

The site needs colour roles the Palette does not describe. The Palette's own
"role" column names *logo anatomy* — pupil, feather, inner ring, outer ring,
highlight — and has never spoken about interfaces. It also has no dark story.

One option was to make the Palette machine-readable in `argus` and consume it
here, giving a single source with two tiers. It was rejected: the product
repository and the showcase site have deliberately different focus, and coupling
their build inputs buys little.

## Decision

**The design system lives entirely in this repository, and its Tokens name
roles.** The five Palette hex values are transcribed by hand, each annotated with
the brand colour it came from; everything else is derived from them with
`color-mix()`, so those five lines stay the only literal colour constants in the
repository. A single Tailwind `@theme` block is both the Token layer and the
Tailwind theme, and Starlight's `--sl-color-*` variables are mapped onto it.

| Token | Light | Dark |
| --- | --- | --- |
| `bg` | paper | night |
| `surface` | white | derived from night |
| `text` | night | paper |
| `text-muted` | derived | derived |
| `border` | derived | derived |
| `primary` | peacock teal | verdigris |
| `accent` | ocellus gold | ocellus gold |

**Role naming is required by the Palette, not chosen for taste.** Measured
contrast ratios:

| | ratio | AA body text |
| --- | --- | --- |
| night on paper, and the reverse | 14.96 | pass (AAA) |
| peacock teal on paper | 5.68 | pass |
| peacock teal on night | 2.63 | **fail** |
| verdigris on night | 4.95 | pass |
| verdigris on paper | 3.02 | **fail** |
| ocellus gold on night | 8.52 | pass (AAA) |
| ocellus gold on paper | 1.76 | **fail** |

Apart from the two neutrals, **no brand colour reads accessibly on both
backgrounds.** `primary` must therefore be a role whose value flips with the
theme; a Token named `peacock-teal` would force every component to know which
theme is active. The Palette is asymmetric because it was designed for a logo,
where the background is chosen by the designer — on a UI it is chosen by the
reader.

**Ocellus gold is a fill in light and a foreground in dark.** At 1.76 on paper it
is unusable in the foreground, but night *on* gold measures 8.5 (AAA). So in
light mode gold fills — badge, callout, rule — with night text over it. No
sixth, darkened gold is derived: that colour would not be `#E9B44C` and nobody
approved it.

**`secondary` does not exist.** Verdigris is not the secondary colour; it is
`primary` in dark.

## Consequences

- **Five hex values exist in two repositories and can drift.** Accepted as the
  price of decoupling. The provenance annotation next to each value is what makes
  the drift visible instead of silent.
- **The brand assets are copied once**, not synced: the site needs the logo, the
  light and dark banners and a favicon, and those change effectively never.
- **A future shared design-system repository is out of scope.** If Argus ever
  ships a UI of its own, the question reopens then.
