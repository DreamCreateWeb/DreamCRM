export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getFormTemplate, listSubmissionsForTemplate } from '@/lib/services/forms'
import FormBuilder from './form-builder'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditFormPage({ params }: Props) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  const { id } = await params
  const template = await getFormTemplate(ctx.organizationId, id)
  if (!template) notFound()
  const submissions = await listSubmissionsForTemplate(ctx.organizationId, id)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <FormBuilder template={template} />

      <div className="mt-10 max-w-4xl">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
          Submissions <span className="text-gray-500 dark:text-gray-400 font-normal tabular-nums font-mono-num">({submissions.length})</span>
        </h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No submissions yet. Send this form to a patient from their detail page or the appointment drawer.
          </p>
        ) : (
          <ul className="v2-card divide-y divide-[color:var(--color-hairline)] overflow-hidden">
            {submissions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/intake-forms/submissions/${s.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                >
                  <span className="text-sm text-gray-800 dark:text-gray-100">
                    {s.submitterName ?? s.submitterEmail ?? 'Anonymous'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
                    {new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
