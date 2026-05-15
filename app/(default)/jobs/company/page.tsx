import Link from 'next/link'
import { notFound } from 'next/navigation'
import JobsItem, { type JobListItem } from '../jobs-item'
import { getCompany, listCompanyJobs } from '@/lib/services/jobs'
import { requireUser } from '@/lib/session'

export const metadata = {
  title: 'Company - DreamCRM',
  description: 'Company profile and openings',
}

export const dynamic = 'force-dynamic'

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  await requireUser()
  const { slug } = await searchParams
  if (!slug) notFound()
  const company = await getCompany(slug)
  if (!company) notFound()
  const jobs = await listCompanyJobs(company.id)

  const items: JobListItem[] = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    slug: j.slug,
    details: [j.type, j.remote ? 'Remote' : null, j.location || 'Anywhere'].filter(Boolean).join(' / '),
    date: j.createdAt,
    type: j.type,
    remote: j.remote,
    companyName: company.name,
    companyLogo: company.logoUrl ?? null,
    isNew: Date.now() - new Date(j.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000,
  }))

  return (
    <>
      <div className="h-48 bg-gradient-to-r from-violet-500/30 via-sky-500/30 to-emerald-500/30 dark:from-violet-700/40 dark:via-sky-700/40 dark:to-emerald-700/40" />
      <header className="text-center bg-white/30 dark:bg-gray-800/30 pb-6 border-b border-gray-200 dark:border-gray-700/60">
        <div className="px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-3xl mx-auto">
            <div className="-mt-12 mb-2">
              <div className="inline-flex w-26 h-26">
                <div className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-900 bg-violet-200 dark:bg-violet-500/30 flex items-center justify-center text-3xl font-bold text-violet-800 dark:text-violet-200">
                  {company.name[0].toUpperCase()}
                </div>
              </div>
            </div>
            <div className="mb-4">
              <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-2">{company.name}</h2>
              <p>{company.description ?? 'No description.'}</p>
            </div>
            <div className="inline-flex flex-wrap justify-center sm:justify-start space-x-4">
              {company.location && (
                <div className="flex items-center">
                  <span className="text-sm font-medium whitespace-nowrap text-gray-500 dark:text-gray-400">{company.location}</span>
                </div>
              )}
              {company.website && (
                <div className="flex items-center">
                  <Link href={company.website} className="text-sm font-medium whitespace-nowrap text-violet-500 hover:text-violet-600">
                    {company.website.replace(/^https?:\/\//, '')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-6">
            Open Positions at {company.name}{' '}
            <span className="text-gray-400 dark:text-gray-500 font-medium">{items.length}</span>
          </h3>
          {items.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No openings right now.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((j) => (
                <JobsItem key={j.id} job={j} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
