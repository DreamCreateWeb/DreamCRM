export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getSubmissionForReview } from '@/lib/services/forms'
import { getCachedSummary } from '@/lib/services/intake-summary'
import { aiConfigured } from '@/lib/ai'
import type { FormTemplateSchema, FormSubmissionData, FormFieldValue } from '@/lib/types/forms'
import { isFileRefArray, sanitizeFileRefs } from '@/lib/types/forms'
import PreVisitSummary from './previsit-summary'

interface Props {
  params: Promise<{ submissionId: string }>
}

function fmtValue(v: FormFieldValue | undefined): string {
  if (v === undefined || v === null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

/** Render a submission value — image thumbnails for uploads, text otherwise. */
function SubmissionValue({ value }: { value: FormFieldValue | undefined }) {
  if (isFileRefArray(value)) {
    const files = sanitizeFileRefs(value)
    return (
      <div className="flex flex-wrap gap-2">
        {files.map((f) => (
          <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" title={f.side ? `Insurance card — ${f.side}` : f.name || 'Open'}>
            {f.contentType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element -- patient upload on S3
              <img src={f.url} alt={f.name || 'upload'} className="h-24 w-24 rounded-[var(--r-sm)] object-cover ring-1 ring-inset ring-[color:var(--color-hairline-strong)]" />
            ) : (
              <span className="inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-gray-500/10 px-2 py-1 text-xs underline">📎 {f.name || 'File'}</span>
            )}
            {f.side && <span className="mt-0.5 block text-center text-xs uppercase tracking-wide text-gray-400">{f.side}</span>}
          </a>
        ))}
      </div>
    )
  }
  return <span className="whitespace-pre-wrap">{fmtValue(value)}</span>
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
  const cachedSummary = await getCachedSummary(ctx.organizationId, submissionId)
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

      <PreVisitSummary submissionId={submissionId} initial={cachedSummary} aiEnabled={aiConfigured()} />

      <div className="v2-card divide-y divide-[color:var(--color-hairline)]">
        {(schema?.sections ?? []).map((section) => (
          <div key={section.id} className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
              {section.title}
            </h2>
            <dl className="space-y-3">
              {section.fields
                .filter((field) => field.type !== 'content')
                .map((field) => (
                  <div key={field.id} className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                    <dt className="text-sm text-gray-500 dark:text-gray-400">{field.label}</dt>
                    <dd className="text-sm text-gray-800 dark:text-gray-100 sm:col-span-2">
                      <SubmissionValue value={data[field.id]} />
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
