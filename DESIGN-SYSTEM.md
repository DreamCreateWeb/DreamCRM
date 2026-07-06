# DreamCRM Dashboard Design System v2 — "Instrument Panel, Liquid Soul"

The binding UI/UX system for the **authenticated dashboard** (`app/(default)`
+ `app/(double-sidebar)`), plus auth/onboarding chrome where noted. v2 keeps
v1's actions-first doctrine and the entire semantic-encoding contract, and
replaces the visual language wholesale: Mosaic's flat white-card admin look
gives way to an etched, navy-inked instrument panel with the Dream Create
liquid-teal identity. Research-grounded (Linear's restraint + token system,
Stripe's card-less 2025 dashboard + perceptual color, Mercury/Attio calm,
healthcare-trust palette studies, Emil Kowalski / Linear motion doctrine) —
the three cited research reports live in the 2026-06-11 session log.

**Scope boundary:** NOT the public clinic sites (`app/site`), the patient
portal (`app/(portal)`), or the marketing site (`app/(marketing)`). Those
keep their own languages. Auth + onboarding receive the v2 *brand* (logo,
teal, ink, fonts) but stay structurally simple.

---

## Part 0 — Doctrine

**Actions-first survives verbatim.** Every screen answers, in order: (1)
what needs doing → (2) how to do it in one click → (3) the data behind it.
The five v1 rules still bind:

1. **Lead with the action.** One solid primary in the PageHeader, attention
   surfaces before raw data, empty states say what to do next.
2. **One primary per surface** (page header / drawer / modal). Primary is
   now **teal**, not violet. Destructive = `danger`, never adjacent to the
   primary.
3. **Every encoding is explained** — `<EncodingLegend>` wherever glyphs,
   aging, or coded pills appear; every mark carries `title` + `aria-label`;
   color never carries meaning alone.
4. **Readability floor** — nothing under 12px (`text-xs`); primary content
   `text-sm`+; no decorative-gray meaningful text; `tabular-nums` everywhere
   numeric; zeros keep full contrast.
5. **Same pattern everywhere** — one header, chip, pill, empty state, bulk
   bar across all modules.

**Three new v2 laws:**

6. **Restraint reads premium.** Hierarchy comes from ink weight, size, and
   surface luminance — not color spray. Teal is rationed (Part 2). Resting
   data surfaces carry **no drop-shadow**; separation is a 1px hairline +
   luminance step. Shadows exist only on true overlays.
7. **The brand lives in the chrome, never the data.** Gradient/aura/grain
   belong to the shell (sidebar, header, page-title zone, auth). Tables,
   cards, and forms stay flat and instantly legible.
8. **Instant first, alive second.** Anything a front desk does 100×/day
   gets instant feedback and zero flourish. The motion budget is spent on
   rare moments (Part 3).

---

## Part 1 — Semantic encoding contract (functional; survives the re-skin)

`lib/ui/encodings.ts` remains the single source of truth: six tones, the
glyph registry with exact aria-labels (★ 🎂 $ 📝! ⚠️ 💤 🔕 🆕 📅 ⏱), aging
tiers (fresh→quiet→aging→late→overdue) with per-module thresholds, and the
AGING_LEGENDS presets. Division of labor unchanged: **pills = categorical
state · aging left-borders = time urgency · glyphs = per-row flags.**
Ball-in-court doctrine unchanged: warn/urgent only when the next move is
OURS; once we've acted and they haven't replied, rows go quiet
(`info`/`neutral`).

**One change in v2:** `info` moves **sky → indigo** (`#6366F1` family). The
brand is now teal — a teal/sky pair is too close in hue to disambiguate at
a glance.

| Tone | Means (unchanged) | v2 hue |
|---|---|---|
| `ok` | healthy · done-good · confirmed | emerald (unchanged) |
| `warn` | **needs OUR action** · aging · due | amber (unchanged) |
| `urgent` | overdue · failed · problem NOW | rose (unchanged) |
| `info` | in flight · ball in THEIR court | **indigo** (was sky) |
| `special` | new arrival · featured | violet (unchanged — brand vacated it) |
| `neutral` | inert · archived · draft | ink/gray ramp |

**Teal is NEVER a status.** Identity only: primary actions, selection,
focus, links, active nav, chart series 1. A teal pill is a contract
violation. Badges meaning "needs attention" (sidebar counts included) are
`warn` amber.

---

## Part 2 — Foundations

### 2.1 Color tokens (Tailwind 4 `@theme` in `app/css/style.css`)

