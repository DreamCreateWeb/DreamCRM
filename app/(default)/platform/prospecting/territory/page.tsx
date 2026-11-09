export const metadata = {
  title: 'Territory — DreamCRM',
  description: 'Per-state prospecting coverage and focus mode.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getProspectingConfig, getTerritoryCoverage } from '@/lib/services/prospecting'
import { PageFrame } from '@/components/ui/page-frame'
import { ActionButton } from '@/components/ui/action-button'
import TerritoryTable from './territory-table'

export default async function TerritoryPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const config = await getProspectingConfig()
  const rows = await getTerritoryCoverage(config.enabledStates)

  return (
    <PageFrame width="5xl"
        eyebrow="Platform · Prospecting"
        title="Territory & coverage"
        subtitle="Where the hunt has reached, how much of each state you've worked, and what's converting — pick one to focus."
        actions={
          <ActionButton href="/platform/prospecting" variant="secondary">
            ← Back to Prospecting
          </ActionButton>
        }
    >
      <TerritoryTable rows={rows} focusState={config.focus.state} />
    </PageFrame>
  )
}
