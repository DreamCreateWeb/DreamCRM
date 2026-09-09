export const metadata = {
  title: 'Events — DreamCRM',
  description: 'Conference capture kits — headshot funnels per event.',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getEventStats, listEvents } from '@/lib/services/event-capture'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import EventForm from './event-form'

/**
 * The platform's Events tab (Part 10.8, the conference kit): one row per
 * event with its capture link and the honest counts — captured, awaiting a
 * photo, delivered, opted in, scanned.
 */
export default async function EventsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const events = await listEvents()
  const stats = await Promise.all(events.map((e) => getEventStats(e.id)))
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Platform · Sales Pipeline"
        title="Events"
        subtitle="The conference kit: open the capture link on your phone, and every headshot becomes a warm, attributed lead with a Practice Scan attached."
        actions={
          <Link href="/platform/prospecting" className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400">
            ‹ Pipeline
          </Link>
        }
      />

      <section className="mb-8 rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] p-5 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">New event</h2>
        <EventForm />
      </section>

      {events.length === 0 ? (
        <EmptyState title="No events yet" body="Create one for the next conference — the capture link is minted with it." />
      ) : (
        <div className="space-y-3">
          {events.map((e, i) => {
            const s = stats[i]
            return (
              <div
                key={e.id}
                className="rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] p-4 shadow-[inset_0_0_0_1px_var(--color-hairline)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/platform/prospecting/events/${e.id}`} className="text-base font-semibold text-gray-800 hover:underline dark:text-gray-100">
                      {e.name}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[e.organizer, e.state, e.startsOn ? `${e.startsOn}${e.endsOn ? ` → ${e.endsOn}` : ''}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                      {' · '}
                      <span className="font-mono">{e.slug}</span>
                    </p>
                  </div>
                  <StatusPill tone={e.active ? 'ok' : 'neutral'} label={e.active ? 'Capturing' : 'Closed'} />
                </div>
                <dl className="mt-3 grid grid-cols-5 gap-2 text-center">
                  {[
                    ['Captured', s.captures],
                    ['Need photo', s.awaitingPhoto],
                    ['Delivered', s.delivered],
                    ['Opted in', s.optedIn],
                    ['Scanned', s.scanned],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="rounded-lg bg-white/60 px-2 py-2 dark:bg-gray-900/40">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{k}</dt>
                      <dd className="font-mono-num text-lg font-bold text-gray-800 dark:text-gray-100">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 truncate text-xs text-gray-600 dark:text-gray-300">
                  Capture link: <code className="select-all">{base}/e/{e.captureToken}</code>
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
