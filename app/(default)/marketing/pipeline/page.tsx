import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { marketingTerminology } from '@/lib/marketing/terminology'
import { getLead, listLeads } from '@/lib/services/marketing'
import PipelineBoard, { type PipelineLead } from './pipeline-board'
import AddLeadButton from './add-lead-button'
import PipelineLeadDrawer from './pipeline-lead-drawer'

export const metadata = {
  title: 'Pipeline - DreamCRM',
  description: 'Drag leads through pipeline stages',
}

export const dynamic = 'force-dynamic'

interface SP {
  q?: string
  source?: string
  lead?: string
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  const params = await searchParams
  const t = marketingTerminology(ctx.tenantType)

  const leads = await listLeads(ctx.organizationId, {
    search: params.q,
    source: params.source,
  })

  const byStage: Record<string, PipelineLead[]> = {}
  for (const s of t.stages) byStage[s.key] = []
  for (const l of leads) {
    const stageRows = byStage[l.pipelineStage] ?? (byStage[l.pipelineStage] = [])
    stageRows.push({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      pipelineStage: l.pipelineStage,
      leadSource: l.leadSource,
      lastActivityAt: l.lastActivityAt ? l.lastActivityAt.toISOString() : null,
      optedOut: l.optedOut,
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-4">
        <div className="mb-3 sm:mb-0">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            {t.Leads} Pipeline
          </h1>
          <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">
            Drag a card to move {t.lead === 'lead' ? 'a lead' : 'a patient'} between stages.
          </p>
        </div>
        <AddLeadButton stages={t.stages} sources={t.sources} />
      </div>

      <PipelineBoard
        initialByStage={byStage}
        stages={t.stages}
      />

      <PipelineLeadDrawer
        lead={
          params.lead
            ? await getLead(ctx.organizationId, Number(params.lead)).then((row) =>
                row
                  ? {
                      id: row.id,
                      name: row.name,
                      email: row.email,
                      phone: row.phone,
                      location: row.location,
                      pipelineStage: row.pipelineStage,
                      leadSource: row.leadSource,
                      lifecycleStage: row.lifecycleStage,
                      notes: row.notes,
                      optedOut: row.optedOut,
                      lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
                      createdAt: row.createdAt.toISOString(),
                    }
                  : null,
              )
            : null
        }
        stages={t.stages}
        sources={t.sources}
      />
    </div>
  )
}
