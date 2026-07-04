export const metadata = {
  title: 'Call List — DreamCRM',
  description: 'Intent-signaled prospects ready for a call.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getCallList, getPhoneQueue, getProspectDetail, type CallListRow } from '@/lib/services/prospecting'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import CallCard from './call-card'
import PhoneQueue from './phone-queue'

export default async function CallListPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const { highlight } = await searchParams
  const [rows, phoneQueue] = await Promise.all([getCallList(), getPhoneQueue()])

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
          <ActionButton href="/platform/prospecting" variant="secondary">
            ← All prospects
          </ActionButton>
        }
      />
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
