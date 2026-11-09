import { computePipelineMetrics, listPipelineProjects } from '@/lib/services/projects'
import { listClinics } from '@/lib/services/clinics'
import PipelineStats from './pipeline-stats'
import PipelineBoard from './pipeline-board'
import NewProjectModal from './new-project-modal'
import { PageFrame } from '@/components/ui/page-frame'

export default async function SalesPipeline() {
  const [projects, clinics] = await Promise.all([listPipelineProjects(), listClinics()])
  const metrics = computePipelineMetrics(projects)
  const clinicOptions = clinics.map((c) => ({ id: c.orgId, name: c.name }))

  return (
    <PageFrame
        eyebrow="Platform · Dream Create"
        title="Projects"
        subtitle="Every agency project you deliver — website builds, intake forms, content shoots — across all clinics and prospects."
        actions={<NewProjectModal clinics={clinicOptions} />}
    >

      <PipelineStats metrics={metrics} />
      <PipelineBoard projects={projects} clinics={clinicOptions} />
    </PageFrame>
  )
}
