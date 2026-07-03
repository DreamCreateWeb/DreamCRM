export const metadata = {
  title: 'Call List — DreamCRM',
  description: 'Intent-signaled prospects ready for a call.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getCallList } from '@/lib/services/prospecting'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import CallCard from './call-card'

export default async function CallListPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const rows = await getCallList()

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
      {rows.length === 0 ? (
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
        <div className="space-y-4">
          {rows.map((row) => (
            <CallCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}
