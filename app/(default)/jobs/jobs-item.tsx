import Link from 'next/link'
import Image from 'next/image'
import { relativeTime } from '@/lib/utils'

export interface JobListItem {
  id: number
  title: string
  slug: string
  details: string
  date: string | Date
  type: string
  remote: boolean
  companyName: string | null
  companyLogo: string | null
  isNew: boolean
}

export default function JobsItem({ job }: { job: JobListItem }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4">
      <div className="md:flex justify-between items-center space-y-4 md:space-y-0 space-x-2">
        <div className="flex items-start space-x-3 md:space-x-4">
          <div className="w-9 h-9 shrink-0 mt-1 rounded-full overflow-hidden bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
            {job.companyLogo ? (
              <Image
                className="w-9 h-9 rounded-full"
                src={job.companyLogo}
                width={36}
                height={36}
                alt={job.companyName ?? 'Company'}
                unoptimized
              />
            ) : (
              <span className="text-sm font-semibold text-violet-700 dark:text-violet-200">
                {(job.companyName?.[0] ?? '?').toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <Link className="inline-flex font-semibold text-gray-800 dark:text-gray-100" href={`/jobs/post?slug=${job.slug}`}>
              {job.title}
            </Link>
            <div className="text-sm">
              {job.companyName ?? 'Unknown company'} · {job.details}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-4 pl-10 md:pl-0">
          <div className="text-sm text-gray-500 dark:text-gray-400 italic whitespace-nowrap">{relativeTime(job.date)}</div>
          <div
            className={`text-xs inline-flex font-medium rounded-full text-center px-2.5 py-1 ${
              job.isNew ? 'bg-green-500/20 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
            }`}
          >
            {job.isNew ? 'New' : job.type}
          </div>
        </div>
      </div>
    </div>
  )
}
