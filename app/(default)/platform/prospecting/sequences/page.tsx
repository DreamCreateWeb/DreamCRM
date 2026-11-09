export const metadata = {
  title: 'Outreach Sequences — DreamCRM',
  description: 'Cold-outreach touch templates, cadence, and pause control.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listSequencesWithStats } from '@/lib/services/prospect-outreach'
import { PageFrame } from '@/components/ui/page-frame'
import { ActionButton } from '@/components/ui/action-button'
import SequenceEditor from './sequence-editor'

export default async function SequencesPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const sequences = await listSequencesWithStats()

  return (
    <PageFrame width="4xl"
        eyebrow="Platform · Prospecting"
        title="Outreach Sequences"
        subtitle="The touch templates the drip engine personalizes per prospect. {{firstName}}, {{clinicName}}, and {{city}} merge automatically; AI personalization weaves in each prospect's verified gaps."
        actions={
          <ActionButton href="/platform/prospecting" variant="secondary">
            ← Back to Prospecting
          </ActionButton>
        }
    >
      {sequences.map((seq) => (
        <SequenceEditor key={seq.id} sequence={seq} />
      ))}
    </PageFrame>
  )
}
