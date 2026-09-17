'use client'

import { MONO_LABEL, DAY_WIRE } from '@/components/marketing/ui'

/**
 * THE CINEMA STAGE — the picture the chapter cards scroll over, and since
 * DREAMCRM-82 a FOUR-STATE one rather than a single frozen screenshot.
 *
 * The owner, on the built section:
 *
 *   "the cards discuss a transition of a patient through the system, but the
 *    card in the background should literally show that journey"
 *
 * He is right, and the old stage was the defect he named: one illustration —
 * today's schedule, three KPI tiles, an eight-week bar chart — identical at
 * every scroll position, while four chapter cards narrated a patient moving
 * through the product. Four screens of scroll saying one thing.
 *
 * ── WHAT MAKES IT LEGIBLE: ONE PATIENT, ONE ROW ─────────────────────────
 *
 * Rosa Silva sits at the top of the queue panel in all four scenes and the
 * only thing about her that changes is her status pill:
 *
 *   01 the queue   `6 mo overdue`          · the recall panel naming why
 *   02 the text    `Confirmed · Thu`      · the SMS thread and the PMS write
 *   03 the balance `Balance cleared`       · her portal and the ledger
 *   04 the review  `Review received`       · her words, live on the site
 *
 * Because her row persists and only its pill changes, the journey is readable
 * to somebody scrolling fast: the eye has ONE anchor rather than four unrelated
 * pictures. The numbers move with the story and only where the story earns it —
 * recalls recovered 31 → 38 (her booking is the seventh), collected this week
 * $9,480 → $9,664, which is exactly +$184, her balance.
 *
 * ── WHY EVERY COLOUR HERE IS SPELLED OUT AND HAND-GRADED ────────────────
 *
 * The stage is deliberately NOT in `DECORATIVE_MOCKS` (`e2e/axe.ts`) and must
 * stay out. Those two entries pardon the hero's miniature mocks under WCAG
 * 1.4.3 — text inside a picture, at 5.8-8.2pt. This is the same product at FULL
 * BLEED, so its type is real reading size, and `exclusionsHidingReadableText`
 * exists precisely to fail a run that pardons that. So `marketing: home` keeps
 * its ceiling of ZERO with every pair in here graded on its own ground.
 *
 * Measured with `tests/a11y/palette.ts` — the one place this repo resolves its
 * own colours — and recorded in `BRAND.md` Part 7:
 *
 *   `#7C4A05` on `#FDF0D8`  6.56   amber pill  (needs a text / overdue)
 *   `#04543C` on `#D7F0E3`  7.47   green pill  (confirmed / paid)
 *   `#4C2CB0` on `#EDE6FE`  7.56   violet pill (balance cleared / live)
 *   `#86206F` on `#FBE3F8`  7.12   pink pill   (review received)
 *   `#1F3D8F` on `#DCE7FD`  7.96   avatar well
 *   `#FFFFFF` on `#1F3D8F`  9.89   Rosa's avatar — the SAME pair inverted,
 *                                  which is what marks her as the anchor
 *   `#04543C` on `#FFFFFF`  8.98   the green delta ink
 *   `#04543C` on `#EAF6F0`  8.10   her cleared line in the ledger
 *   `#10182e` (gray-950) on `#EEF2FE` 15.74, `#4c5a78` (gray-600) 6.17 —
 *                                  her highlighted queue row
 *   `#B45309` on `#FFFFFF`  5.02   the review stars (a graphic, 1.4.11's 3:1)
 *
 * TWO DEPARTURES FROM THE ISSUE'S OWN SPEC, both in the direction of being
 * GRADED rather than merely correct:
 *
 *   · Her reply bubble was specified as white on a `#3A67D9 → #5D47DE`
 *     gradient. **axe reports a gradient as `incomplete`, not as a pass** — it
 *     will not guess which pixel-column to measure — and the source-level
 *     gradient rule (`class-pairs.ts` rule 3) only knows the teal brand ramp,
 *     so an arbitrary-hex gradient under white ink is graded by NOTHING in this
 *     repo. It is a solid `bg-violet-700` (white on `#5D47DE`, 6.14) instead,
 *     which axe measures on every run. Same for the portal's "Receipt emailed"
 *     button, now `bg-teal-700` (white on `#2F52B3`, 7.05). §2b's rule 3
 *     lesson: a tool that answers "can't tell" has not answered "fine".
 *   · The scene-03 phone shows a green "Paid · 11:38am" CHIP rather than the
 *     tick the storyboard drew. `BRAND.md` Part 3 carries the owner's veto on
 *     bland check marks and `tests/marketing/tone-tiles.test.ts` holds it at
 *     zero by grading the shape of a `d` attribute. A tone chip is the answer
 *     the veto already has.
 *
 * Nothing in here is focusable. The toggle in scene 04 and the button in scene
 * 03 are ILLUSTRATION — the zero in `tests/marketing/cinematic-spine.test.tsx`
 * stays zero, because a "learn more" inside a layer that spends most of the
 * scroll at opacity 0 is an invisible focus stop.
 */

