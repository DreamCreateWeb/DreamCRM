'use client'

import { MONO_LABEL, DAY_WIRE } from '@/components/marketing/ui'
import type { CursorStop } from '@/components/marketing/cinema-fx'

/**
 * THE CINEMA STAGE — the picture the chapter cards scroll over. Since
 * DREAMCRM-82 a multi-state one (one patient, Rosa Silva, her queue row the
 * anchor), and since the owner's 2026-09-22 directive a LIVING one:
 *
 *   "it needs polished fx like genuine particle effects, and visual
 *    interactions, like it needs to showcase the app and right now it exists
 *    but its bland and annoying"
 *
 * ── HOW THE PICTURE MOVES WITHOUT A SINGLE TIMER ────────────────────────
 *
 * Every scene layer receives ONE custom property per frame from the spine,
 * `--mkt-t`: the chapter's local scroll progress (0 as the chapter arrives,
 * 1 as it leaves). Elements that should happen in sequence carry `mkt-k` plus
 * a start `--mkt-b` and a duration `--mkt-d`, and the stylesheet computes
 * their own eased progress `--mkt-k` from `--mkt-t` with `clamp()` and
 * `calc()` — no JavaScript per element, no CSS transition, no animation. So
 * a beat is scrubbed by the reader's own hand: scroll slowly and the reply
 * bubble rises slowly; scroll back and it sinks along the same curve. This
 * is Part 6's "one scroll position drives everything" kept exactly, at the
 * level of every bubble, star and bar on the stage.
 *
 * Outside the pinned sequence `--mkt-t` is never written, every `--mkt-k`
 * resolves to its default of 1, and each scene renders its FINISHED state —
 * so the stacked layout (reduced motion, touch, narrow, no JS, print) shows
 * six complete pictures in reading order, with the counters at their final
 * values in the server HTML.
 *
 * Three things do need JavaScript, and they are the spine's job, not this
 * file's: the COUNTERS (a number's text content changes — `data-count-*`),
 * the CURSOR GHOST (`CURSOR_STOPS`, drawn once per scene and positioned from
 * the same `t`), and the PARTICLE canvas (`cinema-fx.ts`).
 *
 * ── THE STORY, IN SIX BEATS ──────────────────────────────────────────────
 *
 *   01 the queue     `6 mo overdue`     · the recall panel naming why
 *   02 the text      `Confirmed · Thu`  · the SMS thread and the PMS write
 *   03 the chair     `Confirmed · Thu`  · the Dream Team's card, one tap
 *   04 the balance   `Balance cleared`  · her portal and the ledger
 *   05 the review    `Review received`  · her words, live on the site
 *   06 the week      `Review received`  · the scoreboard, and Monday's note
 *
 * Two scenes are new (03 and 06). The product's whole doctrine is "the
 * employee, not the tool", and a showcase that never showed the AI staff
 * doing a job was showing the tool.
 *
 * ── WHY EVERY COLOUR HERE IS SPELLED OUT AND HAND-GRADED ────────────────
 *
 * The stage is deliberately NOT in `DECORATIVE_MOCKS` (`e2e/axe.ts`) and must
 * stay out. Type here is real reading size, so `marketing: home` keeps its
 * ceiling of ZERO with every pair graded on its own ground (`BRAND.md` Part
 * 7):
 *
 *   `#7C4A05` on `#FDF0D8`  6.56   amber pill  (needs a text / overdue)
 *   `#04543C` on `#D7F0E3`  7.47   green pill  (confirmed / paid / handled)
 *   `#4C2CB0` on `#EDE6FE`  7.56   violet pill (balance cleared / live)
 *   `#86206F` on `#FBE3F8`  7.12   pink pill   (review received)
 *   `#1F3D8F` on `#DCE7FD`  7.96   avatar well
 *   `#FFFFFF` on `#1F3D8F`  9.89   Rosa's avatar — the SAME pair inverted
 *   `#04543C` on `#FFFFFF`  8.98   the green delta ink
 *   `#04543C` on `#EAF6F0`  8.10   her cleared line in the ledger
 *   `#10182e` on `#EEF2FE` 15.74, `#4c5a78` 6.17 — her highlighted row
 *   `#B45309` on `#FFFFFF`  5.02   the review stars (a graphic, 1.4.11's 3:1)
 *   `#FFFFFF` on `#5D47DE`  6.14   her reply bubble, the Approve fill
 *   `#FFFFFF` on `#2F52B3`  7.05   the portal's Pay / Receipt fill
 *
 * Nothing in here is focusable. Every button, switch and checkbox is DRAWN
 * — a `<span>` — because a chapter layer spends most of the scroll at
 * opacity 0 and a focus stop inside it is invisible
 * (`tests/marketing/cinematic-spine.test.tsx` holds that at zero).
 */

const STAGE_CANVAS = '#F3F7FE'

/** Coloured light, centred outside the frame — `BRAND.md` Part 3, "depth is
 *  emission, not stacking". No `backgroundSize`: one wash, no pitch (the
 *  drawn-grid veto, `tests/marketing/no-drawn-grid.test.ts`). */
