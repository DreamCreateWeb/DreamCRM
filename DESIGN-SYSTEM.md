# DreamCRM Dashboard Design System — Actions First

The durable UI/UX system for the **authenticated dashboard** (`app/(default)`
+ `app/(double-sidebar)`). It operationalizes DESIGN.md principles 6–9
(action at a glance · ball-in-court · aging is visible · office-manager UX)
and the accessibility rule *"color always paired with shape, icon, or text —
never alone."*

**Scope boundary:** this system does NOT apply to the public clinic sites
(`app/site`), the patient portal (`app/(portal)`), the marketing site
(`app/(marketing)`), auth, or onboarding. Those have their own design
languages — leave them alone.

---

## The doctrine: actions first

Every screen answers, in order: **(1) what needs doing → (2) how to do it in
one click → (3) the data behind it.** A front-desk person mid-morning-rush
should never have to interpret, decode, or hunt.

Five enforceable rules:

1. **Lead with the action.** The page's single most useful action is a solid
   violet button, top-right in the `PageHeader`. Attention surfaces (cards,
   queues) come before raw data, and each carries its own one-click action.
   Empty states say what to do next, not just "no data."
2. **One primary per surface.** Exactly one `variant="primary"` ActionButton
   per page header, per drawer, per modal. Everything else is secondary or
   ghost. Destructive actions are `danger`, never adjacent to the primary.
3. **Every encoding is explained.** Any page using glyphs, aging borders, or
   color-coded pills mounts `<EncodingLegend>` in its header — and every
   individual mark carries `title` + `aria-label`. No color or icon may
   carry meaning alone, anywhere.
4. **Readability floor.** Nothing below `text-xs` (12px). Primary content is
   `text-sm`+. No `text-gray-400` (or lighter) for meaningful text in light
   mode. Numbers use `tabular-nums`. Zero values keep full contrast.
5. **Same pattern everywhere.** One header, one chip, one pill, one empty
   state, one bulk bar. A user trained on one module already knows the next.

---

## Semantic tone contract

Six tones, one hue per meaning, defined in `lib/ui/encodings.ts`. **Never
introduce a status color outside this table.**

| Tone | Hue | Means | Examples |
|---|---|---|---|
| `ok` | emerald | healthy · done-good · confirmed · fresh | confirmed, converted, paid, active, synced |
| `warn` | amber | **needs OUR action** · aging · due | unconfirmed, recall due, pending review, new applicant |
| `urgent` | rose | overdue · failed · problem NOW | overdue, failed send, past-due, no-show, cancelled, sync error |
| `info` | sky | in flight · ball in THEIR court | sent, clicked, contacted, trialing, syncing |
| `special` | violet | new arrival · featured · selected | new lead, just booked, featured review |
| `neutral` | gray | inert · archived · n/a · draft | archived, draft, skipped, completed-neutral |

