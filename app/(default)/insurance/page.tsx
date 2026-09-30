export const metadata = {
  title: 'Insurance - DreamCRM',
  description: 'Look up a patient’s insurance benefits before they sit down',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { resolveInsuranceDriverId, requestFromOnFile } from '@/lib/insurance-eligibility'
import {
  getLatestInsuranceCheckForPatient,
  listCarrierSuggestions,
  listRecentInsuranceChecks,
} from '@/lib/services/insurance-eligibility'
import { getPatientHeader, listPatientOptions } from '@/lib/services/patients'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import ModuleHint from '@/components/onboarding/module-hint'
import InsuranceTool from './insurance-tool'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function InsurancePage({ searchParams }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/')

  const params = await searchParams
  const patientParam = typeof params.patient === 'string' ? params.patient.trim() : ''

  const [recent, carriers, patientOptions, timeZone, header, latest] = await Promise.all([
    listRecentInsuranceChecks(ctx.organizationId, 20),
    listCarrierSuggestions(ctx.organizationId),
    listPatientOptions(ctx.organizationId),
    getClinicTimeZone(ctx.organizationId),
    patientParam ? getPatientHeader(ctx.organizationId, patientParam) : Promise.resolve(null),
    patientParam ? getLatestInsuranceCheckForPatient(ctx.organizationId, patientParam) : Promise.resolve(null),
  ])

  // A ?patient= that isn't this org's (or was merged away) simply yields no
  // prefill — the tool still works for a fresh lookup.
  const prefill =
    header && !header.mergedIntoPatientId
      ? {
          patientId: header.id,
          patientName: header.fullName,
          // A stored check knows the subscriber; the on-file columns only know
          // the card. Prefer the richer one.
          request: latest?.input ?? requestFromOnFile(header),
        }
      : null

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="insurance" />
      </div>
      <InsuranceTool
        orgName={ctx.organizationName ?? 'Your clinic'}
        recent={recent}
        carriers={carriers}
        patientOptions={patientOptions}
        timeZone={timeZone}
        prefill={prefill}
        initialCheck={prefill ? latest : null}
        driver={resolveInsuranceDriverId()}
      />
    </>
  )
}