const STAGE_BLOOM = {
  backgroundImage: [
    'radial-gradient(44rem 26rem at 16% 122%, rgb(117 95 248 / 0.30), transparent 68%)',
    'radial-gradient(38rem 24rem at 118% 70%, rgb(76 125 240 / 0.24), transparent 66%)',
    'radial-gradient(34rem 20rem at 86% 128%, rgb(200 0 222 / 0.16), transparent 70%)',
  ].join(','),
} as const

const STAGE_TONE = {
  warn: { ink: '#7C4A05', tint: '#FDF0D8' },
  ok: { ink: '#04543C', tint: '#D7F0E3' },
  info: { ink: '#4C2CB0', tint: '#EDE6FE' },
  praise: { ink: '#86206F', tint: '#FBE3F8' },
} as const

type StageTone = keyof typeof STAGE_TONE

const AVATAR_INK = '#1F3D8F'
const AVATAR_WELL = '#DCE7FD'
const ANCHOR_ROW = '#EEF2FE'
const GOOD_INK = '#04543C'

export const SCENE_COUNT = 6

/* ── Beats ──────────────────────────────────────────────────────────────── */

/**
 * A thing that happens at `b` and takes `d` of the chapter to finish. The
 * stylesheet (`SPINE_CSS`) computes `--mkt-k` from these; `kind` picks how
 * it arrives. `still` computes the progress and applies nothing itself, for
 * children that draw with it (a line, a bar).
 */
function Beat({
  b,
  d = 0.1,
  kind = 'rise',
  className = '',
  style,
  children,
  as: Tag = 'div',
}: {
  b: number
  d?: number
  kind?: 'rise' | 'pop' | 'slide' | 'still' | 'out'
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
  as?: 'div' | 'span' | 'li' | 'p'
}) {
  return (
    <Tag
      className={`mkt-k mkt-${kind} ${className}`}
      style={{ ['--mkt-b' as string]: b, ['--mkt-d' as string]: d, ...style }}
    >
      {children}
    </Tag>
  )
}

/** A number that counts. The server renders the FINAL value; the spine
 *  writes intermediate ones only while the pin is live. */
function Count({
  from,
  to,
  b,
  d = 0.2,
  format = 'int',
  className = '',
}: {
  from: number
  to: number
  b: number
  d?: number
  format?: 'int' | 'usd' | 'pct'
  className?: string
}) {
  return (
    <span
      className={className}
      data-count-from={from}
      data-count-to={to}
      data-count-b={b}
      data-count-d={d}
      data-count-format={format}
    >
      {formatCount(to, format)}
    </span>
  )
}

export function formatCount(n: number, format: 'int' | 'usd' | 'pct'): string {
  if (format === 'usd') return `$${n.toLocaleString('en-US')}`
  if (format === 'pct') return `${n}%`
  return n.toLocaleString('en-US')
}

/* ── The pieces ─────────────────────────────────────────────────────────── */

/** A panel. One radius, one hairline, one emission — spelled once. `depth`
 *  is the pointer-parallax layer (1 nearest the ground, 3 nearest the eye). */
const PANEL =
  'rounded-2xl border bg-white shadow-[0_0_54px_-30px_rgb(93_71_222/0.55),0_2px_6px_rgb(76_125_240/0.06),0_14px_36px_rgb(76_125_240/0.1)]'

