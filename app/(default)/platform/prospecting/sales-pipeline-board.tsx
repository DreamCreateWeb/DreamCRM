import Link from 'next/link'
import type { PipelineBoard, PipelineCard } from '@/lib/services/prospecting'
import { prospectInitials } from '@/lib/prospect-when'

/**
 * The pipeline Kanban — the hero of the Sales Pipeline. Four derived stages a
 * prospect flows through, each prospect on its FURTHEST reached stage:
 *
 *   Prospects → Communicated → Demo Scheduled → Demo Completed
 *
 * Stages are computed from data (touches, calls, meetings, time) — cards move
 * themselves; nothing is dragged. The first column is a headline count (there
 * can be thousands of untouched leads) with a warmth bar; the rest show live
 * cards (each with a stage-tinted initials tile) + a link to their full page.
 */

interface StageStyle {
  /** The column's stage number ①→④ — same visual language as Call Mode's
   *  teleprompter stages: a tinted circle, not a dot. */
  n: number
  numClass: string
  accent: string
  avatar: string
}
const STAGE: Record<string, StageStyle> = {
  prospects: { n: 1, numClass: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300', accent: 'text-gray-500 dark:text-gray-400', avatar: 'bg-gray-400' },
  communicated: { n: 2, numClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', accent: 'text-sky-600 dark:text-sky-400', avatar: 'bg-sky-500' },
  scheduled: { n: 3, numClass: 'bg-violet-500/12 text-violet-600 dark:text-violet-400', accent: 'text-violet-600 dark:text-violet-400', avatar: 'bg-violet-500' },
  completed: { n: 4, numClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', accent: 'text-emerald-600 dark:text-emerald-400', avatar: 'bg-emerald-500' },
}

// Next-step tone → subtitle color. 'due' is the only urgent one (amber);
// 'reply' is a hot hand-raiser (teal); 'quiet' is a cooling lead (muted).
const TONE_TEXT: Record<NonNullable<PipelineCard['tone']>, string> = {
  due: 'text-amber-600 dark:text-amber-400',
  reply: 'text-teal-600 dark:text-teal-400',
  quiet: 'text-gray-400 dark:text-gray-500',
}

function Card({ card, stage }: { card: PipelineCard; stage: keyof typeof STAGE }) {
  const place = [card.city, card.state].filter(Boolean).join(', ')
  const s = STAGE[stage]
  const soon = card.soon
  const subtitleClass = soon
    ? 'text-violet-600 dark:text-violet-400'
    : card.tone
      ? TONE_TEXT[card.tone]
      : 'text-gray-600 dark:text-gray-300'
  return (
    <Link
      href={card.href}
      className={`flex items-start gap-2.5 rounded-[var(--r-md)] px-2.5 py-2.5 ring-1 transition hover:-translate-y-px hover:shadow-sm ${
        soon
          ? 'bg-violet-50 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/30'
          : 'bg-[color:var(--color-surface-2)] ring-[color:var(--color-hairline)]'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-xs font-bold text-white ${s.avatar}`}
        aria-hidden="true"
      >
        {prospectInitials(card.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9rem] font-semibold leading-tight text-gray-800 dark:text-gray-100">
          {card.name}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-gray-500 dark:text-gray-400">{place || '—'}</span>
          {card.subtitle && (
            <span className={`shrink-0 font-semibold ${subtitleClass}`}>{card.subtitle}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

function Column({
  stage,
  label,
  count,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  stage: keyof typeof STAGE
  label: string
  count: number
  viewAllHref: string
  viewAllLabel: string
  children: React.ReactNode
}) {
  const s = STAGE[stage]
  return (
    <div className="flex min-h-[16rem] flex-col rounded-[var(--r-lg)] bg-[color:var(--color-surface-sunk)] ring-1 ring-[color:var(--color-hairline)]">
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[0.68rem] font-extrabold ${s.numClass}`}
            aria-hidden="true"
          >
            {s.n}
          </span>
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">{label}</h3>
        </div>
        <span className="rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-bold tabular-nums text-gray-600 ring-1 ring-[color:var(--color-hairline)] dark:text-gray-300">
          {count.toLocaleString()}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3.5">{children}</div>
      <div className="px-3.5 py-3">
        <Link href={viewAllHref} className={`text-xs font-semibold ${s.accent} hover:underline`}>
          {viewAllLabel} →
        </Link>
      </div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="px-1 py-6 text-center text-xs text-gray-400 dark:text-gray-500">{text}</p>
}

/** The waiting-pool warmth bar + legend on the Prospects headline. */
function WarmthBar({ hot, warm, cool }: { hot: number; warm: number; cool: number }) {
  const total = hot + warm + cool
  if (total === 0) return null
  const pct = (n: number) => `${(n / total) * 100}%`
  return (
    <div className="mt-3.5 w-full">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {hot > 0 && <div className="bg-rose-500" style={{ width: pct(hot) }} />}
        {warm > 0 && <div className="bg-amber-500" style={{ width: pct(warm) }} />}
        {cool > 0 && <div className="bg-slate-400" style={{ width: pct(cool) }} />}
      </div>
      <div className="mt-2 flex justify-center gap-3 text-[0.65rem] text-gray-500 dark:text-gray-400">
        <span>
          <b className="tabular-nums text-gray-700 dark:text-gray-200">{hot.toLocaleString()}</b> hot
        </span>
        <span>
          <b className="tabular-nums text-gray-700 dark:text-gray-200">{warm.toLocaleString()}</b> warm
        </span>
        <span>
          <b className="tabular-nums text-gray-700 dark:text-gray-200">{cool.toLocaleString()}</b> cool
        </span>
      </div>
    </div>
  )
}

export default function SalesPipelineBoard({ board }: { board: PipelineBoard }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Prospects — a headline count (there can be thousands) + warmth bar. */}
      <Column stage="prospects" label="Prospects" count={board.prospects.count} viewAllHref="/platform/prospecting?view=prospects" viewAllLabel="Browse the full list">
        <div className="flex h-full flex-col items-center justify-center rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] px-3 py-6 text-center ring-1 ring-[color:var(--color-hairline)]">
          <p className="font-mono-num text-4xl font-bold leading-none text-gray-800 dark:text-gray-100">
            {board.prospects.count.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            waiting to be worked
          </p>
          <p className="mt-0.5 text-[0.7rem] text-gray-400 dark:text-gray-500">
            {board.prospects.tracked.toLocaleString()} tracked in all
          </p>
          <WarmthBar hot={board.prospects.hot} warm={board.prospects.warm} cool={board.prospects.cool} />
        </div>
      </Column>

      <Column stage="communicated" label="Communicated" count={board.communicated.count} viewAllHref="/platform/prospecting/communications" viewAllLabel="All communications">
        {board.communicated.cards.length === 0 ? (
          <EmptyHint text="Nobody worked yet — the hunter's emails and your logged calls land here." />
        ) : (
          board.communicated.cards.map((c) => <Card key={c.prospectId} card={c} stage="communicated" />)
        )}
      </Column>

      <Column stage="scheduled" label="Demo Scheduled" count={board.demoScheduled.count} viewAllHref="/platform/prospecting/demos" viewAllLabel="All demos">
        {board.demoScheduled.cards.length === 0 ? (
          <EmptyHint text="No demos booked. Book one from a hot reply or a good call." />
        ) : (
          board.demoScheduled.cards.map((c) => (
            <div key={c.prospectId} className="space-y-1">
              <Card card={c} stage="scheduled" />
              {c.soon && (
                // One-tap to the AI prep brief — surfaced only when the demo is
                // imminent, so it reads as "get ready now", not clutter.
                <Link
                  href={`/platform/prospecting/demo/${c.prospectId}`}
                  className="ml-1.5 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-violet-600 hover:underline dark:text-violet-400"
                >
                  🎬 Prep for this demo →
                </Link>
              )}
            </div>
          ))
        )}
      </Column>

      <Column stage="completed" label="Demo Completed" count={board.demoCompleted.count} viewAllHref="/platform/prospecting/demos#completed" viewAllLabel="All demos">
        {board.demoCompleted.cards.length === 0 ? (
          <EmptyHint text="Once a demo's time passes, it lands here to close out." />
        ) : (
          board.demoCompleted.cards.map((c) => (
            // Everyone here is awaiting a verdict — a win converts them off the
            // board, a pass drops them off with a reason that sharpens the next
            // pitch. Nudge the outcome so the learning loop never starves.
            <div key={c.prospectId} className="space-y-1">
              <Card card={c} stage="completed" />
              <Link
                href={c.href}
                className="ml-1.5 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-amber-600 hover:underline dark:text-amber-400"
              >
                🏁 Won it? Log the outcome →
              </Link>
            </div>
          ))
        )}
      </Column>
    </div>
  )
}
