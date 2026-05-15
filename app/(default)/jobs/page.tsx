import JobsSidebar from './jobs-sidebar'
import JobsItem, { type JobListItem } from './jobs-item'
import DropdownSort from './sort-dropdown'
import PaginationNumeric from '@/components/pagination-numeric'
import PostJobModal from './post-job-modal'
import { requireUser } from '@/lib/session'
import { listJobs } from '@/lib/services/jobs'
import { formatMoney } from '@/lib/utils'

export const metadata = {
  title: 'Jobs - DreamCRM',
  description: 'Job board',
}

export const dynamic = 'force-dynamic'

export default async function Jobs({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  await requireUser()
  const params = await searchParams
  const jobs = await listJobs({ search: params.q, type: params.type })

  const items: JobListItem[] = jobs.map((j) => {
    const salary =
      j.salaryMinCents && j.salaryMaxCents
        ? `${formatMoney(j.salaryMinCents)}–${formatMoney(j.salaryMaxCents)}`
        : null
    const parts = [j.type, j.remote ? 'Remote' : null, j.location || 'Anywhere', salary]
      .filter(Boolean)
      .join(' / ')
    return {
      id: j.id,
      title: j.title,
      slug: j.slug,
      details: parts,
      date: j.createdAt,
      type: j.type,
      remote: j.remote,
      companyName: j.companyName,
      companyLogo: j.companyLogo,
      isNew: Date.now() - new Date(j.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000,
    }
  })

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-5">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Search For Jobs</h1>
        </div>
        <PostJobModal />
      </div>

      <div className="flex flex-col space-y-10 sm:flex-row sm:space-x-6 sm:space-y-0 md:flex-col md:space-x-0 md:space-y-10 xl:flex-row xl:space-x-6 xl:space-y-0 mt-9">
        <JobsSidebar />
        <div className="w-full">
          <div className="mb-5">
            <form className="relative" method="GET">
              <label htmlFor="search" className="sr-only">Search</label>
              <input
                id="search"
                name="q"
                defaultValue={params.q ?? ''}
                className="form-input w-full pl-9 bg-white dark:bg-gray-800"
                type="search"
                placeholder="Search job title or company…"
              />
              <button className="absolute inset-0 right-auto group" type="submit" aria-label="Search">
                <svg className="shrink-0 fill-current text-gray-400 dark:text-gray-500 group-hover:text-gray-500 ml-3 mr-2" width="16" height="16" viewBox="0 0 16 16">
                  <path d="M7 14c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zM7 2C4.243 2 2 4.243 2 7s2.243 5 5 5 5-2.243 5-5-2.243-5-5-5z" />
                  <path d="M15.707 14.293L13.314 11.9a8.019 8.019 0 01-1.414 1.414l2.393 2.393a.997.997 0 001.414 0 .999.999 0 000-1.414z" />
                </svg>
              </button>
            </form>
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-500 dark:text-gray-400 italic">
              Showing {items.length} {items.length === 1 ? 'job' : 'jobs'}
            </div>
            <div className="text-sm">
              <span>Sort by </span>
              <DropdownSort align="right" />
            </div>
          </div>

          <div className="space-y-2">
            {items.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No jobs yet. Click <strong>Post A Job</strong> to add one.
              </div>
            ) : (
              items.map((job) => <JobsItem key={job.id} job={job} />)
            )}
          </div>

          <div className="mt-6">
            <PaginationNumeric />
          </div>
        </div>
      </div>
    </div>
  )
}
