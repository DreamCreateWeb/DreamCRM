# Animated emoji — licence and provenance

The `*.webp` files in this directory are derived from **Noto Animated Emoji**
by Google, licensed under the
[Creative Commons Attribution 4.0 International licence (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

## Why the licence lives in this file

The animation source repository (`googlefonts/noto-emoji-animation`) is not
public — it 404s. The CC BY 4.0 status is confirmed by a Google Fonts
maintainer in [google/fonts#7011](https://github.com/google/fonts/issues/7011),
which also confirms that attribution is satisfied by a single credit in a
reasonable place — a footer or a credits line — rather than a notice beside
every glyph.

That thread is the only durable statement of the licence, so it is recorded
here beside the assets rather than left to be rediscovered.

## How we satisfy attribution

The marketing-site footer (`components/marketing/ui.tsx`, `MarketingFooter`)
carries the credit line on every marketing page. It is not decoration and it is
not optional — `tests/marketing/emoji-assets.test.tsx` fails if it is removed.

## Provenance of each file

Sources are the `512.webp` renders at
`https://fonts.gstatic.com/s/e/notoemoji/latest/<codepoint>/512.webp`.

| File | Codepoint | Glyph |
|---|---|---|
| `rocket.webp` | `1f680` | 🚀 rocket |
| `planet.webp` | `1fa90` | 🪐 ringed planet |
| `popper.webp` | `1f389` | 🎉 party popper |

**This table is what we ship, and that is the point of it.** Attribution is a
licence obligation over the files actually distributed, so when the set
changes this table changes with it — it is not a history of everything ever
downloaded. Three glyphs were removed on 2026-09-23 (DREAMCRM-118) because
nothing on the site referenced them: `sparkles` (`2728`), `dizzy` (`1f4ab`)
and `star` (`2b50`). Their assets are deleted, so they are no longer
distributed and no longer need crediting. The decision and the reasons live
in `lib/marketing/emoji.ts` under `CUT`; the re-encode parameters to restore
one live in `scripts/build-emoji.mjs`.

Each `<name>-still.webp` is a single frame of the same source, used as the
`prefers-reduced-motion` fallback.

## Why `public/images/emoji/` and not `public/emoji/`

`middleware.ts`'s matcher excludes exactly `_next/static`, `_next/image`,
`favicon.ico`, `images`, `css` and `fonts`. Anything served from a NEW
top-level directory under `public/` goes through the auth middleware and
404s — which is what `/emoji/rocket.webp` did. Living under the already
excluded `images/` prefix fixes that without editing an auth surface.

Put new static assets under one of those prefixes, or the middleware eats them.

## Regenerating them

`node scripts/build-emoji.mjs` (needs `sharp`; see the header of that file).
It downloads the sources, resizes to 96px, decimates the frame rate and writes
both the animated file and its still. Do not hand-edit anything in here.

## What is NOT in here, and why

The pack a search for "animated emoji" surfaces first — `Tarikul-Islam-Anik/
Animated-Fluent-Emojis` — is licensed **"Personal Use Only … All rights are
reserved by Microsoft"**, and GitHub's licence detector reports `NOASSERTION`
for it. It cannot be used on a commercial site. Free on a marketplace is not
the same as licensed.
