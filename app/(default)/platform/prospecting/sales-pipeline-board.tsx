import Link from 'next/link'
import type { PipelineBoard, PipelineCard } from '@/lib/services/prospecting'

/**
 * The pipeline Kanban. Four derived stages a prospect flows through —
 * Prospects → Communicated → Demo Scheduled → Demo Completed — each showing the
 * top few cards plus a link to its full page. Stages are computed from data
 * (touches, calls, meetings, time), so cards move themselves; nothing is
 * dragged. The first column is a pure count (there can be thousands of
 * untouched leads); the rest show live cards.
 */

const COLUMN_TONE: Record<string, string> = {
  prospects: 'border-t-gray-300 dark:border-t-gray-600',
  communicated: 'border-t-sky-400',
  scheduled: 'border-t-violet-400',
  completed: 'border-t-emerald-400',
}

function Card({ card }: { card: PipelineCard }) {
  const place = [card.city, card.state].filter(Boolean).join(', ')
  return (
    <Link
      href={card.href}
      className="block rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--color-hairline)] transition hover:shadow-[inset_0_0_0_1px_var(--color-hairline),0_1px_6px_rgba(0,0,0,0.06)]"
    >
      <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{card.name}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="truncate">{place || '—'}</span>
        {card.subtitle && <span className="shrink-0 font-medium text-gray-600 dark:text-gray-300">{card.subtitle}</span>}
      </div>
    </Link>
  )
}

function Column({
  toneKey,
  label,
  count,
  children,
  viewAllHref,
  viewAllLabel,
}: {
  toneKey: string
  label: string
  count: number
  children: React.ReactNode
  viewAllHref: string
  viewAllLabel: string
}) {
  return (
    <div className={`flex flex-col rounded-[var(--r-lg)] border-t-[3px] bg-[color:var(--color-surface-sunk)] ${COLUMN_TONE[toneKey]}`}>
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</h3>
        <span className="rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-600 dark:text-gray-300 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
          {count}
        </span>
      </div>
      <div className="flex-1 space-y-2 px-3">{children}</div>
      <div className="px-3 py-2.5">
        <Link href={viewAllHref} className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400">
          {viewAllLabel} →
        </Link>
      </div>
    </div>
  )
}

export default function SalesPipelineBoard({ board }: { board: PipelineBoard }) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Prospects — a count (there can be thousands), links to the full list. */}
      <Column
        toneKey="prospects"
        label="Prospects"
        count={board.prospects.count}
        viewAllHref="#prospect-table"
        viewAllLabel="Open the full list"
      >
        <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] px-3 py-4 text-center shadow-[inset_0_0_0_1px_var(--color-hairline)]">
          <p className="font-mono-num text-3xl font-bold text-gray-800 dark:text-gray-100">{board.prospects.count}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            waiting to be worked · {board.prospects.tracked} tracked in all
          </p>
        </div>
      </Column>

      <Column
        toneKey="communicated"
        label="Communicated"
        count={board.communicated.count}
        viewAllHref="/platform/prospecting/communications"
        viewAllLabel="All communications"
      >
        {board.communicated.cards.length === 0 ? (
          <EmptyHint text="No outreach or calls logged yet." />
        ) : (
          board.communicated.cards.map((c) => <Card key={c.prospectId} card={c} />)
        )}
      </Column>

      <Column
        toneKey="scheduled"
        label="Demo Scheduled"
        count={board.demoScheduled.count}
        viewAllHref="/platform/prospecting/demos"
        viewAllLabel="All demos"
      >
        {board.demoScheduled.cards.length === 0 ? (
          <EmptyHint text="No upcoming demos yet." />
        ) : (
          board.demoScheduled.cards.map((c) => <Card key={c.prospectId} card={c} />)
        )}
      </Column>

      <Column
        toneKey="completed"
        label="Demo Completed"
        count={board.demoCompleted.count}
        viewAllHref="/platform/prospecting/demos#completed"
        viewAllLabel="All demos"
      >
        {board.demoCompleted.cards.length === 0 ? (
          <EmptyHint text="No demos have happened yet." />
        ) : (
          board.demoCompleted.cards.map((c) => <Card key={c.prospectId} card={c} />)
        )}
      </Column>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="px-1 py-3 text-xs text-gray-400 dark:text-gray-500">{text}</p>
}
