import { computePipelineMetrics, listPipelineProjects } from '@/lib/services/projects'
import { listClinics } from '@/lib/services/clinics'
import PipelineStats from './pipeline-stats'
import PipelineBoard from './pipeline-board'
import NewProjectModal from './new-project-modal'

export default async function SalesPipeline() {
  const [projects, clinics] = await Promise.all([listPipelineProjects(), listClinics()])
  const metrics = computePipelineMetrics(projects)
  const clinicOptions = clinics.map((c) => ({ id: c.orgId, name: c.name }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-6">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Sales Pipeline
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Every agency project — website builds, intake forms, content shoots — across all clinics and prospects.
          </p>
        </div>
        <NewProjectModal clinics={clinicOptions} />
      </div>

      <PipelineStats metrics={metrics} />
      <PipelineBoard projects={projects} />
    </div>
  )
}