const STAGE_CANVAS = '#F3F7FE'

/**
 * THE COLOURED LIGHT — `BRAND.md` Part 3, "depth is emission, not stacking".
 *
 * The build that shipped on DREAMCRM-70 made the right call refusing to veil
 * the product behind the glass (veil a white surface at 55% and `gray-950` ink
 * lands near 3.1:1 at real product size) — but then owed emission and added
 * none, so the stage was flat white. These are the lobes that pay it.
 *
 * EVERY LOBE IS CENTRED OUTSIDE THE FRAME and every panel above them is
 * OPAQUE, so the only text that ever sits on this layer is the header strip at
 * the top — and no lobe reaches it. That is a contrast decision, not a
 * compositional one: axe reads `background-color` and cannot see a
 * `background-image` at all, so a bloom walking the ground down under dark ink
 * is the one defect here that CI would never report (§2b). The worst composite
 * under the header strip is graded in `BRAND.md` Part 7 alongside the pairs
 * above; re-measure it if you move a lobe.
 *
 * NO `backgroundSize` in this object, deliberately — a tiled gradient is a
 * lattice, which is the owner's second veto and what
 * `tests/marketing/no-drawn-grid.test.ts` fails a PR on. One wash, no pitch.
 */
const STAGE_BLOOM = {
  backgroundImage: [
    'radial-gradient(44rem 26rem at 16% 122%, rgb(117 95 248 / 0.30), transparent 68%)',
    'radial-gradient(38rem 24rem at 118% 70%, rgb(76 125 240 / 0.24), transparent 66%)',
    'radial-gradient(34rem 20rem at 86% 128%, rgb(200 0 222 / 0.16), transparent 70%)',
  ].join(','),
} as const

/**
 * TONE TINT PLUS THAT TONE'S DEEP INK — the shape `BRAND.md` Part 7 calls
 * "Rule 5 and the tone tiles", which sits outside `TONE_FILL` by construction:
 * the registry in `lib/ui/encodings.ts` is the DASHBOARD's answer for a solid
 * fill with a label on it, and its window is `bg-<ramp>-<step>` at 300-600
 * under one shared ink. This is an illustration of a product surface on the
 * marketing site, in its own palette, and rule 5 correctly has no opinion.
 *
 * Four tones, one per chapter of Rosa's journey, and the OTHER patients spend
 * the first two of them — so a pill on this stage is never a fresh pairing
 * somebody picked, it is one of these four. Ratios in the file header.
 */
const STAGE_TONE = {
  warn: { ink: '#7C4A05', tint: '#FDF0D8' },
  ok: { ink: '#04543C', tint: '#D7F0E3' },
  info: { ink: '#4C2CB0', tint: '#EDE6FE' },
  praise: { ink: '#86206F', tint: '#FBE3F8' },
} as const

type StageTone = keyof typeof STAGE_TONE

/** The avatar well, and its inverse — which is how Rosa's row is marked. */
const AVATAR_INK = '#1F3D8F'
const AVATAR_WELL = '#DCE7FD'

/** Her row's ground. Everything on it is graded in the file header. */
const ANCHOR_ROW = '#EEF2FE'

/** The green a number moves in. */
const GOOD_INK = '#04543C'

