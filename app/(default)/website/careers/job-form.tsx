import Link from 'next/link'
import { ROLE_LABELS, EMPLOYMENT_LABELS, type JobPostingRow } from '@/lib/types/careers'
import { createJobAction, updateJobAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'

const FIELD = 'w-full text-sm px-3 py-2 rounded-[var(--r-sm)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
const LABEL = 'block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1'

export default function JobForm({ job }: { job?: JobPostingRow }) {
  const editing = !!job

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <div className="mb-5">
        <Link href="/website/careers" className="text-xs text-gray-500 dark:text-gray-400 hover:underline">
          ← Back to Careers
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mt-1">
          {editing ? 'Edit role' : 'New role'}
        </h1>
      </div>

      <form action={editing ? updateJobAction : createJobAction} className="space-y-5">
        {editing && <input type="hidden" name="id" value={job.id} />}

        <div>
          <label htmlFor="job-form-title" className={LABEL}>Title *</label>
          <input id="job-form-title" name="title" required defaultValue={job?.title} placeholder="Dental Hygienist" className={FIELD} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="job-form-role" className={LABEL}>Role</label>
            <select id="job-form-role" name="role" defaultValue={job?.role ?? 'hygienist'} className={FIELD}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="job-form-employment-type" className={LABEL}>Employment type</label>
            <select id="job-form-employment-type" name="employmentType" defaultValue={job?.employmentType ?? 'full_time'} className={FIELD}>
              {Object.entries(EMPLOYMENT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="job-form-description" className={LABEL}>Description *</label>
          <textarea id="job-form-description" name="description" required rows={5} defaultValue={job?.description} placeholder="What the role is, who you're looking for, what makes your practice a great place to work…" className={`${FIELD} resize-y`} />
        </div>
        <div>
          <label htmlFor="job-form-responsibilities" className={LABEL}>Responsibilities</label>
          <textarea id="job-form-responsibilities" name="responsibilities" rows={3} defaultValue={job?.responsibilities ?? ''} className={`${FIELD} resize-y`} />
        </div>
        <div>
          <label htmlFor="job-form-requirements" className={LABEL}>Requirements</label>
          <textarea id="job-form-requirements" name="requirements" rows={3} defaultValue={job?.requirements ?? ''} placeholder="License, experience, certifications…" className={`${FIELD} resize-y`} />
        </div>
        <div>
          <label htmlFor="job-form-benefits" className={LABEL}>Benefits / perks</label>
          <textarea id="job-form-benefits" name="benefits" rows={2} defaultValue={job?.benefits ?? ''} placeholder="Health, PTO, CE allowance, 4-day week…" className={`${FIELD} resize-y`} />
        </div>

        {/* Compensation */}
        <div className="v2-card p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="job-form-comp-min" className={LABEL}>Pay min ($)</label>
              <input id="job-form-comp-min" name="compMin" type="number" step="0.01" defaultValue={job?.compMinCents != null ? job.compMinCents / 100 : ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="job-form-comp-max" className={LABEL}>Pay max ($)</label>
              <input id="job-form-comp-max" name="compMax" type="number" step="0.01" defaultValue={job?.compMaxCents != null ? job.compMaxCents / 100 : ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="job-form-comp-period" className={LABEL}>Per</label>
              <select id="job-form-comp-period" name="compPeriod" defaultValue={job?.compPeriod ?? 'hour'} className={FIELD}>
                <option value="hour">Hour</option>
                <option value="year">Year</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" name="showComp" defaultChecked={job ? job.showComp : true} className="rounded" />
            Show pay range on the public listing (recommended — listings with pay get more applicants)
          </label>
        </div>

        {/* Apply method */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="job-form-apply-method" className={LABEL}>Applications</label>
            <select id="job-form-apply-method" name="applyMethod" defaultValue={job?.applyMethod ?? 'in_app'} className={FIELD}>
              <option value="in_app">Apply on our site (tracked here)</option>
              <option value="external">Send to an external link</option>
            </select>
          </div>
          <div>
            <label htmlFor="job-form-external-apply-url" className={LABEL}>External apply URL (if external)</label>
            <input id="job-form-external-apply-url" name="externalApplyUrl" type="url" defaultValue={job?.externalApplyUrl ?? ''} placeholder="https://…" className={FIELD} />
          </div>
        </div>

        <div>
          <label htmlFor="job-form-status" className={LABEL}>Status</label>
          <select id="job-form-status" name="status" defaultValue={job?.status ?? 'draft'} className={FIELD}>
            <option value="draft">Draft (not public)</option>
            <option value="open">Open (live and searchable)</option>
            <option value="closed">Closed</option>
            <option value="filled">Filled</option>
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <ActionButton type="submit" variant="primary">
            {editing ? 'Save changes' : 'Create role'}
          </ActionButton>
          <Link href="/website/careers" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
