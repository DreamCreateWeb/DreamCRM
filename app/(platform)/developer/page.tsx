export const metadata = {
  title: 'Developer – Demo Mode',
}

import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { listClinics } from '@/features/clinics-list/queries'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { eq } from 'drizzle-orm'
import { SimulateClinicButton, SimulatePatientButton, ExitDemoButton } from './demo-buttons'

export default async function DeveloperPage() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')
  if (!ctx.platformAdmin) redirect('/dashboard')

  const clinics = await listClinics()

  const clinicPatients: Record<string, { id: string; firstName: string; lastName: string }[]> = {}
  for (const clinic of clinics) {
    const rows = await db
      .select({ id: patient.id, firstName: patient.firstName, lastName: patient.lastName })
      .from(patient)
      .where(eq(patient.organizationId, clinic.id))
      .limit(10)
    clinicPatients[clinic.id] = rows
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Developer Mode</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Simulate any clinic or patient without switching accounts. All changes are real.
          </p>
        </div>
        {ctx.isDemo && <ExitDemoButton />}
      </div>

      {ctx.isDemo && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 rounded-xl text-sm text-amber-800 dark:text-amber-300">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <span>
            Currently simulating <strong>{ctx.organizationName}</strong> as <strong>{ctx.role}</strong>
            {ctx.patientId ? ' (patient view)' : ''}.
          </span>
        </div>
      )}

      <div className="space-y-4">
        {clinics.length === 0 && (
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-12 text-center text-sm text-gray-400">
            No clinics yet. Once clinics sign up they will appear here.
          </div>
        )}

        {clinics.map(clinic => (
          <div key={clinic.id} className="bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden">

            {/* Clinic header row */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-gray-800 dark:text-gray-100">{clinic.name}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  /{clinic.slug} · {clinic.planTier ?? 'basic'} · {clinic.memberCount} member{clinic.memberCount !== 1 ? 's' : ''}
                </div>
              </div>
              <SimulateClinicButton orgId={clinic.id} />
            </div>

            {/* Patient chips */}
            <div className="px-5 py-3">
              {clinicPatients[clinic.id].length > 0 ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                    Patients ({clinicPatients[clinic.id].length}{clinicPatients[clinic.id].length === 10 ? '+' : ''})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {clinicPatients[clinic.id].map(p => (
                      <SimulatePatientButton
                        key={p.id}
                        orgId={clinic.id}
                        patientId={p.id}
                        name={`${p.firstName} ${p.lastName}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">No patients added yet.</p>
              )}
            </div>

          </div>
        ))}
      </div>

    </div>
  )
}