function Pill({ tone, children, className = '' }: { tone: StageTone; children: React.ReactNode; className?: string }) {
  const { ink, tint } = STAGE_TONE[tone]
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 text-[0.75rem] font-bold sm:px-2.5 ${className}`}
      style={{ backgroundColor: tint, color: ink }}
    >
      {children}
    </span>
  )
}

function Dot({ tone }: { tone: StageTone }) {
  return (
    <span className="mt-[0.45rem] h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STAGE_TONE[tone].ink }} />
  )
}

function Avatar({ initials, anchor }: { initials: string; anchor?: boolean }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold lg:h-9 lg:w-9"
      style={anchor ? { backgroundColor: AVATAR_INK, color: '#FFFFFF' } : { backgroundColor: AVATAR_WELL, color: AVATAR_INK }}
    >
      {initials}
    </span>
  )
}

/* ── The queue (every scene) ────────────────────────────────────────────── */

const QUEUE: ReadonlyArray<{ t: string; name: string; visit: string; status: string; tone: StageTone; initials: string }> = [
  { t: '09:30', name: 'Liam Brooks', visit: 'Checkup · 30 min', status: 'Needs a text', tone: 'warn', initials: 'LB' },
  { t: '13:15', name: 'Priya Raman', visit: 'Whitening · 30 min', status: 'Needs a text', tone: 'warn', initials: 'PR' },
  { t: '10:00', name: 'Ana Reyes', visit: 'Hygiene · 45 min', status: 'Confirmed', tone: 'ok', initials: 'AR' },
  { t: '11:30', name: 'Mara Kline', visit: 'Crown seat · 60 min', status: 'Confirmed', tone: 'ok', initials: 'MK' },
  { t: '14:15', name: 'Tom Okafor', visit: 'Filling · 45 min', status: 'Confirmed', tone: 'ok', initials: 'TO' },
]

const ROSA = { t: '10:45', name: 'Rosa Silva', visit: 'Recall · hygiene', initials: 'RS' }

/** Her pill per scene, and the beat at which it CHANGES within that scene
 *  (null = it was already this when the chapter arrived). */
const ROSA_PILL: ReadonlyArray<{ label: string; tone: StageTone; from?: { label: string; tone: StageTone }; at?: number }> = [
  { label: '6 mo overdue', tone: 'warn' },
  { label: 'Confirmed · Thu', tone: 'ok', from: { label: '6 mo overdue', tone: 'warn' }, at: 0.5 },
  { label: 'Confirmed · Thu', tone: 'ok' },
  { label: 'Balance cleared', tone: 'info', from: { label: 'Confirmed · Thu', tone: 'ok' }, at: 0.52 },
  { label: 'Review received', tone: 'praise', from: { label: 'Balance cleared', tone: 'info' }, at: 0.46 },
  { label: 'Review received', tone: 'praise' },
]

function QueuePanel({ scene }: { scene: number }) {
  const pill = ROSA_PILL[scene]
  return (
    <div className={`${PANEL} mkt-depth-1 shrink-0 p-4 lg:w-[22rem] lg:p-5 xl:w-[25rem]`} style={{ borderColor: DAY_WIRE }}>
      <p className="flex items-center justify-between gap-3 text-[1.05rem] font-bold tracking-[-0.01em] text-gray-950 lg:text-[1.15rem]">
        Today · who needs you first
        <span className="flex items-center gap-1.5">
          <span className="mkt-live h-2 w-2 rounded-full" style={{ backgroundColor: GOOD_INK }} />
          <span className={`text-gray-600 ${MONO_LABEL}`}>live</span>
        </span>
      </p>
      <ul className="mt-3 divide-y" style={{ borderColor: DAY_WIRE }}>
        <li className="mkt-anchor-row flex items-center gap-2.5 rounded-xl px-2 py-2.5 sm:gap-3 lg:gap-3.5 lg:py-3" style={{ backgroundColor: ANCHOR_ROW }}>
          <Row
            {...ROSA}
            anchor
            pill={
              pill.from && pill.at != null ? (
                <span className="relative inline-flex shrink-0">
                  <Beat as="span" b={pill.at} d={0.08} kind="out" className="absolute inset-0 flex">
                    <Pill tone={pill.from.tone}>{pill.from.label}</Pill>
                  </Beat>
                  <Beat as="span" b={pill.at} d={0.08} kind="pop" className="flex">
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  </Beat>
                </span>
              ) : (
                <Pill tone={pill.tone}>{pill.label}</Pill>
              )
            }
          />
        </li>
        {QUEUE.map((r, i) => (
          <Beat
            as="li"
            key={r.name}
            b={0.02 + i * 0.03}
            d={0.08}
            className={`items-center gap-2.5 px-2 py-2.5 sm:gap-3 lg:gap-3.5 lg:py-3 ${i < 3 ? 'flex' : 'hidden sm:flex'}`}
          >
            <Row {...r} pill={<Pill tone={r.tone}>{r.status}</Pill>} />
          </Beat>
        ))}
      </ul>
    </div>
  )
}

function Row({ t, name, visit, initials, anchor, pill }: { t: string; name: string; visit: string; initials: string; anchor?: boolean; pill: React.ReactNode }) {
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

/* ── The three numbers ──────────────────────────────────────────────────── */

type Kpi = { label: string; value: React.ReactNode; delta: string; live?: boolean }

const CHAIRS = (from: number, to: number, b: number) => <Count from={from} to={to} b={b} format="pct" />
const RECALLS = (from: number, to: number, b: number) => <Count from={from} to={to} b={b} />
const MONEY = (from: number, to: number, b: number) => <Count from={from} to={to} b={b} format="usd" />

/** Per scene. A number moves where the story earns it and sits still where
 *  it does not; exactly one tile is LIVE per scene. */
const KPIS: ReadonlyArray<ReadonlyArray<Kpi>> = [
  [
    { label: 'Chairs filled', value: '83%', delta: '+4 pts this month', live: true },
    { label: 'Recalls recovered', value: '31', delta: 'queue building' },
    { label: 'Collected this week', value: '$9,480', delta: 'Mon–Wed' },
  ],
  [
    { label: 'Chairs filled', value: '83%', delta: '+4 pts this month' },
    { label: 'Recalls recovered', value: RECALLS(31, 38, 0.56), delta: '+7 in the last hour', live: true },
    { label: 'Collected this week', value: '$9,480', delta: 'Mon–Wed' },
  ],
  [
    { label: 'Chairs filled', value: CHAIRS(83, 94, 0.66), delta: '+11 pts this month', live: true },
    { label: 'Recalls recovered', value: '38', delta: '+7 today' },
    { label: 'Collected this week', value: '$9,480', delta: 'Mon–Wed' },
  ],
  [
    { label: 'Chairs filled', value: '94%', delta: '+11 pts this month' },
    { label: 'Recalls recovered', value: '38', delta: '+7 today' },
    { label: 'Collected this week', value: MONEY(9480, 9664, 0.58), delta: '+$184 just now', live: true },
  ],
  [
    { label: 'Chairs filled', value: '94%', delta: '+11 pts this month' },
    { label: 'Recalls recovered', value: '38', delta: '+7 today' },
    { label: 'Collected this week', value: '$9,664', delta: 'Mon–Thu', live: true },
  ],
  [
    { label: 'Chairs filled', value: '94%', delta: '+11 pts this month', live: true },
    { label: 'Recalls recovered', value: '38', delta: '+7 this week' },
    { label: 'Collected this week', value: '$11,210', delta: 'Mon–Fri' },
  ],
]

function KpiStrip({ scene, className = '' }: { scene: number; className?: string }) {
  return (
    <div className={`mkt-depth-3 ${className}`}>
      {KPIS[scene].map((k, i) => (
        <Beat
          key={k.label}
          b={0.06 + i * 0.05}
          d={0.1}
          className={`${PANEL} p-4 ${k.live ? 'mkt-live-tile' : ''}`}
          style={
            k.live
              ? { borderColor: STAGE_TONE.info.ink, boxShadow: '0 0 34px -12px rgb(93 71 222 / 0.55), 0 14px 36px rgb(76 125 240 / 0.1)' }
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
        </Beat>
      ))}
    </div>
  )
}

/* ── Scene 01 · the recall queue that found her ──────────────────────────── */

const RECALL: ReadonlyArray<{ lead?: string; body: string; tone: StageTone }> = [
  { lead: 'Rosa Silva', body: '— last visit 14 months ago, no recall booked. Flagged at 6:02am, before anyone opened a laptop.', tone: 'warn' },
  { lead: 'Liam Brooks', body: '— in the chair at 9:30, still unconfirmed.', tone: 'warn' },
  { lead: 'Priya Raman', body: '— whitening at 13:15, still unconfirmed.', tone: 'warn' },
  { body: '3 of 6 already confirmed themselves overnight. Nobody was asked to check.', tone: 'ok' },
]

function RecallPanel() {
  return (
    <div className={`${PANEL} mkt-depth-2 p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <p className={`flex items-center justify-between text-gray-600 ${MONO_LABEL}`}>
        Recall queue · found overnight
        <Beat as="span" b={0.62} d={0.08} kind="pop">
          <Pill tone="ok">4 texts queued</Pill>
        </Beat>
      </p>
      <ul className="mt-3 grid gap-2">
        {RECALL.map((r, i) => (
          <Beat
            as="li"
            key={r.body}
            b={0.12 + i * 0.11}
            d={0.1}
            kind="slide"
            className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] leading-snug text-gray-950"
            style={{ backgroundColor: STAGE_CANVAS }}
          >
            <Dot tone={r.tone} />
            <span>
              {r.lead ? <span className="font-bold">{r.lead} </span> : null}
              {r.body}
            </span>
          </Beat>
        ))}
      </ul>
    </div>
  )
}