/** The day, as the product actually shows it. Every number here is part of the
 *  mock rather than a claim in our own voice (`BRAND.md` Part 5), and the
 *  names are placeholders. Rosa is not in this list — she is rendered first,
 *  separately, because her row is the one thing that changes. */
const QUEUE: ReadonlyArray<{
  t: string
  name: string
  visit: string
  status: string
  tone: StageTone
  initials: string
}> = [
  { t: '09:30', name: 'Liam Brooks', visit: 'Checkup · 30 min', status: 'Needs a text', tone: 'warn', initials: 'LB' },
  { t: '13:15', name: 'Priya Raman', visit: 'Whitening · 30 min', status: 'Needs a text', tone: 'warn', initials: 'PR' },
  { t: '10:00', name: 'Ana Reyes', visit: 'Hygiene · 45 min', status: 'Confirmed', tone: 'ok', initials: 'AR' },
  { t: '11:30', name: 'Mara Kline', visit: 'Crown seat · 60 min', status: 'Confirmed', tone: 'ok', initials: 'MK' },
  { t: '14:15', name: 'Tom Okafor', visit: 'Filling · 45 min', status: 'Confirmed', tone: 'ok', initials: 'TO' },
]

/** Her row, and the one thing about it that moves. */
const ROSA = { t: '10:45', name: 'Rosa Silva', visit: 'Recall · hygiene', initials: 'RS' }

const ROSA_PILL: ReadonlyArray<{ label: string; tone: StageTone }> = [
  { label: '6 mo overdue', tone: 'warn' },
  { label: 'Confirmed · Thu', tone: 'ok' },
  { label: 'Balance cleared', tone: 'info' },
  { label: 'Review received', tone: 'praise' },
]

type Kpi = { label: string; value: string; delta: string; live?: boolean }

/**
 * The three numbers, per scene. They move where the story earns it and sit
 * still where it does not: recalls recovered ticks 31 → 38 when she books
 * (hers is the seventh), collected this week moves $9,480 → $9,664 when she
 * pays, and that difference is exactly her $184 balance. Exactly one tile is
 * LIVE per scene — the one the chapter just changed.
 */
const KPIS: ReadonlyArray<ReadonlyArray<Kpi>> = [
  [
    { label: 'Chairs filled', value: '83%', delta: '+4 pts this month', live: true },
    { label: 'Recalls recovered', value: '31', delta: 'queue building' },
    { label: 'Collected this week', value: '$9,480', delta: 'Mon–Wed' },
  ],
  [
    { label: 'Chairs filled', value: '94%', delta: '+11 pts this month' },
    { label: 'Recalls recovered', value: '38', delta: '+7 in the last hour', live: true },
    { label: 'Collected this week', value: '$9,480', delta: 'Mon–Wed' },
  ],
  [
    { label: 'Chairs filled', value: '94%', delta: '+11 pts this month' },
    { label: 'Recalls recovered', value: '38', delta: '+7 today' },
    { label: 'Collected this week', value: '$9,664', delta: '+$184 just now', live: true },
  ],
  [
    { label: 'Chairs filled', value: '94%', delta: '+11 pts this month', live: true },
    { label: 'Recalls recovered', value: '38', delta: '+7 today' },
    { label: 'Collected this week', value: '$9,664', delta: 'Mon–Thu' },
  ],
]

/* ── The pieces ──────────────────────────────────────────────────────────── */

/** A panel. One radius, one hairline, one emission — spelled once. */
const PANEL =
  'rounded-2xl border bg-white shadow-[0_0_54px_-30px_rgb(93_71_222/0.55),0_2px_6px_rgb(76_125_240/0.06),0_14px_36px_rgb(76_125_240/0.1)]'

function Pill({ tone, children }: { tone: StageTone; children: React.ReactNode }) {
  const { ink, tint } = STAGE_TONE[tone]
  return (
    <span
      className="shrink-0 rounded-full px-2 py-1 text-[0.75rem] font-bold sm:px-2.5"
      style={{ backgroundColor: tint, color: ink }}
    >
      {children}
    </span>
  )
}

/** A status dot that takes its row's own ink — size and position, never hue
 *  alone, are what survive greyscale (the rail's DREAMCRM-70 lesson). */
