# DreamCRM Dashboard Design System v3 — "Cute Dream, Living Data"

The binding UI/UX system for the **authenticated dashboard** (`app/(default)`
+ `app/(double-sidebar)`), plus auth/onboarding chrome where noted. v3 keeps
v2's actions-first doctrine, the entire semantic-encoding contract, the
legibility rules, and the token ARCHITECTURE (names, single homes, CI
guards) — and replaces the visual language: v2's etched navy instrument
panel gives way to a soft, rounded, dream-blue world that matches the brand
name and the product's warm anti-shame voice. Bubbles, soft blue shadows,
rounded corners, springy micro-motion, and data that visibly lives
(sparklines, rings, feeds). The owner-approved direction mockup lives in
the 2026-07-17 session log ("Cute Dream — direction exploration 01").

**Why v3 exists:** the product is named Dream, the copy says "3 still need
a text," and the v2 chrome said "trading terminal." Competitors (Dental
Intelligence) read as alive and premium mostly through data-richness and
surface warmth. v3 aligns the visuals with the voice — friendly-premium,
not austere-premium — and makes living data a first-class law.

**Scope boundary (unchanged):** NOT the public clinic sites (`app/site`),
the patient portal (`app/(portal)`), or the marketing site
(`app/(marketing)`). Those keep their own languages. Auth + onboarding
receive the v3 *brand* (logo, dream blue, ink, fonts) but stay structurally
simple.

---

## Part 0 — Doctrine

**Actions-first survives verbatim.** Every screen answers, in order: (1)
what needs doing → (2) how to do it in one click → (3) the data behind it.
The five v1 rules still bind:

1. **Lead with the action.** One solid primary in the PageHeader, attention
   surfaces before raw data, empty states say what to do next.
2. **One primary per surface** (page header / drawer / modal). Primary is
   now the **dream-blue gradient bubble**. Destructive = `danger`, never
   adjacent to the primary.
3. **Every encoding is explained** — `<EncodingLegend>` wherever glyphs,
   aging, or coded pills appear; every mark carries `title` + `aria-label`;
   color never carries meaning alone.
4. **Readability floor** — nothing under 12px (`text-xs`); primary content
   `text-sm`+; no decorative-gray meaningful text; `tabular-nums` everywhere
   numeric; zeros keep full contrast.
5. **Same pattern everywhere** — one header, chip, pill, empty state, bulk
   bar across all modules.

