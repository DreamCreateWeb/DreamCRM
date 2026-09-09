export const metadata = {
  title: 'Event captures — DreamCRM',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getEvent, getEventStats, listCaptures } from '@/lib/services/event-capture'
import { CAPTURE_ROLE_LABELS } from '@/lib/event-capture'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import AttachPhoto from './attach-photo'
import { setEventActiveAction } from '../admin-actions'

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()
  const [captures, stats] = await Promise.all([listCaptures(id), getEventStats(id)])
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')
  const toggle = setEventActiveAction.bind(null, id, !event.active)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Platform · Sales Pipeline · Events"
        title={event.name}
        subtitle={
          <>
            {[event.organizer, event.state].filter(Boolean).join(' · ')} · campaign <code>{event.slug}</code> ·{' '}
            {stats.captures} captured · {stats.awaitingPhoto} need a photo · {stats.optedIn} opted in
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            <form action={toggle}>
              <button type="submit" className="text-sm font-medium text-gray-600 hover:underline dark:text-gray-300">
                {event.active ? 'Close capture' : 'Reopen capture'}
              </button>
            </form>
            <Link href="/platform/prospecting/events" className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400">
              ‹ Events
            </Link>
          </div>
        }
      />

      <p className="mb-6 rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] px-4 py-3 text-sm text-gray-700 shadow-[inset_0_0_0_1px_var(--color-hairline)] dark:text-gray-200">
        Capture link (open on your phone): <code className="select-all break-all">{base}/e/{event.captureToken}</code>
      </p>

      {captures.length === 0 ? (
        <EmptyState title="Nobody captured yet" body="Open the capture link on your phone and hand it to the first person who wants a headshot." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-md)] shadow-[inset_0_0_0_1px_var(--color-hairline)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)] text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Practice</th>
                <th className="px-3 py-2">Scan</th>
                <th className="px-3 py-2">Consent</th>
                <th className="px-3 py-2">Photo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-hairline)]">
              {captures.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-800 dark:text-gray-100">
                      {c.firstName} {c.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {c.email} · {CAPTURE_ROLE_LABELS[c.role] ?? c.role}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                    {c.prospectId ? (
                      <Link href={`/platform/prospecting?prospect=${c.prospectId}`} className="hover:underline">
                        {c.practiceName}
                      </Link>
                    ) : (
                      c.practiceName
                    )}
                    {c.city ? <p className="text-xs text-gray-500">{c.city}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    {c.gradeToken ? (
                      <a href={`/g/${c.gradeToken}`} target="_blank" rel="noopener" className="font-mono-num font-semibold text-teal-600 hover:underline dark:text-teal-400">
                        {c.gradeLetter ?? '—'}
                        {c.gradeOverall != null ? ` · ${c.gradeOverall}` : ''}
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={c.optIn ? 'ok' : 'neutral'} label={c.optIn ? 'Opted in' : 'Headshot only'} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      tone={c.status === 'delivered' ? 'ok' : 'warn'}
                      label={c.status === 'delivered' ? 'Delivered' : 'Needs photo'}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <AttachPhoto eventId={id} captureId={c.id} delivered={c.status === 'delivered'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