Components reference tokens (or the re-tinted `gray` ramp) — never raw hex.
`.dark` overrides the same custom properties; no parallel palette.

```css
/* Canvas & surfaces — LIGHT */
--color-canvas:          #F6F8F9;  /* app background (cool, faintly teal) */
--color-surface-1:       #FBFCFD;  /* raised panel */
--color-surface-2:       #FFFFFF;  /* cards, inputs — top of stack */
--color-surface-sunk:    #EEF2F4;  /* wells, table headers */
--color-hairline:        #E3E9EC;  /* 1px separation everywhere */
--color-hairline-strong: #D2DBDF;

/* Ink — navy-tinted neutrals (the brand's temperature) */
--color-ink-900: #141A2E;  --color-ink-800: #1A2140;  /* brand navy */
--color-ink-700: #2E3650;  --color-ink-600: #4A5268;
--color-ink-500: #6B7488;  --color-ink-400: #97A0B2;  /* disabled only */

/* Teal brand ramp (hue ~185–190 — aqua side, away from green) */
--color-teal-50:#ECFBFA; --color-teal-100:#D2F5F2; --color-teal-200:#A8ECE7;
--color-teal-300:#74DDD6; --color-teal-400:#4DCDC4; /* logo aqua */
--color-teal-500:#28B3AD; /* primary fill (light) */
--color-teal-600:#1F938F; /* hover/pressed */
--color-teal-700:#2A7F8C; /* logo deep — focus rings, gradient anchor */
--color-teal-800:#1E5E69; --color-teal-900:#163F47;

/* DARK (.dark): navy-black world, luminance = elevation */
--color-canvas:#0E1320; --color-surface-1:#151B2B; --color-surface-2:#1B2336;
--color-surface-sunk:#0B0F1A;
--color-hairline:rgb(255 255 255 / .06);
--color-hairline-strong:rgb(255 255 255 / .10);
/* teal fills brighten to the 400 aqua on dark */
```

