import Link from 'next/link'
import { notFound } from 'next/navigation'
import JobsItem, { type JobListItem } from '../jobs-item'
import { getJobBySlug, listJobs } from '@/lib/services/jobs'
import { requireUser } from '@/lib/session'
import { formatMoney, relativeTime } from '@/lib/utils'

export const metadata = {
  title: 'Job Post - DreamCRM',
  description: 'Job listing detail',
}

export const dynamic = 'force-dynamic'

export default async function JobPost({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  await requireUser()
  const { slug } = await searchParams
  if (!slug) {
    // Fall back to the first available job
    const recent = await listJobs()
    if (recent.length === 0) {
      return (
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">No jobs yet</h1>
          <p>
            <Link className="text-violet-500" href="/jobs">Go back to the jobs list</Link> and post one.
          </p>
        </div>
      )
    }
    return JobPostBySlug({ slug: recent[0].slug })
  }
  return JobPostBySlug({ slug })
}

async function JobPostBySlug({ slug }: { slug: string }) {
  const result = await getJobBySlug(slug)
  if (!result) notFound()
  const { job, company } = result
  const related = await listJobs({ type: job.type })
  const others = related.filter((j) => j.id !== job.id).slice(0, 4)

  const salary =
    job.salaryMinCents && job.salaryMaxCents
      ? `${formatMoney(job.salaryMinCents)} – ${formatMoney(job.salaryMaxCents)}`
      : null

  const items: JobListItem[] = others.map((j) => ({
    id: j.id,
    title: j.title,
    slug: j.slug,
    details: [j.type, j.remote ? 'Remote' : null, j.location || 'Anywhere'].filter(Boolean).join(' / '),
    date: j.createdAt,
    type: j.type,
    remote: j.remote,
    companyName: j.companyName,
    companyLogo: j.companyLogo,
    isNew: Date.now() - new Date(j.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000,
  }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="xl:flex">
        <div className="grow pr-0 lg:pr-6">
          <header>
            <div className="text-sm text-gray-500 dark:text-gray-400 italic">
              Posted {relativeTime(job.createdAt)}
            </div>
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold mt-2 mb-3">
              {job.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-800 dark:text-gray-200">{company?.name}</span>
              <span>·</span>
              <span>{job.location || 'Anywhere'}</span>
              <span>·</span>
              <span className="capitalize">{job.type}</span>
              {job.remote && (
                <span className="btn-xs text-xs border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300 px-2.5 py-1 rounded-full">
                  Remote
                </span>
              )}
              {salary && <span className="text-green-600 font-medium ml-2">{salary}</span>}
            </div>
          </header>

          <hr className="my-6 border-t border-gray-100 dark:border-gray-700/60" />

          <div>
            <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-2">The Role</h2>
            <div className="space-y-4 whitespace-pre-wrap">
              {job.description ?? 'The hiring team has not added a description yet.'}
            </div>
          </div>

          <div className="mt-6">
            <button className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white whitespace-nowrap">
              Apply Today -&gt;
            </button>
          </div>

          {items.length > 0 && (
            <>
              <hr className="my-6 border-t border-gray-100 dark:border-gray-700/60" />
              <div>
                <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-6">Related Jobs</h2>
                <div className="space-y-2 mt-6">
                  {items.map((j) => (
                    <JobsItem key={j.id} job={j} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="hidden xl:block space-y-4">
          <div className="bg-white dark:bg-gray-800 p-5 shadow-sm rounded-xl xl:w-[20rem]">
            <div className="text-center mb-6">
              <div className="inline-flex mb-3 w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-500/20 items-center justify-center text-violet-700 dark:text-violet-200 text-xl font-semibold">
                {(company?.name?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">{company?.name}</div>
              {company?.slug && (
                <Link href={`/jobs/company?slug=${company.slug}`} className="text-sm text-violet-500 hover:text-violet-600">
                  Company profile
                </Link>
              )}
            </div>
            <div className="space-y-2">
              <button className="btn w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">
                Apply Today -&gt;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