/* ── Scene 02 · the text that books ──────────────────────────────────────── */

function ThreadPanel() {
  return (
    <div className={`${PANEL} mkt-depth-2 p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar initials={ROSA.initials} anchor />
          <span className="truncate text-[0.95rem] font-bold text-gray-950">{ROSA.name}</span>
        </span>
        <span className={`shrink-0 text-gray-600 ${MONO_LABEL}`}>SMS · Today</span>
      </div>

      <div className="mt-4 grid gap-2.5">
        <Beat b={0.08} d={0.1} kind="slide">
          <Bubble at="Dream Dental · 4:09pm">
            Hi Rosa — it has been a while since your last clean. We have 10:45 on Thursday. Want it?
          </Bubble>
        </Beat>
        <Beat b={0.26} d={0.05} kind="rise" className="flex justify-end px-2">
          <Beat as="span" b={0.38} d={0.04} kind="out" className="flex gap-1">
            <span className="mkt-typing h-2 w-2 rounded-full" style={{ backgroundColor: AVATAR_INK }} />
            <span className="mkt-typing h-2 w-2 rounded-full" style={{ backgroundColor: AVATAR_INK }} />
            <span className="mkt-typing h-2 w-2 rounded-full" style={{ backgroundColor: AVATAR_INK }} />
          </Beat>
        </Beat>
        <Beat b={0.4} d={0.08} kind="pop" className="flex justify-end">
          {/* White on `violet-700` (#5D47DE) is 6.14 — axe measures it on every run. */}
          <span className="max-w-[88%] rounded-2xl rounded-br-md bg-violet-700 px-3.5 py-2.5 text-white">
            <span className={`block text-white ${MONO_LABEL}`}>Rosa · 4:12pm</span>
            <span className="mt-1 block text-[0.95rem] font-semibold leading-snug">Yes please — Thursday 10:45 works.</span>
          </span>
        </Beat>
        <Beat b={0.56} d={0.08} kind="slide">
          <Bubble at="Dream Dental · 4:12pm">Booked. You will get a reminder the night before.</Bubble>
        </Beat>
      </div>

      <Beat
        as="p"
        b={0.7}
        d={0.1}
        className="mt-3 flex items-start gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] leading-snug text-gray-950"
        style={{ backgroundColor: STAGE_CANVAS }}
      >
        <Dot tone="ok" />
        <span>
          Written to your PMS at 4:12pm under its own audit trail — appointment <span className="font-bold">#48213</span>
        </span>
      </Beat>
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

/* ── Scene 03 · the chair that fills itself (the Dream Team) ─────────────── */

const ROSTER: ReadonlyArray<{ name: string; did: string }> = [
  { name: 'Recall', did: '38 invited' },
  { name: 'Reviews', did: '6 replies' },
  { name: 'Social', did: '3 posts' },
  { name: 'Website', did: '1 fix' },
  { name: 'Guardian', did: 'all clear' },
]

/** The sign-here card. The Approve button and the "always" box are DRAWN —
 *  `<span>`s — and the cursor ghost does the tapping. */
function SignHerePanel() {
  return (
    <div className={`${PANEL} mkt-depth-2 p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-gray-600 ${MONO_LABEL}`}>Dream Team · sign here · 1 of 3 waiting</p>
        <Beat as="span" b={0.7} d={0.08} kind="pop">
          <Pill tone="ok">Handled · sent to 38</Pill>
        </Beat>
      </div>

      <Beat b={0.08} d={0.1} className="mt-3 rounded-xl border p-3" style={{ borderColor: DAY_WIRE, backgroundColor: STAGE_CANVAS }}>
        <p className={`text-violet-700 ${MONO_LABEL}`}>Recall · drafted Monday 6:14am</p>
        <p className="mt-1 text-[1rem] font-bold leading-snug text-gray-950">Thursday has two open chairs. I wrote the invitation.</p>
        <p className="mt-2 text-[0.88rem] leading-snug text-gray-600">
          To the <span className="font-bold text-gray-950">38 patients</span> who are due — in your voice, with a Book-a-time button that shows real openings.
        </p>
        <Beat b={0.24} d={0.1} kind="slide" className="mt-3 rounded-lg border bg-white p-3 text-[0.85rem] leading-snug text-gray-950" style={{ borderColor: DAY_WIRE }}>
          <span className={`block text-gray-600 ${MONO_LABEL}`}>Subject · A Thursday slot with your name on it</span>
          <span className="mt-1 block">Hi Rosa — it has been a while. We kept Thursday 10:45 for a hygiene visit; tap below if that works and it is yours.</span>
          <span className="mt-2 inline-block rounded-lg bg-teal-700 px-3 py-1.5 text-[0.82rem] font-bold text-white">Book a time</span>
        </Beat>
      </Beat>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Beat as="span" b={0.36} d={0.08} kind="pop" className="relative">
          {/* Not a button. White on violet-700 is 6.14. The pressed look is
              the cursor's click beat, drawn by the spine. */}
          <span className="mkt-approve inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-[0.9rem] font-bold text-white">
            Approve and send
          </span>
        </Beat>
        <Beat as="span" b={0.4} d={0.08} className="flex items-center gap-2 text-[0.85rem] text-gray-600">
          <span className="h-4 w-4 rounded-[5px] border-2" style={{ borderColor: AVATAR_INK }} />
          Always do this for me
        </Beat>
        <Beat as="span" b={0.4} d={0.08} className={`ml-auto text-gray-600 ${MONO_LABEL}`}>
          Edit · Skip · Not now
        </Beat>
      </div>

      <Beat b={0.78} d={0.1} className="mt-4">
        <p className={`text-gray-600 ${MONO_LABEL}`}>Your roster · last week</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {ROSTER.map((r, i) => (
            <Beat as="li" key={r.name} b={0.8 + i * 0.03} d={0.06} kind="pop" className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.8rem]" style={{ borderColor: DAY_WIRE }}>
              <span className="font-bold text-gray-950">{r.name}</span>
              <span className="text-gray-600">{r.did}</span>
            </Beat>
          ))}
        </ul>
      </Beat>
    </div>
  )
}

/* ── Scene 04 · the balance that clears ──────────────────────────────────── */

const LEDGER: ReadonlyArray<{ t: string; name: string; amount: string; cleared?: boolean }> = [
  { t: '11:02', name: 'Mara Kline', amount: '$96.00' },
  { t: '11:38', name: 'Rosa Silva', amount: '$184.00', cleared: true },
  { t: '12:15', name: 'Tom Okafor', amount: '$42.50' },
  { t: '13:40', name: 'Ana Reyes', amount: '$120.00' },
]

function LedgerPanel() {
  return (
    <div className={`${PANEL} mkt-depth-2 p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <p className={`flex items-center justify-between text-gray-600 ${MONO_LABEL}`}>
        Payments · today
        <Beat as="span" b={0.66} d={0.08} kind="pop">
          <Pill tone="ok">Deposited Friday</Pill>
        </Beat>
      </p>
      <ul className="mt-3 divide-y" style={{ borderColor: DAY_WIRE }}>
        {LEDGER.map((r, i) => (
          <Beat
            as="li"
            key={r.name}
            b={0.06 + i * 0.05}
            d={0.08}
            kind="slide"
            className="relative flex items-center gap-3 rounded-xl px-2 py-2.5"
          >
            {r.cleared ? (
              <Beat as="span" b={0.54} d={0.08} kind="still" className="mkt-wash absolute inset-0 rounded-xl" style={{ backgroundColor: '#EAF6F0' }}>
                {''}
              </Beat>
            ) : null}
            <span className={`relative hidden w-12 shrink-0 text-gray-600 sm:max-lg:block xl:block ${MONO_LABEL}`}>{r.t}</span>
            <span className="relative min-w-0 flex-1 truncate text-[0.95rem] font-semibold text-gray-950">{r.name}</span>
            {r.cleared ? (
              <Beat as="span" b={0.56} d={0.08} kind="pop" className="relative">
                <Pill tone="ok">Cleared</Pill>
              </Beat>
            ) : null}
            <span className="relative shrink-0 text-[0.95rem] font-bold tabular-nums text-gray-950" style={r.cleared ? { color: GOOD_INK } : undefined}>
              {r.amount}
            </span>
          </Beat>
        ))}
      </ul>
    </div>
  )
}

/** Her phone. Illustration, not a control: the button is a `<span>` and the
 *  cursor ghost taps it. */
function PhonePanel() {
  return (
    <div
      className={`${PANEL} mkt-depth-3 mx-auto w-full max-w-[17rem] shrink-0 p-4 lg:hidden xl:block xl:w-[14rem] 2xl:w-[16rem]`}
      style={{ borderColor: DAY_WIRE }}
    >
      <span className="mx-auto mb-3 block h-1.5 w-12 rounded-full" style={{ backgroundColor: AVATAR_WELL }} />
      <p className="flex items-center gap-2 text-[0.95rem] font-bold text-gray-950">
        <span className="h-5 w-5 rounded-md" style={{ backgroundColor: AVATAR_INK }} />
        Dream Dental
      </p>
      <Beat b={0.06} d={0.1} className="mt-3 rounded-xl border p-3" style={{ borderColor: DAY_WIRE }}>
        <p className={`text-gray-600 ${MONO_LABEL}`}>Balance after insurance</p>
        <p className="mt-1 text-[1.6rem] font-extrabold leading-none tabular-nums text-gray-950">$184.00</p>
      </Beat>
      {/* White on `teal-700` (#2F52B3) is 7.05. A `<span>`, never a button. */}
      <Beat b={0.16} d={0.08} kind="pop" className="relative mt-2.5">
        <Beat as="span" b={0.5} d={0.06} kind="out" className="mkt-pay block rounded-xl bg-teal-700 px-3 py-2.5 text-center text-[0.9rem] font-bold text-white">
          Pay $184.00
        </Beat>
        <Beat as="span" b={0.5} d={0.08} kind="pop" className="absolute inset-0 flex items-center justify-center">
          <Pill tone="ok" className="text-[0.85rem]">Paid · 11:38am</Pill>
        </Beat>
      </Beat>
      <Beat b={0.62} d={0.08} className="mt-2.5 block rounded-xl border px-3 py-2 text-center text-[0.85rem] font-semibold text-gray-950" style={{ borderColor: DAY_WIRE }}>
        Receipt emailed
      </Beat>
      <Beat as="p" b={0.72} d={0.1} className="mt-2.5 text-[0.82rem] leading-snug text-gray-600">
        Her branding, her phone, her card. No app, no account to create.
      </Beat>
    </div>
  )
}

/* ── Scene 05 · the review that arrives ──────────────────────────────────── */

const REVIEW =
  '“They texted me instead of leaving a voicemail I would never listen to. Booked it in about nine seconds, and I paid on my phone in the car park.”'

function ReviewPanel() {
  return (
    <div className={`${PANEL} mkt-depth-2 p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <Stars b={0.16} />
      <Beat as="p" b={0.44} d={0.1} className="mt-3 text-[1.05rem] font-semibold leading-snug text-gray-950 lg:text-[1.15rem]">
        {REVIEW}
      </Beat>
      <Beat as="p" b={0.5} d={0.08} className="mt-3 flex items-center gap-2.5 text-[0.9rem] text-gray-600">
        <Avatar initials={ROSA.initials} anchor />
        <span className="min-w-0 truncate">
          <span className="font-semibold text-gray-950">{ROSA.name}</span> · two days after her visit · unprompted
        </span>
      </Beat>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Beat b={0.56} d={0.08} className="flex items-center gap-3 rounded-xl px-3 py-3" style={{ backgroundColor: STAGE_TONE.info.tint }}>
          {/* A switch drawn, not built. The knob slides on its own beat. */}
          <span className="mkt-switch flex h-6 w-11 shrink-0 items-center rounded-full px-1" style={{ backgroundColor: AVATAR_INK }}>
            <Beat as="span" b={0.66} d={0.06} kind="still" className="mkt-knob block h-4 w-4 rounded-full bg-white">
              {''}
            </Beat>
          </span>
          <span className="text-[0.9rem] font-bold" style={{ color: STAGE_TONE.info.ink }}>
            Featured on your website
          </span>
        </Beat>

        <Beat as="span" b={0.74} d={0.1} kind="slide" className="block overflow-hidden rounded-xl border" style={{ borderColor: DAY_WIRE }}>
          <span className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ backgroundColor: STAGE_CANVAS }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AVATAR_WELL }} />
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AVATAR_WELL }} />
            <span className={`ml-1 truncate text-gray-600 ${MONO_LABEL}`}>dreamdental.com</span>
          </span>
          <span className="block px-2.5 py-2.5">
            <Stars small />
            <span className="mt-1 block text-[0.8rem] leading-snug text-gray-950">&ldquo;They texted me instead of leaving a voicemail…&rdquo;</span>
            <span className="mt-1 block text-[0.78rem] text-gray-600">Rosa S. · verified patient</span>
          </span>
        </Beat>
      </div>
    </div>
  )
}

/** Five stars, each one its own beat. A CLOSED path — not a tick.
 *  `#B45309` on white is 5.02. */
function Stars({ small, b }: { small?: boolean; b?: number }) {
  return (
    <span className={`flex ${small ? 'gap-0.5' : 'gap-1'}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const svg = (
          <svg viewBox="0 0 20 20" className={small ? 'h-2.5 w-2.5' : 'h-5 w-5'} fill="#B45309" aria-hidden="true">
            <path d="M10 1.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L10 14.9l-5.25 2.75 1-5.85L1.5 7.65l5.9-.85z" />
          </svg>
        )
        return b == null ? (
          <span key={i}>{svg}</span>
        ) : (
          <Beat as="span" key={i} b={b + i * 0.05} d={0.05} kind="pop">
            {svg}
          </Beat>
        )
      })}
    </span>
  )
}

/* ── Scene 06 · the week, seen ───────────────────────────────────────────── */

/** Twelve weeks of new patients seated — the Growth hub's heartbeat, as a
 *  line that DRAWS ITSELF as the chapter scrubs (`pathLength` 1, dash offset
 *  from `--mkt-k`). Values are the mock's own, not a claim. */
const WEEKS = [3, 4, 4, 5, 3, 6, 5, 7, 6, 8, 7, 9]

function sparkPath(values: readonly number[], w: number, h: number): string {
  const max = Math.max(...values)
  const step = w / (values.length - 1)
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(h - (v / max) * (h - 6) - 3).toFixed(1)}`).join(' ')
}

const FUNNEL: ReadonlyArray<{ label: string; n: number; w: number }> = [
  { label: 'Due & reachable', n: 142, w: 1 },
  { label: 'Invited', n: 96, w: 0.72 },
  { label: 'Opened', n: 61, w: 0.46 },
  { label: 'Booked back', n: 18, w: 0.26 },
]

function WeekPanel() {
  const W = 320
  const H = 72
  return (
    <div className={`${PANEL} mkt-depth-2 p-4 lg:p-5`} style={{ borderColor: DAY_WIRE }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={`text-gray-600 ${MONO_LABEL}`}>New patients · seated this week</p>
          <p className="mt-1 text-[2rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-gray-950">
            <Count from={0} to={9} b={0.1} d={0.3} />
          </p>
        </div>
        <Beat as="span" b={0.4} d={0.08} kind="pop">
          <Pill tone="ok">best week this year</Pill>
        </Beat>
      </div>

      <Beat b={0.12} d={0.42} kind="still" className="mt-3">
        <div className="mkt-draw-clip">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-[4.5rem] w-full" aria-hidden="true" preserveAspectRatio="none">
            <path d={sparkPath(WEEKS, W, H)} fill="none" stroke="#2F52B3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className={`mt-1 flex justify-between text-gray-600 ${MONO_LABEL}`}>
          <span>12 weeks ago</span>
          <span>this week</span>
        </p>
      </Beat>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className={`text-gray-600 ${MONO_LABEL}`}>Where they came from</p>
          <ul className="mt-2 grid gap-1.5 text-[0.85rem]">
            {[
              ['Google profile', 4],
              ['Your website', 3],
              ['Recall texts', 2],
            ].map(([k, n], i) => (
              <Beat as="li" key={String(k)} b={0.46 + i * 0.05} d={0.08} kind="slide" className="flex items-center justify-between rounded-lg px-2.5 py-1.5" style={{ backgroundColor: STAGE_CANVAS }}>
                <span className="text-gray-950">{k}</span>
                <span className="font-bold tabular-nums text-gray-950">{n}</span>
              </Beat>
            ))}
          </ul>
        </div>
        <div>
          <p className={`text-gray-600 ${MONO_LABEL}`}>Reactivation · this month</p>
          <ul className="mt-2 grid gap-1.5">
            {FUNNEL.map((f, i) => (
              <li key={f.label} className="relative overflow-hidden rounded-full" style={{ backgroundColor: STAGE_CANVAS }}>
                {/* The booked-back bar is the green tint (gray-950 on #D7F0E3 is
                    14.1); the rest ride the avatar well. Every label is dark
                    ink, so a row is legible before its bar has grown in. */}
                <Beat b={0.5 + i * 0.06} d={0.14} kind="still" className="mkt-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${f.w * 100}%`, backgroundColor: i === FUNNEL.length - 1 ? STAGE_TONE.ok.tint : AVATAR_WELL }}>
                  {''}
                </Beat>
                <span className="relative flex items-center justify-between px-3 py-1 text-[0.8rem]">
                  <span className="font-bold text-gray-950">{f.label}</span>
                  <span className="font-extrabold tabular-nums text-gray-950">{f.n}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Beat as="p" b={0.8} d={0.1} className="mt-4 flex items-start gap-3 rounded-xl px-3 py-2.5 text-[0.88rem] leading-snug text-gray-950" style={{ backgroundColor: STAGE_CANVAS }}>
        <Dot tone="ok" />
        <span>
          <span className="font-bold">Monday&rsquo;s note, written for you:</span> &ldquo;You said yes to 4 cards this week. I handled 11 on my own, as you asked. Every engine is healthy.&rdquo;
        </span>
      </Beat>
    </div>
  )
}

/* ── The cursor ghost ───────────────────────────────────────────────────── */

/**
 * Where the drawn cursor goes, per scene, as fractions of the stage frame.
 * The spine positions it from the same `t` (`cursorAt` in `cinema-fx.ts`).
 * Scenes without a script have no cursor.
 */
export const CURSOR_STOPS: Readonly<Record<number, readonly CursorStop[]>> = {
  2: [
    { at: 0.34, x: 0.66, y: 0.72 },
    { at: 0.56, x: 0.45, y: 0.45, click: true },
    { at: 0.76, x: 0.52, y: 0.56 },
  ],
  3: [
    { at: 0.22, x: 0.78, y: 0.55 },
    { at: 0.46, x: 0.9, y: 0.25, click: true },
    { at: 0.7, x: 0.94, y: 0.38 },
  ],
  4: [
    { at: 0.48, x: 0.64, y: 0.5 },
    { at: 0.64, x: 0.53, y: 0.27, click: true },
    { at: 0.86, x: 0.6, y: 0.38 },
  ],
}

function CursorGhost() {
  return (
    <span className="mkt-cursor" aria-hidden="true">
      <span className="mkt-cursor-ring" />
      {/* An arrow cursor. Multi-segment closed shape — nothing the tick veto
          would read as a check. */}
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M5 3l14 9-6 1.2 3.5 6.6-2.6 1.4-3.5-6.7L6 19z" fill="#FFFFFF" stroke="#10182E" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/* ── The stage ───────────────────────────────────────────────────────────── */

const MIDDLE = [RecallPanel, ThreadPanel, SignHerePanel, LedgerPanel, ReviewPanel, WeekPanel]

const STAGE_LABEL = ['Tuesday 15 September', 'Tuesday 15 September', 'Monday 21 September', 'Thursday 17 September', 'Saturday 19 September', 'Friday 25 September']

/**
 * ONE SCENE OF THE STAGE. `scene` is 0-5. Everything that moves inside it
 * reads `--mkt-t`, which the spine writes on the layer around it.
 */
export function CinemaStage({ scene }: { scene: number }) {
  const Middle = MIDDLE[scene] ?? MIDDLE[0]
  const phone = scene === 3
  return (
    <div
      className="mkt-stage flex h-full w-full flex-col gap-3 overflow-hidden p-5 text-left sm:gap-4 sm:p-7 lg:p-9"
      style={{ backgroundColor: STAGE_CANVAS, ...STAGE_BLOOM }}
    >
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className={`text-gray-600 ${MONO_LABEL}`}>DreamCRM · {STAGE_LABEL[scene]}</p>
        <p className={`text-teal-700 ${MONO_LABEL}`}>Dream Dental · Premium</p>
      </div>

      <div className="mkt-stage-body relative flex flex-col items-stretch gap-3 lg:flex-row lg:items-start lg:gap-4">
        <QueuePanel scene={scene} />
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
            <div className="min-w-0 flex-1">
              <Middle />
            </div>
            {phone ? <PhonePanel /> : <KpiStrip scene={scene} className="hidden 2xl:flex 2xl:w-[15rem] 2xl:shrink-0 2xl:flex-col 2xl:gap-4" />}
          </div>
          <KpiStrip scene={scene} className={`hidden gap-3 sm:grid sm:grid-cols-3 ${phone ? '' : '2xl:hidden'}`} />
        </div>
        {CURSOR_STOPS[scene] ? <CursorGhost /> : null}
      </div>
    </div>
  )
}