**The migration trick:** the legacy `--color-gray-*` ramp is RE-TINTED to
the ink/cool neutrals (50:#F6F8F9 · 100:#EEF2F4 · 200:#E3E9EC · 300:#C6CEDA
· 400:#97A0B2 · 500:#6B7488 · 600:#4A5268 · 700:#2E3650 · 800:#1A2140 ·
900:#141A2E · 950:#0E1320) so the thousands of existing `gray-*` utilities
inherit the new temperature for free, and `dark:bg-gray-800/900` literals
land on the navy surfaces automatically. New/touched code prefers semantic
tokens; the gray ramp is the compatibility layer.

**Accent usage rules:** one teal primary action per surface; teal is also
allowed for focus rings, links, selected/active states (nav item, selected
row ring, toggle-on, active chip), and chart series 1. Everything else is
neutral or hairline-ghost. Labels/eyebrows: `text-xs font-semibold
uppercase tracking-wider` ink-500; the page-title eyebrow may be teal-700.

### 2.2 Typography

- **UI + body: Geist Sans** via the npm `geist` package (local font files —
  NO Google fetch, build-safe per the CLAUDE.md font gotcha). Applied at
  the dashboard root layouts. Display headings tracking ~-0.02em.
- **Numerals: Geist Mono** for KPI hero numbers, money, times, and count
  columns — the "financial instrument" signature. Body numerals keep
  `tabular-nums`.
- Size ramp unchanged. **Visibility rules (2026-07-06 — binding, swept
  and enforced):** the product is built for imperfect vision. Two tests
  every screen must pass: **"Where am I? What am I doing?"** (location +
  state always announced — strong active nav states, a PageHeader or
  equivalent large title, a per-page browser title) and **"never
  squint"** (nothing load-bearing is tiny or faint).
  - **12px floor, enforced**: `text-[11px]`/`text-[10px]` and sub-0.75rem
    literals are banned everywhere (dashboard AND portal — the portal's
    warm world follows the same floor). Short state badges sit AT the
    floor, never under it. Prefer rem-based Tailwind sizes over px
    literals — px does not scale with the user text-size setting.
  - **Contrast**: `gray-500` lightest meaningful on white,
    `dark:gray-400` lightest on dark; portal muted ink is `PORTAL_MUTED`
    (#6B635A) — never lighter literals; never dim a zero; no
    hover-to-reveal for data values.
  - **Text-size setting**: per-device Standard/Large/Extra-large scales
    the ROOT font-size (`html.dc-text-lg`/`.dc-text-xl` in style.css,
    pre-paint script in app/layout.tsx, control =
    `components/ui/text-size-toggle.tsx` in Settings → Account + portal
    My info). This only works because sizes are rem-based — another
    reason the px ban matters.
  - Every icon-only interactive has `aria-label`; truncations carry
    `title`; hit targets ≥40px for primary controls.
- Public site keeps Fraunces/Inter; portal and marketing unchanged.

### 2.3 Radius scale (kill the rounded-xl grab-bag)

`--r-xs:4px` chips/badges/inputs · `--r-sm:6px` buttons · `--r-md:8px`
cards · `--r-lg:12px` panels/modals/drawers · `--r-pill:9999px` pills &
avatars. Data surfaces never exceed 12px.

### 2.4 Elevation & surfaces ("etched instrument panel")

- Resting card = `bg-surface-2` + inset hairline ring
  (`inset 0 0 0 1px var(--color-hairline)`) + 8px radius + **no shadow**.
- Panels = surface-1; wells/table-heads = surface-sunk.
- Hover (pointer-fine only): hairline → hairline-strong + `--shadow-xs` +
  `translateY(-2px)` on *interactive cards only*; plain rows get bg tint.
- Overlay shadows (navy-tinted, never black):
  `--shadow-xs: 0 1px 2px rgb(20 26 46/.06)` ·
  `--shadow-pop: 0 4px 12px rgb(20 26 46/.10), 0 8px 24px rgb(20 26 46/.08), inset 0 0 0 1px var(--color-hairline)` ·
  `--shadow-modal: 0 16px 48px rgb(20 26 46/.16), 0 32px 72px rgb(20 26 46/.20)`
- Focus ring (teal, on every focusable):
  `0 0 0 2px rgb(42 127 140/.45), 0 0 0 4px rgb(42 127 140/.20)`.
- **Chrome aura (signature, chrome-only):** one soft radial teal→navy
  gradient bleeding from the shell's top-left + a 2–3% noise/grain overlay
  on the canvas (kills banding; echoes the logo's liquid texture). Never
  behind data surfaces.

---

## Part 3 — Motion system ("considered fluidity")

CSS-first. **No animation library** — `@theme` tokens + `@starting-style` +
CSS `linear()` springs cover the spec; Headless UI transitions re-point to
these tokens. Hard ceiling 300ms for UI transitions. (View Transitions API:
still experimental in Next 16.2 — do not adopt yet.)

```css
--dur-instant:90ms; --dur-fast:140ms; --dur-base:200ms; --dur-slow:260ms;
--dur-cinematic:480ms; /* signature moments only */
--ease-out:cubic-bezier(.23,1,.32,1);         /* default (out-quint) */
--ease-out-soft:cubic-bezier(.215,.61,.355,1);
--ease-in-out:cubic-bezier(.77,0,.175,1);     /* on-screen moves */
--ease-ios:cubic-bezier(.32,.72,0,1);         /* drawers */
--ease-emphasis:cubic-bezier(.19,1,.22,1);    /* signature reveals */
--spring-gentle:linear(0,.1,.25,.5,.68,.8,.88,.94,.98,.995,1);
--spring-subtle:linear(0,.18,.5,.83,1.05,1.04,1.01,1,.999,1);
```

**Choreography:** drawer enter `translateX(100%→0)` base/ios, exit fast
(exits always ~20% faster); modal `scale(.96→1)`+fade base/out, exit fast;
popover/menu `scale(.97)`+`y(-4px)` fast, transform-origin = trigger; toast
`y(8px→0)` fast (spring-subtle allowed); page/section content fade+`y(6px)`
slow via `@starting-style`; list stagger ONLY on first reveal, 40–60ms,
capped at 6–8 rows; button/card press `scale(.97)` instant; row hover = bg
tint, instant, no transform.

**Skeletons:** show nothing under ~250ms; shimmer (left→right ~1.4s) over
pulse; shaped to the real layout; static under reduced-motion. Spinners
only inside buttons ("Sending…").

**KPI count-up:** once per session entry on the Overview, ≤700ms, ease-out,
Geist Mono, snaps under reduced-motion. Never on re-query/filter/drawer.

**Signature moments (exactly two — resist the third):**
1. **Morning reveal** — on dashboard entry: the teal aura washes in behind
   the page header (cinematic/emphasis), attention cards cascade once
   (50ms stagger, spring-gentle, `y(8px)`+fade), KPIs count up in the same
   beat.
2. **Ambient breath** — the active nav item + the page's single primary
   button carry a ~6s compositor-only gradient drift. Subliminal; the
   brand alive at rest.

**Never animate:** table/agenda re-sort/re-filter results (rows snap);
text/numbers being read; keyboard-driven actions (⌘K nav, Enter, Esc);
100×/day interactions beyond instant feedback; layout properties
(transform/opacity/clip-path only); inline-validation appearance;
`scale(0)` entrances; sidebar active-state on click.

**A11y/perf:** global `prefers-reduced-motion: reduce` kills transforms,
shimmer, count-up, and aura drift — keeps opacity/color fades. Hover motion
gated `(hover:hover) and (pointer:fine)`. `will-change` only while an
element actively animates.

---

## Part 4 — Shell & navigation v2

**Sidebar (3 states):** expanded 248px (default ≥`xl`), icon rail 64px
(default `lg`→`xl`; user toggle **`[`** anywhere, persisted), overlay
drawer (<`lg`). Rail mode REQUIRES hover-flyout labels (200ms delay)
showing label + count — unlabeled icons are banned (fixes the
iPad-landscape legibility gap).

Anatomy top→bottom:
1. **Logo** — Dream Create liquid-D (`components/brand/dream-create-logo`),
   collapse caret top-right.
2. **Org switcher block** — a STATIC label: clinic name + plan pill (demo mode
   adds an amber "Demo" pill). No dropdown — the old chevron menu with "Clinic
   settings" / "Plan & billing" is gone; Settings has one entry point (see Bottom).
3. **Cockpit zone** (label-less, subtle inset bg): Today `⌘1` ·
   Messages `⌘2` (badge) · Appointments `⌘3`. Driven by
   `ModuleDef.pinned`/`shortcut`; entries also remain in their groups.
4. **Groups** (collapsible; headers stay): Daily (Patients, Leads, Intake) ·
   Growth · Website · Business. **Inbox folds into Messages at nav level**
   — one "Messages" entry; the messages surface exposes a "Mailbox" tab
   linking to /inbox (true data-level merge is future work).
5. **Bottom:** Settings (pinned slot, not a group) → the `/settings` card-grid
   home · avatar + name → profile menu (name + Sign out only; the "Account
   settings" item was removed — Settings is the single entry point). Focused
   settings pages carry a "‹ Settings" back-to-home link in their own header
   (shared `SettingsPage`); there is no cross-page settings rail.

States: active = 2px teal left bar + `teal-500/10` tint + teal icon +
ink-bold label (+ ambient breath); hover = ink/4% bg. Badges: **amber**
count pills (warn semantics, not teal); rail shows a dot, the flyout shows
the number.

**Header (56px):** left = hamburger (<lg) + page title (settings pages instead
carry a "‹ Settings" back-to-home link in their own header — see nav Bottom);
right = **`+ New ▾`
quick-create** (context-aware default: booking on /appointments, patient
on /patients; `C` opens it; entries plan-gated: Booking / Patient / Lead /
Campaign / Post) · bell (amber unread) · demo "Exit demo" chip when active
· help · theme · avatar.

**Demo/billing banners → chrome chips:** the full-width orange strip dies.
Demo = amber 3px top hairline + org-switcher pill + header exit chip.
Dunning/activation banners become a slim header-adjacent chip row that
expands on click (same logic/components, slimmer skin).

**Keyboard:** `⌘K` palette · `[` sidebar · `⌘1/2/3` cockpit · `C` create ·
`G then P/A/L` go-to Patients/Appointments/Leads · `Esc` closes the
topmost surface.

---

## Part 5 — Component inventory & v2 specs

Import from `@/components/ui/...` — same inventory as v1, re-skinned:

| Component | File | v2 treatment |
|---|---|---|
| `PageHeader` | `page-header.tsx` | eyebrow teal-700 caps · H1 ink-900 tracking-tight · subtitle ink-600 · legend slot · actions top-right (one primary). Aura halo behind this zone. |
| `ActionButton` | `action-button.tsx` | primary = teal-500 fill (dark: teal-400 + ink-900 text), hover teal-600, radius 6px, press scale(.97), ambient breath on the page's single primary only · secondary = surface-2 + hairline ring · ghost = transparent ink-600 · danger = rose. |
| `StatusPill` | `status-pill.tsx` | pill radius; tone fills per Part 1 (info = indigo); 12px floor; `title` explains. |
| `FilterChip` | `filter-chip.tsx` | 4px radius; active = teal-500/10 bg + teal-700 text + hairline-strong ring (selection ≠ status); count inside; `aria-pressed`; `title` on emoji. |
| `GlyphCluster` | `glyph-cluster.tsx` | mechanics unchanged; registry ids only. |
| `EncodingLegend` | `encoding-legend.tsx` | popover = surface-1 + shadow-pop + 12px radius; indigo info swatch. |
| `EmptyState` | `empty-state.tsx` | surface-sunk well; ink-600 copy; one primary CTA; no illustrations. |
| `BulkBar` | `bulk-bar.tsx` | floating surface-2 + shadow-pop + 12px radius; slides up fast/ease-out; explicit verbs. |
| `KpiStat` | `kpi-stat.tsx` | Geist Mono numerals (text-3xl ink-900), ink-500 caps label, etched card, hover lift only when drillable, count-up per Part 3. |
| `FlashToast` | `flash-toast.tsx` | motion per Part 3; tone-tinted hairline edge, not full-bleed fills. |

Tables/agenda rows: header row surface-sunk + ink-500 caps labels; row
hover bg tint (instant); selected row = teal inner ring
(`inset 0 0 0 1px teal-500/40` + teal-500/5 bg); aging left-borders
unchanged. Drawers/modals: surface-2, 12px radius, shadow-modal, hairline
separators, ✕ + Esc + scrim always. Skeletons: shared `.skeleton` shimmer
shaped to real layout. Headless UI modals/drawer/Tooltip/`form-input`
classes kept, re-skinned at the token level.

---

## Part 6 — Page anatomy, interaction rules, migration, boundaries

**Page anatomy v2:**

```
<PageHeader eyebrow="Daily · {Org}" title="Appointments"
            subtitle="one calm line about what this page is for"
            legend={<EncodingLegend …/>}
            actions={<ActionButton variant="primary">+ New booking</ActionButton>} />
[Attention band — what needs doing now, each item one-click actionable]
[Filter row — FilterChips (multi-state) + selects (single-pick) + search]
[Content — list/table/cards; aging borders; glyphs; inline quick actions]
[BulkBar — when rows are selectable]
[FlashToast — after any mutation]
```

Interaction rules (v1, unchanged): lists' primary scan target `text-sm
font-medium` with ≤2 inline quick actions, whole row → drawer, names → the
entity; drawers order identity → context stats → actions (primary first) →
content → destructive separated at the bottom; chips = visible toggleable
counted states, selects = single-pick from many; **every server action
resolves to visible feedback** (FlashToast or inline error) — silent
success is a bug. Voice: warm, plain, anti-shame — "3 still need a text,"
never "3 records pending confirmation."

**The legend requirement (unchanged):** any page rendering glyphs, aging
borders, or non-self-labeled pills mounts `<EncodingLegend>` declaring
exactly what it uses; the registry in `lib/ui/encodings.ts` is the only
place marks are defined.

**Migration checklist (per module — definition of done):**
- [ ] Surfaces: `bg-white dark:bg-gray-800 shadow-sm rounded-xl` (and kin)
      → the keystone's etched-surface utility; no resting shadows; radius
      per scale
- [ ] Numerals → Geist Mono where KPI/money/time/count
- [ ] Primary buttons/links/active states → teal; one-primary rule holds
- [ ] Info-tone surfaces verified indigo (legend included)
- [ ] Motion only per Part 3 (drawer/modal/toast/skeleton classes);
      never-animate list respected
- [ ] PageHeader/ActionButton/StatusPill/FilterChip/GlyphCluster/
      EmptyState/BulkBar/KpiStat/FlashToast used everywhere applicable
- [ ] Typography floor + tabular-nums + aria-labels intact; dark mode
      intact on every changed element
- [ ] Module tests updated preserving INTENT; `pnpm typecheck` + tests +
      **`pnpm build`** green (UI PRs always run the real build)

**Hard boundaries for implementation agents:**
- UI layer only: do NOT change `lib/services/**` behavior, server-action
  semantics, routes/URLs, or DB schema.
- Do NOT touch `app/site`, `app/(portal)`, `app/(marketing)`,
  `components/clinic-site`, `components/marketing`,
  `components/patient-portal` visuals.
- Do NOT introduce an animation library or `next/font/google`.
- Do NOT use teal for any status meaning, anywhere.
- The encodings registry changes ONLY via the keystone (info→indigo);
  module agents consume, never redefine.
- Module agents do NOT edit shared primitives (`components/ui/*`,
  `lib/ui/*`) — note shortfalls in your report instead.
- Keep demo-data compatibility: the Acme demo must exercise every state
  you render.
