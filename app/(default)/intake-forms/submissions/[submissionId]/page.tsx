export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getSubmissionForReview } from '@/lib/services/forms'
import type { FormTemplateSchema, FormSubmissionData, FormFieldValue } from '@/lib/types/forms'

interface Props {
  params: Promise<{ submissionId: string }>
}

function fmtValue(v: FormFieldValue | undefined): string {
  if (v === undefined || v === null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

/**
 * Read-only viewer for a single intake submission — the answers a patient
 * actually filled in. Previously there was NO way for staff to read submission
 * content (every "View" link dead-ended at the template list); the service
 * function existed but no route consumed it.
 */
export default async function SubmissionPage({ params }: Props) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  const { submissionId } = await params
  const result = await getSubmissionForReview(ctx.organizationId, submissionId)
  if (!result) notFound()

  const { submission, template, patientId, patientName } = result
  const schema = template.schema as FormTemplateSchema
  const data = (submission.data ?? {}) as FormSubmissionData
  const submittedAt = new Date(submission.submittedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/intake-forms/${template.id}`}
          className="text-sm text-teal-700 dark:text-teal-300 hover:underline"
        >
          ← Back to {template.title}
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mt-2">{template.title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Submitted by{' '}
          {patientName ? (
            <Link
              href={`/patients/${patientId}`}
              className="font-medium text-teal-700 dark:text-teal-300 hover:underline"
            >
              {patientName}
            </Link>
          ) : (
            submission.submitterName ?? 'a visitor'
          )}
          {submission.submitterEmail ? ` · ${submission.submitterEmail}` : ''} · {submittedAt}
        </p>
        {!patientId && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
            Not linked to a patient record (no matching email on file).
          </p>
        )}
      </div>

      <div className="v2-card divide-y divide-[color:var(--color-hairline)]">
        {(schema?.sections ?? []).map((section) => (
          <div key={section.id} className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
              {section.title}
            </h2>
            <dl className="space-y-3">
              {section.fields.map((field) => (
                <div key={field.id} className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                  <dt className="text-sm text-gray-500 dark:text-gray-400">{field.label}</dt>
                  <dd className="text-sm text-gray-800 dark:text-gray-100 sm:col-span-2 whitespace-pre-wrap">
                    {fmtValue(data[field.id])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}