**Three v3 laws (replacing v2's restraint laws 6–8):**

6. **Soft reads friendly; friendly reads premium here.** Cards FLOAT on
   soft dream-blue shadows (the etched hairline-only doctrine is retired).
   Corners are round (the bubble radius scale), chips are pills, and the
   surface temperature is a morning sky. Hierarchy still comes from ink
   weight, size, and elevation — never color spray. The brand hue stays
   rationed (Part 2).
7. **Every number wants a heartbeat.** A KPI without a sparkline, ring,
   trend hint, or delta is a missed opportunity — the dashboard should
   visibly LIVE (the Dental Intelligence lesson). Feeds animate in; counts
   count up (once); "live" states pulse. Budgeted, not busy: per surface,
   every stat may carry ONE heartbeat element.
8. **Instant first, alive second.** Anything a front desk does 100×/day
   gets instant feedback and zero flourish. The motion budget is spent on
   entrances, heartbeats, and the two signature moments (Part 3).

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

**Two changes in v3:** the brand moved teal → dream blue, so `info` vacates
**indigo → violet** (periwinkle — indigo is indistinguishable from a blue
brand at pill size) and `special` moves **violet → fuchsia** (a pink
"celebrate" accent that suits new arrivals and fits the dream).

| Tone | Means (unchanged) | v3 hue |
|---|---|---|
| `ok` | healthy · done-good · confirmed | emerald (unchanged) |
| `warn` | **needs OUR action** · aging · due | amber (unchanged) |
| `urgent` | overdue · failed · problem NOW | rose (unchanged) |
| `info` | in flight · ball in THEIR court | **violet** (was indigo) |
| `special` | new arrival · featured · celebrated | **fuchsia** (was violet) |
| `neutral` | inert · archived · draft | ink/gray ramp |

**The brand hue is NEVER a status.** Identity only: primary actions,
selection, focus, links, active nav, chart series 1. A brand-blue pill is a
contract violation. Badges meaning "needs attention" (sidebar counts
included) are `warn` amber.

---

## Part 2 — Foundations

### 2.1 Color tokens (Tailwind 4 `@theme` in `app/css/style.css`)

Components reference tokens (or the re-tinted `gray` ramp) — never raw hex.
`.dark` overrides the same custom properties; no parallel palette. **v3
kept every token NAME from v2 — only values moved — so consumers reskinned
without an edit.**

```css
/* Canvas & surfaces — LIGHT (soft morning sky) */
--color-canvas:          #F3F7FE;  /* app background */
--color-surface-1:       #F8FAFF;  /* raised panel */
--color-surface-2:       #FFFFFF;  /* cards, inputs — top of stack */
--color-surface-sunk:    #E9F0FC;  /* wells, table headers */
--color-hairline:        #E0E9F8;  /* 1px separation where needed */
--color-hairline-strong: #CBD9F2;

/* Ink — blue-leaning navy neutrals */
--color-ink-900: #1A2440;  --color-ink-800: #22304E;  /* brand navy */
--color-ink-700: #33405F;  --color-ink-600: #4C5A78;
--color-ink-500: #5E6E8C;  --color-ink-400: #93A0BC;  /* disabled only */

/* Dream-blue brand ramp (hue ~222 — warm, friendly blue) */
--color-teal-50:#EEF4FF; --color-teal-100:#DCE8FF; --color-teal-200:#C1D6FF;
--color-teal-300:#9DBDFF; --color-teal-400:#7CA5FF; /* dream sky — dark fill */
--color-teal-500:#4C7DF0; /* primary fill (light) */
--color-teal-600:#3A67D9; /* hover/pressed */
--color-teal-700:#2F52B3; /* deep dream — focus rings, gradient anchor */
--color-teal-800:#27418A; --color-teal-900:#1F3266;

/* DARK (.dark): dream-at-night world — deep navy sky, luminance = elevation */
--color-canvas:#10182E; --color-surface-1:#161F3A; --color-surface-2:#1B2544;
--color-surface-sunk:#0C1226;
--color-hairline:rgb(124 163 255 / .10);
--color-hairline-strong:rgb(124 163 255 / .16);
/* blue fills brighten to the 400 dream sky on dark */
```

**The ramp trick, one level up:** the brand ramp rides the **`teal-*`
variable names** on purpose. 151 dashboard files use `teal-*` utilities;
re-pointing the ramp in ONE place reskinned every one of them. `teal-*` IS
the brand ramp; the hue it resolves to is the design system's business.
(Same mechanism as the re-tinted `gray-*` ramp, now blue-cool:
50:#F3F7FE · 100:#E9F0FC · 200:#E0E9F8 · 300:#C3D0E8 · 400:#93A0BC ·
500:#5E6E8C · 600:#4C5A78 · 700:#33405F · 800:#22304E · 900:#1A2440 ·
950:#10182E.) New/touched code prefers semantic tokens; the gray ramp is
the compatibility layer. A rename sweep (`teal-*` → `brand-*`) is optional
future hygiene, mechanical, and low-priority.

**Accent usage rules:** one brand-gradient primary action per surface; the
brand hue is also allowed for focus rings, links, selected/active states
(nav pill, selected row ring, toggle-on, active chip), and chart series 1.
Everything else is neutral. Labels/eyebrows: `text-xs font-semibold
uppercase tracking-wider` ink-500; the page-title eyebrow may be teal-700.

### 2.2 Typography

- **UI + body: Nunito** — the v3 face: rounded terminals, friendly, warm.
  SELF-HOSTED variable woff2 (weight 200–1000) in `public/fonts/`
  (latin + latin-ext), declared via `@font-face` in style.css. NO
  `next/font/google` (build env can't reach Google — banned in CLAUDE.md),
  NO runtime Google `<link>` in the dashboard (flash + third-party fetch).
  Geist Sans stays in the stack as fallback. Headings `font-extrabold`
  (800) — Nunito's weight is its charm; tracking stays near 0 (rounded
  faces don't want negative tracking).
- **Numerals: Geist Mono** for KPI hero numbers, money, times, and count
  columns — tabular figures stay crisp against the rounded text face. Body
  numerals keep `tabular-nums`.
- Size ramp unchanged. **Visibility rules (2026-07-06 — binding):** the
  product is built for imperfect vision. Two tests every screen must pass:
  **"Where am I? What am I doing?"** and **"never squint."**
  - **12px floor, enforced** (CI): `text-[11px]`/`text-[10px]` and
    sub-0.75rem literals banned everywhere. Badges sit AT the floor, never
    under. Prefer rem sizes — px doesn't scale with the text-size setting.
  - **Contrast**: `gray-500` lightest meaningful on white, `dark:gray-400`
    lightest on dark; never dim a zero; no hover-to-reveal data.
  - **Text-size setting**: per-device Standard/Large/Extra-large scales the
    ROOT font-size (`html.dc-text-lg`/`.dc-text-xl`).
  - Every icon-only interactive has `aria-label`; truncations carry
    `title`; hit targets ≥40px for primary controls.
- Public site keeps Fraunces/Inter; portal and marketing unchanged.

### 2.3 Radius scale (the bubble scale)

`--r-xs:8px` chips/badges/inputs · `--r-sm:12px` buttons · `--r-md:16px`
cards · `--r-lg:22px` panels/modals/drawers · `--r-pill:9999px` pills,
avatars & nav items. Same names as v2 — only values moved. Squares are
over; data tables keep straight rows inside rounded cards.

### 2.4 Elevation & surfaces (floating bubbles)

- Resting card = `bg-surface-2` + `--r-md` + **`--shadow-card`** (soft
  dream-blue). The v2 etched inset-hairline ring is RETIRED — separation is
  elevation + the sky-tinted canvas, not borders.
- Panels = surface-1 + `--r-lg`; wells/table-heads = surface-sunk.
- Hover (pointer-fine only): shadow deepens to `--shadow-pop` +
  `translateY(-3px)` on *interactive cards only*; plain rows get bg tint.
- Shadows (dream-blue in light, deep navy-black at night — never pure
  black in light):
  `--shadow-xs: 0 1px 3px rgb(76 125 240/.07)` ·
  `--shadow-card: 0 2px 6px rgb(76 125 240/.06), 0 10px 28px rgb(76 125 240/.11)` ·
  `--shadow-pop: 0 4px 10px rgb(76 125 240/.10), 0 18px 44px rgb(76 125 240/.16)` ·
  `--shadow-modal: 0 16px 48px rgb(30 42 74/.18), 0 32px 72px rgb(30 42 74/.20)`
- Focus ring (dream blue, on every focusable):
  `0 0 0 2px rgb(76 125 240/.50), 0 0 0 4px rgb(76 125 240/.22)`.
- **Chrome aura (signature, chrome-only):** one soft radial dream-blue glow
  bleeding from the shell's top-left + the 2–3% grain overlay on the canvas.
  Never behind data surfaces. Decorative floating bubble circles are
  allowed in CHROME zones only (page-header/hero bands), `--color-teal-*`
  at ≤16% alpha, `pointer-events:none`, gentle float ≤10px.

---

## Part 3 — Motion system ("springy, not bouncy-castle")

CSS-first. **No animation library.** Hard ceiling 300ms for UI transitions.
All v2 tokens survive; v3 adds the cute overshoot:

```css
--dur-instant:90ms; --dur-fast:140ms; --dur-base:200ms; --dur-slow:260ms;
--dur-cinematic:480ms; /* signature moments only */
--ease-out:cubic-bezier(.23,1,.32,1);         /* default (out-quint) */
--ease-ios:cubic-bezier(.32,.72,0,1);         /* drawers */
--ease-emphasis:cubic-bezier(.19,1,.22,1);    /* signature reveals */
--spring-gentle / --spring-subtle             /* linear() springs (v2) */
--spring-pop:cubic-bezier(.34,1.56,.64,1);    /* v3 overshoot — small things */
```

**Choreography (v2 rules survive, plus):** `--spring-pop` is for SMALL
entrances only — feed icons, chips, badges, the confirmation-ring fill —
never panels/pages (overshoot on big surfaces reads as wobble). Drawer/
modal/popover/toast/skeleton/stagger rules unchanged. Button/card press
`scale(.97)` instant; row hover = bg tint, instant.

**KPI count-up:** once per session entry on the Overview, ≤700–900ms,
ease-out, Geist Mono, snaps under reduced-motion. Never on
re-query/filter/drawer.

**Heartbeat elements (law 7, budgeted):** sparkline draw-in ≤1.1s once;
ring fill ≤1.1s once; "live" dot pulse ~1.8s loop (compositor-only);
activity-feed stagger 100–140ms, first reveal only, ≤6 rows.

**Signature moments (exactly two — resist the third):**
1. **Morning reveal** — on dashboard entry: the blue aura washes in behind
   the page header, attention cards cascade once, KPIs count up, sparklines
   draw, the ring fills — one orchestrated beat.
2. **Ambient breath** — the active nav pill + the page's single primary
   carry a ~6s compositor-only gradient drift. Subliminal.

(Dark-mode canvas stars are a THEME property, not a motion moment — a
static/very-slow-twinkle decorative layer behind everything, killed under
reduced-motion. They live in the shell canvas only.)

**Never animate (unchanged):** table/agenda re-sort/re-filter (rows snap);
text being read; keyboard-driven actions; 100×/day interactions beyond
instant feedback; layout properties (transform/opacity only);
inline-validation appearance; `scale(0)` entrances; sidebar active-state on
click.

**A11y/perf:** global `prefers-reduced-motion: reduce` kills transforms,
shimmer, count-up, pops, pulses, twinkle, and aura drift — keeps
opacity/color fades. Hover motion gated `(hover:hover) and (pointer:fine)`.
`will-change` only while actively animating.

---

## Part 4 — Shell & navigation v3

**Sidebar (3 states, structure unchanged):** expanded 248px, icon rail
64px (`[` toggle), overlay drawer (<`lg`). Rail mode keeps hover-flyout
labels. Anatomy (logo → org label → cockpit ⌘1/2/3 → groups → Settings +
avatar) unchanged from v2 Part 4.

**v3 states:** active = **full gradient pill** (`rounded-full`,
`from-teal-400 to-teal-600`, white text + white icon, soft blue glow
shadow, + ambient breath) — the v2 left-bar + tint is retired; hover =
ink/4% bg, `rounded-full`. Badges: **amber** count pills (warn semantics,
never brand); rail shows a dot, the flyout shows the number.

**Header (56px):** unchanged structurally — hamburger + title left;
`+ New ▾` quick-create, bell, demo chip, help, theme, avatar right.

**Keyboard (unchanged):** `⌘K` · `[` · `⌘1/2/3` · `C` · `G then P/A/L` ·
`Esc`.

---

## Part 5 — Component inventory & v3 specs

Import from `@/components/ui/...` — same inventory, re-skinned:

| Component | File | v3 treatment |
|---|---|---|
| `PageHeader` | `page-header.tsx` | eyebrow teal-700 caps · H1 ink-900 extrabold · subtitle ink-600 · legend slot · actions top-right (one primary). Aura halo + optional bubble decor behind this zone. |
| `ActionButton` | `action-button.tsx` | primary = dream gradient (`from-teal-400 to-teal-600`, white text BOTH themes, soft glow shadow, hover deepens), radius 12px via `.btn`, press scale(.97), breath on the page's single primary only · secondary = surface-2 + hairline · ghost = transparent teal-700 text · danger = rose. |
| `StatusPill` | `status-pill.tsx` | pill radius; tone fills per Part 1 (info = violet, special = fuchsia); 12px floor; `title` explains. |
| `FilterChip` | `filter-chip.tsx` | pill radius (`--r-xs` ≥8px or full pill); active = teal-500/10 bg + teal-700 text (selection ≠ status); count inside; `aria-pressed`. |
| `GlyphCluster` | `glyph-cluster.tsx` | mechanics unchanged; registry ids only. |
| `EncodingLegend` | `encoding-legend.tsx` | popover = surface-1 + shadow-pop + `--r-lg`; violet info swatch, fuchsia special swatch. |
| `EmptyState` | `empty-state.tsx` | surface-sunk well, `--r-md`; ink-600 copy; one primary CTA. The ONE sanctioned mascot home: the small SVG tooth may appear in empty states and the schedule-gap card — nowhere else. |
| `BulkBar` | `bulk-bar.tsx` | floating surface-2 + shadow-pop + `--r-lg` (or pill); slides up fast; explicit verbs. |
| `KpiStat` | `kpi-stat.tsx` | Geist Mono numerals (text-3xl ink-900), ink-500 caps label, floating card, hover lift when drillable, count-up per Part 3, **heartbeat slot** (`spark` — law 7). |
| `ProgressRing` | `progress-ring.tsx` | Share-of-whole heartbeat: brand ring fills once on mount (≤1.1s), % text inside, REQUIRED `label` aria + always paired with visible text; renders nothing at max ≤ 0; reduced-motion snaps. |
| `FlashToast` | `flash-toast.tsx` | motion per Part 3; tone-tinted edge (info edge = violet). |

Tables/agenda rows: header row surface-sunk + ink-500 caps labels; row
hover bg tint (instant); selected row = brand inner ring
(`inset 0 0 0 1px teal-500/40` + teal-500/5 bg); aging left-borders
unchanged. Drawers/modals: surface-2, `--r-lg`, shadow-modal, ✕ + Esc +
scrim always. Skeletons: shared `.skeleton` shimmer. Headless UI kept,
re-skinned at the token level.

---

## Part 6 — Page anatomy, interaction rules, migration, boundaries

**Page anatomy (unchanged):** PageHeader → attention band → filter row →
content → BulkBar → FlashToast. Interaction rules unchanged (drawer order,
chips-vs-selects, every server action resolves to visible feedback). Voice:
warm, plain, anti-shame — "3 still need a text."

**The legend requirement (unchanged):** any page rendering glyphs, aging
borders, or non-self-labeled pills mounts `<EncodingLegend>`; the registry
in `lib/ui/encodings.ts` is the only place marks are defined.

**v3 migration checklist (per module — definition of done):**
- [ ] Surfaces ride `.v2-card`/`.v2-panel`/tokens (they float now for
      free); kill any lingering local `border`+`shadow-sm` card recipes
- [ ] Numerals → Geist Mono where KPI/money/time/count
- [ ] Primary buttons/links/active states → brand gradient/hue; one-primary
      rule holds
- [ ] Info-tone surfaces verified VIOLET, special verified FUCHSIA (legend
      included) — no indigo literals left in the module
- [ ] Law 7 pass: each KPI/stat surface carries its one heartbeat
      (sparkline/ring/delta/live-dot) fed by REAL data (no fake content)
- [ ] Motion per Part 3; never-animate list respected; `--spring-pop` only
      on small elements
- [ ] Primitives used everywhere applicable; typography floor +
      tabular-nums + aria-labels intact; dark ("dream at night") verified
- [ ] Module tests updated preserving INTENT; `pnpm typecheck` + full
      `pnpm test` + **`pnpm build`** green

**Hard boundaries for implementation agents (unchanged where not noted):**
- UI layer only: do NOT change `lib/services/**` behavior, server-action
  semantics, routes/URLs, or DB schema.
- Do NOT touch `app/site`, `app/(portal)`, `app/(marketing)`,
  `components/clinic-site`, `components/marketing`,
  `components/patient-portal` visuals.
- Do NOT introduce an animation library or `next/font/google`.
- Do NOT use the brand hue for any status meaning, anywhere.
- The encodings registry changes ONLY via the keystone; module agents
  consume, never redefine.
- Module agents do NOT edit shared primitives (`components/ui/*`,
  `lib/ui/*`) — note shortfalls in your report instead.
- The tooth mascot appears ONLY in the two sanctioned homes (empty states,
  schedule-gap). One flourish, everywhere = zero flourishes.
- Keep demo-data compatibility: the demo clinic must exercise every state
  you render.
