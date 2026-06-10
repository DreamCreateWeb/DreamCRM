import { computePipelineMetrics, listPipelineProjects } from '@/lib/services/projects'
import { listClinics } from '@/lib/services/clinics'
import PipelineStats from './pipeline-stats'
import PipelineBoard from './pipeline-board'
import NewProjectModal from './new-project-modal'
import { PageHeader } from '@/components/ui/page-header'

export default async function SalesPipeline() {
  const [projects, clinics] = await Promise.all([listPipelineProjects(), listClinics()])
  const metrics = computePipelineMetrics(projects)
  const clinicOptions = clinics.map((c) => ({ id: c.orgId, name: c.name }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Platform · Dream Create"
        title="Sales Pipeline"
        subtitle="Every agency project — website builds, intake forms, content shoots — across all clinics and prospects."
        actions={<NewProjectModal clinics={clinicOptions} />}
      />

      <PipelineStats metrics={metrics} />
      <PipelineBoard projects={projects} />
    </div>
  )
}
