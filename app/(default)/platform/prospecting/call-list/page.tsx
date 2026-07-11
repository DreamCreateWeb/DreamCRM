export const metadata = {
  title: 'Call List — DreamCRM',
  description: 'Intent-signaled prospects ready for a call.',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getCallList, getPhoneQueue, getProspectDetail, type CallListRow } from '@/lib/services/prospecting'
import { getUpcomingMeetings, formatMeetingTime } from '@/lib/services/prospect-meetings'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import CallCard from './call-card'
import PhoneQueue from './phone-queue'
import { prospectInitials } from '@/lib/prospect-when'

export default async function CallListPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const { highlight } = await searchParams
  const [rows, phoneQueue, meetings] = await Promise.all([
    getCallList(),
    getPhoneQueue(),
    getUpcomingMeetings(),
  ])

  // Just-demoed prospect (the End-demo redirect): pin them at the top for
  // outcome logging even when no intent signal has put them on the list yet.
  let pinned: CallListRow | null = null
  if (highlight && !rows.some((r) => r.id === highlight)) {
    const detail = await getProspectDetail(highlight)
    if (detail && !['converted', 'suppressed'].includes(detail.prospect.status)) {
      const p = detail.prospect
      pinned = {
        id: p.id,
        name: p.name,
        city: p.city,
        state: p.state,
        phone: p.phone,
        email: p.email,
        authorizedOfficialName: p.authorizedOfficialName,
        intentSignal: p.intentSignal,
        intentAt: p.intentAt,
        intentSummary: p.intentSummary,
        talkingPoints: Array.isArray(p.talkingPoints) ? (p.talkingPoints as string[]) : [],
        replyDraft: p.replyDraft ?? null,
        opportunityScore: p.opportunityScore,
        scoreBand: p.scoreBand,
        lastCallOutcome: detail.calls[0]?.outcome ?? null,
      }
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Platform · Prospecting"
        title="Call List"
        subtitle="Every practice here raised a hand — a reply, a click, a demo request. Freshest signal first. Call them while it's warm."
        actions={
          <div className="flex items-center gap-2">
            <ActionButton href="/platform/prospecting" variant="secondary">
              ← All prospects
            </ActionButton>
            <ActionButton href="/platform/prospecting/call-mode" variant="primary">
              ▶ Call Mode
            </ActionButton>
          </div>
        }
      />
      {meetings.length > 0 && (
        <div className="mb-6 rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-4 ring-1 ring-[color:var(--color-hairline)]">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              📅 Booked demos
            </span>
            <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-mono-num text-xs font-bold text-violet-600 dark:text-violet-400">
              {meetings.length}
            </span>
          </div>
          <ul className="space-y-1.5">
            {meetings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link
                  href={`/platform/prospecting?prospect=${m.prospectId}`}
                  className="flex min-w-0 items-center gap-2 font-semibold text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-violet-500 text-xs font-bold text-white"
                    aria-hidden="true"
                  >
                    {prospectInitials(m.prospectName)}
                  </span>
                  <span className="truncate">{m.prospectName}</span>
                </Link>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  {formatMeetingTime(m.scheduledAt, m.hostTimeZone)}
                  {m.attendeeEmail ? ` · ${m.attendeeEmail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pinned && (
        <div
          className="mb-6 rounded-xl ring-2 p-0.5"
          style={{ ['--tw-ring-color' as string]: 'var(--demo-accent, #f59e0b)' }}
        >
          <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            🎬 You just demoed {pinned.name} — log the outcome while it&apos;s fresh
          </div>
          <CallCard row={pinned} />
        </div>
      )}
      {rows.length === 0 && !pinned && phoneQueue.length === 0 ? (
        <EmptyState
          icon="📞"
          title="No one on the list yet"
          body="When a prospect replies with interest, clicks through, or books a demo, they land here with an AI summary and talking points."
          action={
            <ActionButton href="/platform/prospecting" variant="secondary">
              Browse prospects
            </ActionButton>
          }
        />
      ) : (
        <>
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              🔥 Hand-raisers
            </span>
            <span className="rounded-full bg-[color:var(--color-surface-sunk)] px-2 py-0.5 font-mono-num text-xs font-bold text-gray-500 dark:text-gray-400">
              {rows.length}
            </span>
          </div>
          <div className="space-y-4">
            {rows.map((row) => (
              <div
                key={row.id}
                className={row.id === highlight ? 'rounded-xl ring-2 p-0.5' : undefined}
                style={
                  row.id === highlight
                    ? { ['--tw-ring-color' as string]: 'var(--demo-accent, #f59e0b)' }
                    : undefined
                }
              >
                {row.id === highlight && (
                  <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    🎬 You just demoed {row.name} — log the outcome while it&apos;s fresh
                  </div>
                )}
                <CallCard row={row} />
              </div>
            ))}
          </div>
          <PhoneQueue rows={phoneQueue} />
        </>
      )}
    </div>
  )
}