Division of labor between encodings (don't overload one):
- **Pills** (`StatusPill`) = categorical *state*.
- **Aging left-borders** (`AGING_TIERS`) = *time urgency*, drifting
  fresh → quiet → aging → late → overdue. Per-module thresholds live in
  `lib/ui/encodings.ts` (leads/messages helpers, appointments mapping).
- **Glyphs** (`GlyphCluster`) = per-row *flags* (★ 🎂 $ 📝! ⚠️ 💤 🔕 🆕 📅 ⏱),
  always from the registry.

Ball-in-court (DESIGN.md p7): warn/urgent only when the next move is OURS.
When we've acted and the patient hasn't replied yet, the row goes quiet
(`info`/`neutral`) — signals that can't be acted on are noise.

## Typography & contrast rules

- Floor: `text-xs` (12px). **Banned:** `text-[11px]`, `text-[10px]`,
  `text-[9px]`, `text-[8px]`, `text-[0.x rem]` below 0.75rem.
- Primary row content (names, values): `text-sm` minimum, `font-medium`+
  for scan targets. Section labels: `text-xs font-semibold uppercase
  tracking-wider text-gray-500 dark:text-gray-400`.
- Body-copy grays: `text-gray-500` is the lightest allowed on white;
  `dark:text-gray-400` the lightest on dark. `gray-400`-on-white only for
  decorative/disabled. Never dim a number because it's zero.
- All stats/counts/money: `tabular-nums`.
- Every interactive icon-only element has `aria-label`; every truncation
  has `title`.

## Component inventory (import from `@/components/ui/...`)

| Component | File | Use |
|---|---|---|
| `PageHeader` | `page-header.tsx` | Every module page: eyebrow · H1 · subtitle · legend · actions |
| `ActionButton` | `action-button.tsx` | All buttons/link-buttons: `primary` `secondary` `danger` `ghost`, `sm`/`md`, `href?` |
| `StatusPill` | `status-pill.tsx` | All status pills; tone from the contract; `title` explains |
| `FilterChip` | `filter-chip.tsx` | All list filters; `count?`, `aria-pressed`, `title` required w/ emoji |
| `GlyphCluster` | `glyph-cluster.tsx` | THE glyph renderer; ids via `patientFlagGlyphs`/`appointmentFlagGlyphs` |
| `EncodingLegend` | `encoding-legend.tsx` | "Key" popover; `glyphs`/`aging`/`pills` props; registry-driven |
| `EmptyState` | `empty-state.tsx` | All empty lists/sections; icon · title · body · action |
| `BulkBar` | `bulk-bar.tsx` | Floating selection bar; explicit verbs ("Send 4 reminders") |
| `KpiStat` | `kpi-stat.tsx` | Stat tiles; `href` makes the number drillable |
| `FlashToast` | `flash-toast.tsx` | Action feedback; replaces hand-rolled setTimeout toasts |

Existing kept primitives: Headless UI modals (`components/modal-*.tsx`),
drawer (`components/ui/drawer.tsx`), `Tooltip`, form classes (`form-input`
etc.), `.btn*` base classes, charts. Keep using them.

## Page anatomy

```
<PageHeader eyebrow="Daily · {Org}" title="Appointments"
            subtitle="one calm line about what this page is for"
            legend={<EncodingLegend glyphs={[...]} aging="appointments" pills={[...]} />}
            actions={<ActionButton variant="primary">+ New booking</ActionButton>} />
[Attention band — what needs doing now, each item one-click actionable]
[Filter row — FilterChips (multi-state) + selects (single-pick) + search]
[Content — list/table/cards; aging borders; glyphs; inline quick actions]
[BulkBar — when rows are selectable]
[FlashToast — after any mutation]
```

- **Lists:** primary scan target `text-sm font-medium`; inline quick action
  (≤2) for the single most common verb (e.g. "Confirm"); everything else in
  the row's drawer. Whole row clickable → drawer/detail; clickable names →
  the entity.
- **Drawers/modals:** identity header → context stats → action group
  (primary first, then secondary verbs) → content → destructive actions
  separated at the bottom, never beside the primary.
- **Chips vs dropdowns:** chips = visible, toggleable, counted states;
  native selects = single-pick from many (provider, source). Don't mix
  styles within a module.
- **Feedback:** every server action resolves to visible feedback (FlashToast
  success/failure or inline error) — silent success is a bug.

## The legend requirement

A page that renders ANY of: glyph clusters · aging borders · status pills
beyond self-labeled text, MUST mount `<EncodingLegend>` in `PageHeader`'s
`legend` slot, declaring exactly the encodings that page uses. The legend
content lives in `lib/ui/encodings.ts` — extend the registry there if a
module needs a new mark (and only there; ad-hoc symbols are banned).

## Migration checklist (per module — definition of done)

- [ ] Page uses `PageHeader` (eyebrow `Section · Context`, real subtitle,
      primary action top-right, legend mounted when encodings present)
- [ ] All buttons → `ActionButton` with correct variants; exactly one
      primary per surface; destructive separated + `danger`
- [ ] All status pills → `StatusPill` with tones from the contract (re-map
      the module's statuses; don't keep legacy colors that conflict)
- [ ] Glyphs → shared `GlyphCluster` + registry ids; module-local glyph
      components deleted
- [ ] Aging borders → `agingBorderClass` + registry tiers; thresholds from
      `lib/ui/encodings.ts` helpers
- [ ] All filters → `FilterChip` (+ selects for single-pick); emoji chips
      carry `title`
- [ ] Empty states → `EmptyState` with a next-step action where one exists
- [ ] Bulk flows → `BulkBar`; toasts → `FlashToast`
- [ ] Typography floor enforced (no sub-12px, no gray-400 meaningful text,
      `tabular-nums` on numbers)
- [ ] Dark mode intact on every changed element
- [ ] Module tests updated to the new copy/structure — preserving each
      test's INTENT (what it proves), not just making it pass
- [ ] `pnpm typecheck` + module tests green

## Hard boundaries for implementation agents

- UI layer only: do NOT change `lib/services/**` behavior, server actions'
  semantics, routes/URLs, or DB schema. (Moving presentation helpers like
  class maps OUT of view files is fine.)
- Do NOT edit shared primitives (`components/ui/*`, `lib/ui/*`) or another
  module's files — if a primitive falls short, note it in your report and
  work around locally.
- Do NOT touch `app/site`, `app/(portal)`, `app/(marketing)`, `app/(auth)`,
  `app/(onboarding)`, `components/clinic-site`, `components/marketing`,
  `components/patient-portal`.
- Keep demo-data compatibility: the Acme demo must exercise every state you
  render (it already does — don't add UI states it can't reach).
- Voice: warm, plain, anti-shame (DESIGN.md). "3 still need a text", never
  "3 records pending confirmation".
