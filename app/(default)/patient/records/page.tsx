export const metadata = {
  title: 'My Records - DreamCRM',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getMyRecords } from '@/lib/services/patient-portal'

const APPT_TYPE_LABELS: Record<string, string> = {
  checkup: 'Checkup',
  cleaning: 'Cleaning',
  filling: 'Filling',
  extraction: 'Extraction',
  root_canal: 'Root Canal',
  consultation: 'Consultation',
  other: 'Visit',
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function PatientRecords() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')
  if (!ctx.patientId) redirect('/')

  const records = await getMyRecords(ctx.patientId, ctx.organizationId)
  if (!records) redirect('/')

  const fullAddress = [
    records.patient.addressLine1,
    [records.patient.city, records.patient.state].filter(Boolean).join(', '),
    records.patient.postalCode,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">My Records</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          What {ctx.organizationName} has on file from your CRM. Treatment notes from your visits live in your dentist&apos;s chart, not here.
        </p>
      </div>

      <div className="space-y-6">
        {/* Personal info */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Personal info</h2>
            <Link
              href="/patient/profile"
              className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Edit →
            </Link>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Name" value={`${records.patient.firstName} ${records.patient.lastName}`} />
            <Field label="Date of birth" value={records.patient.dateOfBirth ?? '—'} />
            <Field label="Email" value={records.patient.email ?? '—'} />
            <Field label="Phone" value={records.patient.phone ?? '—'} />
            {fullAddress && <Field label="Address" value={fullAddress} fullWidth />}
          </dl>
        </section>

        {/* Insurance */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Insurance</h2>
          {records.patient.insuranceProvider ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Provider" value={records.patient.insuranceProvider} />
              {records.patient.insurancePolicyNumber && (
                <Field label="Policy number" value={records.patient.insurancePolicyNumber} />
              )}
              {records.patient.insuranceGroupNumber && (
                <Field label="Group number" value={records.patient.insuranceGroupNumber} />
              )}
            </dl>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No insurance on file. Add it from your profile or share at your next visit.
            </p>
          )}
        </section>

        {/* Forms on file */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Forms on file</h2>
          {records.forms.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No forms submitted yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {records.forms.map((f) => (
                <li
                  key={f.submissionId}
                  className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-700/60 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{f.formTitle}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Submitted {fmtDate(f.submittedAt)}</p>
                  </div>
                  <span className="text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full">
                    ✓ On file
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Visit history */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Visit history</h2>
          {records.visits.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No completed visits yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {records.visits.map((v) => (
                <li
                  key={v.id}
                  className="py-2 border-b border-gray-100 dark:border-gray-700/60 last:border-0"
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {APPT_TYPE_LABELS[v.type] ?? 'Visit'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDateTime(v.startTime)}</p>
                  {v.notes && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 italic">{v.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Field({ label, value, fullWidth = false }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <dt className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-0.5">
        {label}
      </dt>
      <dd className="text-sm text-gray-800 dark:text-gray-100">{value}</dd>
    </div>
  )
}
