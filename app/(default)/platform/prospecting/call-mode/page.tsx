export const metadata = {
  title: 'Call Mode — DreamCRM',
  description: 'One call at a time — script on screen, one-tap outcomes.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getCallQueue } from '@/lib/services/prospecting'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import CallSession from './call-session'

/**
 * Call Mode — the cockpit for the part of the job the owner dreads. One
 * prospect at a time: the AI script for the first ten seconds, their local
 * time, the warm signals that prove it isn't really cold, one-tap outcomes
 * that log + advance. The queue is pre-ordered warmest-first so momentum
 * builds instead of draining.
 */
export default async function CallModePage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const queue = await getCallQueue()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Platform · Sales Pipeline"
        title="📞 Call Mode"
        subtitle="One call at a time. The script's on screen, the outcome is one key, and the next call loads itself."
        actions={
          <ActionButton href="/platform/prospecting" variant="secondary">
            ✕ End session
          </ActionButton>
        }
      />

      {queue.length === 0 ? (
        <EmptyState
          icon="📞"
          title="Nobody to call right now"
          body="The queue fills from hand-raisers (they replied), follow-ups you promised, and hot phone-first prospects with no email. When someone lands in any of those, they'll be here."
          action={
            <ActionButton href="/platform/prospecting" variant="secondary">
              Back to the pipeline
            </ActionButton>
          }
        />
      ) : (
        <CallSession items={queue} />
      )}
    </div>
  )
}