function Dot({ tone }: { tone: StageTone }) {
  return (
    <span
      className="mt-[0.45rem] h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: STAGE_TONE[tone].ink }}
    />
  )
}

function Avatar({ initials, anchor }: { initials: string; anchor?: boolean }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold lg:h-9 lg:w-9"
      style={
        anchor
          ? { backgroundColor: AVATAR_INK, color: '#FFFFFF' }
          : { backgroundColor: AVATAR_WELL, color: AVATAR_INK }
      }
    >
      {initials}
    </span>
  )
}

/** THE QUEUE PANEL — the same six people in every scene, Rosa first.
 *
 *  It sizes to its CONTENT. It used to be `flex-1` inside a full-height
 *  column, which at full bleed stretched it and left roughly 400px of blank
 *  white below the last row — visible in both of the owner's screenshots and
 *  the second-worst thing about the old stage after the frozen picture. */
function QueuePanel({ scene }: { scene: number }) {
  const pill = ROSA_PILL[scene]
  return (
    <div className={`${PANEL} shrink-0 p-4 lg:w-[22rem] lg:p-5 xl:w-[25rem]`} style={{ borderColor: DAY_WIRE }}>
      <p className="text-[1.05rem] font-bold tracking-[-0.01em] text-gray-950 lg:text-[1.15rem]">
        Today · who needs you first
      </p>
      <ul className="mt-3 divide-y" style={{ borderColor: DAY_WIRE }}>
        <li
          className="flex items-center gap-2.5 rounded-xl px-2 py-2.5 sm:gap-3 lg:gap-3.5 lg:py-3"
          style={{ backgroundColor: ANCHOR_ROW }}
        >
          <Row {...ROSA} anchor pill={<Pill tone={pill.tone}>{pill.label}</Pill>} />
        </li>
        {QUEUE.map((r, i) => (
          <li
            /* The tail of the day and the time column drop at 390: with both
               in, the names truncated to "Liam Br..." and the stacked frame ran
               past a screen. Part 10 — scale and stacking change down the
               widths, identity does not. */
            key={r.name}
            className={`items-center gap-2.5 px-2 py-2.5 sm:gap-3 lg:gap-3.5 lg:py-3 ${i < 3 ? 'flex' : 'hidden sm:flex'}`}
          >
            <Row {...r} pill={<Pill tone={r.tone}>{r.status}</Pill>} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Row({
  t,
  name,
  visit,
  initials,
  anchor,
  pill,
}: {
  t: string
  name: string
  visit: string
  initials: string
  anchor?: boolean
  pill: React.ReactNode
}) {
  return (
    <>
      <span className={`hidden w-12 shrink-0 text-gray-600 sm:max-lg:block xl:block ${MONO_LABEL}`}>{t}</span>
      <Avatar initials={initials} anchor={anchor} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem] font-semibold text-gray-950">{name}</span>
        <span className="block truncate text-[0.82rem] text-gray-600">{visit}</span>
      </span>
      {pill}
    </>
  )
}

function KpiStrip({ scene, className = '' }: { scene: number; className?: string }) {
  return (
    <div className={className}>
      {KPIS[scene].map((k) => (
        <div
          key={k.label}
          className={`${PANEL} p-4`}
          style={
            k.live
              ? /* The one tile the chapter just moved, lit rather than
                   outlined — Part 3's emission, at tile scale. */
                {
                  borderColor: STAGE_TONE.info.ink,
                  boxShadow: '0 0 34px -12px rgb(93 71 222 / 0.55), 0 14px 36px rgb(76 125 240 / 0.1)',
                }
              : { borderColor: DAY_WIRE }
          }
        >
          <p className={`leading-tight text-gray-600 ${MONO_LABEL}`}>{k.label}</p>
          <p
            className="mt-1.5 text-[1.35rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-gray-950 sm:max-lg:text-[1.7rem] xl:text-[1.7rem] 2xl:text-[1.9rem]"
            style={k.live ? { color: STAGE_TONE.info.ink } : undefined}
          >
            {k.value}
          </p>
          <p className="mt-1.5 text-[0.8rem] font-semibold" style={{ color: GOOD_INK }}>
            {k.delta}
          </p>
          {k.live ? (
            <p className="mt-2">
              <Pill tone="info">↑ live</Pill>
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/* ── Scene 01 · the recall queue that found her ──────────────────────────── */

const RECALL: ReadonlyArray<{ lead?: string; body: string; tone: StageTone }> = [
  {
    lead: 'Rosa Silva',
    body: '— last visit 14 months ago, no recall booked. Flagged at 6:02am, before anyone opened a laptop.',
    tone: 'warn',
  },
  { lead: 'Liam Brooks', body: '— in the chair at 9:30, still unconfirmed.', tone: 'warn' },
  { lead: 'Priya Raman', body: '— whitening at 13:15, still unconfirmed.', tone: 'warn' },
  { body: '3 of 6 already confirmed themselves overnight. Nobody was asked to check.', tone: 'ok' },
]

function RecallPanel() {
  return (
    <div className={`${PANEL} p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <p className={`text-gray-600 ${MONO_LABEL}`}>Recall queue · found overnight</p>
      <ul className="mt-3 grid gap-2">
        {RECALL.map((r) => (
          <li
            key={r.body}
            className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] leading-snug text-gray-950"
            style={{ backgroundColor: STAGE_CANVAS }}
          >
            <Dot tone={r.tone} />
            <span>
              {r.lead ? <span className="font-bold">{r.lead} </span> : null}
              {r.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Scene 02 · the text that books ──────────────────────────────────────── */

function ThreadPanel() {
  return (
    <div className={`${PANEL} p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar initials={ROSA.initials} anchor />
          <span className="truncate text-[0.95rem] font-bold text-gray-950">{ROSA.name}</span>
        </span>
        <span className={`shrink-0 text-gray-600 ${MONO_LABEL}`}>SMS · Today</span>
      </div>

      <div className="mt-4 grid gap-2.5">
        <Bubble at="Dream Dental · 4:09pm">
          Hi Rosa — it has been a while since your last clean. We have 10:45 on Thursday. Want it?
        </Bubble>
        {/* White on `violet-700` (#5D47DE) is 6.14 and axe measures it on every
            run, which a gradient fill would not be — see the file header. */}
        <div className="flex justify-end">
          <span className="max-w-[88%] rounded-2xl rounded-br-md bg-violet-700 px-3.5 py-2.5 text-white">
            {/* Plain `text-white`, not `text-white/95`. §2b: the app does not
                dim its own text, and the size and weight already carry the
                hierarchy — every fix in that batch was a deletion. */}
            <span className={`block text-white ${MONO_LABEL}`}>Rosa · 4:12pm</span>
            <span className="mt-1 block text-[0.95rem] font-semibold leading-snug">
              Yes please — Thursday 10:45 works.
            </span>
          </span>
        </div>
        <Bubble at="Dream Dental · 4:12pm">Booked. You will get a reminder the night before.</Bubble>
      </div>

      <p
        className="mt-3 flex items-start gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] leading-snug text-gray-950"
        style={{ backgroundColor: STAGE_CANVAS }}
      >
        <Dot tone="ok" />
        <span>
          Written to your PMS at 4:12pm under its own audit trail — appointment{' '}
          <span className="font-bold">#48213</span>
        </span>
      </p>
    </div>
  )
}

function Bubble({ at, children }: { at: string; children: React.ReactNode }) {
  return (
    <span className="block max-w-[88%] rounded-2xl rounded-bl-md px-3.5 py-2.5" style={{ backgroundColor: '#EDF2FC' }}>
      <span className={`block text-gray-600 ${MONO_LABEL}`}>{at}</span>
      <span className="mt-1 block text-[0.95rem] leading-snug text-gray-950">{children}</span>
    </span>
  )
}

/* ── Scene 03 · the balance that clears ──────────────────────────────────── */

const LEDGER: ReadonlyArray<{ t: string; name: string; amount: string; cleared?: boolean }> = [
  { t: '11:02', name: 'Mara Kline', amount: '$96.00' },
  { t: '11:38', name: 'Rosa Silva', amount: '$184.00', cleared: true },
  { t: '12:15', name: 'Tom Okafor', amount: '$42.50' },
  { t: '13:40', name: 'Ana Reyes', amount: '$120.00' },
]

function LedgerPanel() {
  return (
    <div className={`${PANEL} p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <p className={`text-gray-600 ${MONO_LABEL}`}>Payments · today</p>
      <ul className="mt-3 divide-y" style={{ borderColor: DAY_WIRE }}>
        {LEDGER.map((r) => (
          <li
            key={r.name}
            className="flex items-center gap-3 rounded-xl px-2 py-2.5"
            style={r.cleared ? { backgroundColor: '#EAF6F0' } : undefined}
          >
            <span className={`hidden w-12 shrink-0 text-gray-600 sm:max-lg:block xl:block ${MONO_LABEL}`}>{r.t}</span>
            <span className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold text-gray-950">{r.name}</span>
            {r.cleared ? <Pill tone="ok">Cleared</Pill> : null}
            <span
              className="shrink-0 text-[0.95rem] font-bold tabular-nums text-gray-950"
              style={r.cleared ? { color: GOOD_INK } : undefined}
            >
              {r.amount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Her phone. Illustration, not a control: the button is a `<span>`. */
function PhonePanel() {
  return (
    <div
      className={`${PANEL} mx-auto w-full max-w-[17rem] shrink-0 p-4 lg:hidden xl:block xl:w-[14rem] 2xl:w-[16rem]`}
      style={{ borderColor: DAY_WIRE }}
    >
      <span className="mx-auto mb-3 block h-1.5 w-12 rounded-full" style={{ backgroundColor: AVATAR_WELL }} />
      <p className="flex items-center gap-2 text-[0.95rem] font-bold text-gray-950">
        <span className="h-5 w-5 rounded-md" style={{ backgroundColor: AVATAR_INK }} />
        Dream Dental
      </p>
      <div className="mt-3 rounded-xl border p-3" style={{ borderColor: DAY_WIRE }}>
        <p className={`text-gray-600 ${MONO_LABEL}`}>Balance after insurance</p>
        <p className="mt-1 text-[1.6rem] font-extrabold leading-none tabular-nums text-gray-950">
          $184.00
        </p>
      </div>
      <p className="mt-2.5">
        <Pill tone="ok">Paid · 11:38am</Pill>
      </p>
      {/* White on `teal-700` (#2F52B3) is 7.05. A `<span>`, never a button —
          nothing inside the pinned region is focusable. */}
      <span className="mt-2.5 block rounded-xl bg-teal-700 px-3 py-2.5 text-center text-[0.9rem] font-bold text-white">
        Receipt emailed
      </span>
      <p className="mt-2.5 text-[0.82rem] leading-snug text-gray-600">
        Her branding, her phone, her card. No app, no account to create.
      </p>
    </div>
  )
}

/* ── Scene 04 · the review that arrives ──────────────────────────────────── */

const REVIEW =
  '“They texted me instead of leaving a voicemail I would never listen to. Booked it in about nine seconds, and I paid on my phone in the car park.”'

function ReviewPanel() {
  return (
    <div className={`${PANEL} p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <Stars />
      <p className="mt-3 text-[1.05rem] font-semibold leading-snug text-gray-950 lg:text-[1.15rem]">{REVIEW}</p>
      <p className="mt-3 flex items-center gap-2.5 text-[0.9rem] text-gray-600">
        <Avatar initials={ROSA.initials} anchor />
        <span className="min-w-0 truncate">
          <span className="font-semibold text-gray-950">{ROSA.name}</span> · two days after her visit · unprompted
        </span>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <span
          className="flex items-center gap-3 rounded-xl px-3 py-3"
          style={{ backgroundColor: STAGE_TONE.info.tint }}
        >
          {/* A switch drawn, not built — see the file header. */}
          <span className="flex h-6 w-11 shrink-0 items-center justify-end rounded-full px-1" style={{ backgroundColor: AVATAR_INK }}>
            <span className="h-4 w-4 rounded-full bg-white" />
          </span>
          <span className="text-[0.9rem] font-bold" style={{ color: STAGE_TONE.info.ink }}>
            Featured on your website
          </span>
        </span>

        <span className="block overflow-hidden rounded-xl border" style={{ borderColor: DAY_WIRE }}>
          <span className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ backgroundColor: STAGE_CANVAS }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AVATAR_WELL }} />
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AVATAR_WELL }} />
            <span className={`ml-1 truncate text-gray-600 ${MONO_LABEL}`}>dreamdental.com</span>
          </span>
          <span className="block px-2.5 py-2.5">
            <Stars small />
            <span className="mt-1 block text-[0.8rem] leading-snug text-gray-950">
              &ldquo;They texted me instead of leaving a voicemail…&rdquo;
            </span>
            <span className="mt-1 block text-[0.78rem] text-gray-600">Rosa S. · verified patient</span>
          </span>
        </span>
      </div>
    </div>
  )
}

/** Five stars. A CLOSED path — the check-mark veto rejects those at the door,
 *  and a star is not a tick anyway. `#B45309` on white is 5.02. */
function Stars({ small }: { small?: boolean }) {
  return (
    <span className={`flex gap-1 ${small ? 'gap-0.5' : ''}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={small ? 'h-2.5 w-2.5' : 'h-5 w-5'}
          fill="#B45309"
          aria-hidden="true"
        >
          <path d="M10 1.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L10 14.9l-5.25 2.75 1-5.85L1.5 7.65l5.9-.85z" />
        </svg>
      ))}
    </span>
  )
}

/* ── The stage ───────────────────────────────────────────────────────────── */

const MIDDLE = [RecallPanel, ThreadPanel, LedgerPanel, ReviewPanel]

/**
 * ONE SCENE OF THE STAGE. `scene` is 0-3 and comes from the SAME normalised
 * scroll position that drives every transform — see `sceneAt` in
 * `cinematic-spine.tsx`. No listener of its own, no timer, no CSS animation.
 *
 * THE RAIL'S LANE is the right-hand gutter, reserved under `.is-cinematic` in
 * `SPINE_CSS` (`.mkt-stage`, a `padding-right`). It used to be reserved from
 * the bar chart, which spanned the bottom of the frame — so at full bleed the
 * rail landed on top of the chart rather than beside the chapter card, and the
 * chart itself read as a separate strip below the app with its bars running
 * off the viewport. The chart is gone: it was the one panel here carrying no
 * part of Rosa's story, and a lane reserved from a horizontal element can only
 * ever be a lane at the bottom.
 */
export function CinemaStage({ scene }: { scene: number }) {
  const Middle = MIDDLE[scene] ?? MIDDLE[0]
  const phone = scene === 2
  return (
    <div
      className="mkt-stage flex h-full w-full flex-col gap-3 overflow-hidden p-5 text-left sm:gap-4 sm:p-7 lg:p-9"
      style={{ backgroundColor: STAGE_CANVAS, ...STAGE_BLOOM }}
    >
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className={`text-gray-600 ${MONO_LABEL}`}>DreamCRM · Today · Tuesday 15 September</p>
        <p className={`text-teal-700 ${MONO_LABEL}`}>Dream Dental · Premium</p>
      </div>

      <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-start lg:gap-4">
        <QueuePanel scene={scene} />
        {/* THE RIGHT REGION — the scene's own panel, and the three numbers
            UNDER IT rather than under the whole app. The chapter card lands
            bottom-LEFT, in the queue column's lane, so a number that sat under
            the queue panel would be the first thing it covered. Aligning them
            with the scene panel is also what the storyboard does. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
            <div className="min-w-0 flex-1">
              <Middle />
            </div>
            {phone ? (
              <PhonePanel />
            ) : (
              <KpiStrip
                scene={scene}
                className="hidden 2xl:flex 2xl:w-[15rem] 2xl:shrink-0 2xl:flex-col 2xl:gap-4"
              />
            )}
          </div>
          {/* Below `xl` the numbers ride under the scene rather than beside it,
              and scene 03 always does — its right-hand column is her phone.
              Below `sm` they are out entirely: three tiles across a 390 frame
              cannot hold a `$9,664` and a `+11 pts this month` without pushing
              the frame past the screen, and Part 10's rule is that what
              changes down the widths is scale and stacking. */}
          <KpiStrip
            scene={scene}
            className={`hidden gap-3 sm:grid sm:grid-cols-3 ${phone ? '' : '2xl:hidden'}`}
          />
        </div>
      </div>
    </div>
  )
}
