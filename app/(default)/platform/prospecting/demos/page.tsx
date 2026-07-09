export const metadata = {
  title: 'Demos — DreamCRM',
  description: 'Every Dream Create demo — upcoming and completed.',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listDemos, type DemoRow } from '@/lib/services/prospect-meetings'
import { prospectInitials } from '@/lib/prospect-when'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'

const STATUS_META: Record<string, { tone: 'ok' | 'warn' | 'urgent' | 'info' | 'neutral'; label: string }> = {
  booked: { tone: 'info', label: 'Booked' },
  completed: { tone: 'ok', label: 'Completed' },
  no_show: { tone: 'urgent', label: 'No-show' },
}

function DemoRowItem({ d, past }: { d: DemoRow; past: boolean }) {
  const place = [d.city, d.state].filter(Boolean).join(', ')
  const meta = STATUS_META[d.status] ?? { tone: 'neutral' as const, label: d.status }
  // Upcoming demos read better relative ("Tomorrow · 2:00 PM"); the archive
  // wants the precise absolute date.
  const when = past ? d.whenLabel : d.relativeWhen
  return (
    <Link
      href={d.href}
      className="flex items-center justify-between gap-3 rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-hairline)] transition hover:shadow-[inset_0_0_0_1px_var(--color-hairline),0_1px_6px_rgba(0,0,0,0.06)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-xs font-bold text-white ${
            past ? 'bg-emerald-500' : 'bg-violet-500'
          }`}
          aria-hidden="true"
        >
          {prospectInitials(d.prospectName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{d.prospectName}</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {place || '—'}
            {d.attendeeName ? ` · ${d.attendeeName}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-300">{when}</span>
        {past ? <StatusPill tone={meta.tone} label={meta.label} /> : null}
      </div>
    </Link>
  )
}

export default async function DemosPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const demos = await listDemos()
  const now = Date.now()
  const upcoming = demos
    .filter((d) => d.scheduledAt.getTime() > now && d.status === 'booked')
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  const completed = demos
    .filter((d) => !(d.scheduledAt.getTime() > now && d.status === 'booked'))
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Platform · Sales Pipeline"
        title="Demos"
        subtitle="Every Dream Create demo — booked and done. Click any to open its deal room."
        actions={
          <Link href="/platform/prospecting" className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400">
            ‹ Pipeline
          </Link>
        }
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming demos" body="Book one from a call (＋ Add a clinic) or a prospect's deal room." />
        ) : (
          <div className="space-y-2">
            {upcoming.map((d) => (
              <DemoRowItem key={d.id} d={d} past={false} />
            ))}
          </div>
        )}
      </section>

      <section id="completed" className="scroll-mt-16">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Completed ({completed.length})
        </h2>
        {completed.length === 0 ? (
          <EmptyState title="No demos have happened yet" body="Past demos land here automatically once their time passes." />
        ) : (
          <div className="space-y-2">
            {completed.map((d) => (
              <DemoRowItem key={d.id} d={d} past={true} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
