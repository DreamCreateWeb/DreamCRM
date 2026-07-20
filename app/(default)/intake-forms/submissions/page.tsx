export const metadata = { title: 'Intake Submissions — DreamCRM' }
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listRecentSubmissions } from '@/lib/services/forms'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Cross-template submissions index — the destination the intake list's
 * "Completed · 8 weeks" heartbeat drills into (v3: every number links to
 * the view that explains it). Most recent 50 across every template: who
 * (patient link when the fill is matched), which form, and when — clinic
 * wall-clock (this is a server component on a UTC server).
 */
export default async function RecentSubmissionsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const [submissions, timeZone] = await Promise.all([
    listRecentSubmissions(ctx.organizationId),
    getClinicTimeZone(ctx.organizationId),
  ])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-4xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/intake-forms" className="hover:underline underline-offset-4">
            ‹ Intake forms
          </Link>
        }
        title="Recent submissions"
        subtitle="The latest completed forms across every template, most recent first."
      />

      {submissions.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No submissions yet"
          body="When a patient completes any of your intake forms, it lands here — newest first."
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {submissions.map((s) => (
              <li
                key={s.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3"
              >
                <div className="min-w-0 flex items-baseline gap-2">
                  {s.patientId && s.patientName ? (
                    <Link
                      href={`/patients/${s.patientId}`}
                      className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-teal-700 dark:hover:text-teal-300 truncate"
                    >
                      {s.patientName}
                    </Link>
                  ) : (
                    <span
                      className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate"
                      title="Not linked to a patient record"
                    >
                      {s.submitterName ?? s.submitterEmail ?? 'Anonymous'}
                    </span>
                  )}
                  <Link
                    href={`/intake-forms/${s.templateId}`}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-300 truncate"
                  >
                    {s.templateTitle}
                  </Link>
                </div>
                <Link
                  href={`/intake-forms/submissions/${s.id}`}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-300 tabular-nums font-mono-num shrink-0"
                  title="View this submission"
                >
                  {formatClinicDayTime(new Date(s.submittedAt), timeZone)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
