export const metadata = {
  title: 'Insurance - DreamCRM',
  description: 'Look up a patient’s insurance benefits before they sit down',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { canUseInsuranceTool, requestFromOnFile } from '@/lib/insurance-eligibility'
import {
  getInsuranceCheckById,
  getInsuranceSetup,
  getLatestInsuranceCheckForPatient,
  listCarrierSuggestions,
  listRecentInsuranceChecks,
} from '@/lib/services/insurance-eligibility'
import { getPatientHeader, listPatientOptions } from '@/lib/services/patients'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import ModuleHint from '@/components/onboarding/module-hint'
import InsuranceTool from './insurance-tool'
import InsuranceIntro from './intro'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function InsurancePage({ searchParams }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  // A clinic feature: the platform tenant (and anything else) goes home.
  if (!canUseInsuranceTool(ctx)) redirect('/')

  const canManage = ctx.role === 'owner' || ctx.role === 'admin'
  const setup = await getInsuranceSetup(ctx.organizationId)
  // THE INTRO: until an owner/admin turns the tool on, the page is the card
  // that says what it is and one button — nothing else loads.
  if (!setup.enabled) {
    return <InsuranceIntro orgName={ctx.organizationName ?? 'Your clinic'} canManage={canManage} driver={setup.driver} npi={setup.npi} />
  }

  const params = await searchParams
  const patientParam = typeof params.patient === 'string' ? params.patient.trim() : ''
  const checkParam = typeof params.check === 'string' ? params.check.trim() : ''

  const [recent, carriers, patientOptions, timeZone, header, latestForPatient, linked] = await Promise.all([
    listRecentInsuranceChecks(ctx.organizationId, 50),
    listCarrierSuggestions(ctx.organizationId),
    listPatientOptions(ctx.organizationId),
    getClinicTimeZone(ctx.organizationId),
    patientParam ? getPatientHeader(ctx.organizationId, patientParam) : Promise.resolve(null),
    patientParam ? getLatestInsuranceCheckForPatient(ctx.organizationId, patientParam) : Promise.resolve(null),
    // A history-drawer deep link: one specific stored check, org-scoped — a
    // foreign or unknown id simply yields nothing and the page opens as usual.
    checkParam ? getInsuranceCheckById(ctx.organizationId, checkParam) : Promise.resolve(null),
  ])
  // The linked check wins over "latest" only when it belongs to the same patient the page is about.
  const latest = linked && (!patientParam || linked.patientId === patientParam) ? linked : latestForPatient

  // A ?patient= that isn't this org's (or was merged away) simply yields no
  // prefill — the tool still works for a fresh lookup.
  const prefill =
    header && !header.mergedIntoPatientId
      ? {
          patientId: header.id,
          patientName: header.fullName,
          // The latest check's input is the richest source — but only while it
          // is still the card on file; a card changed since (PMS, portal,
          // staff) wins, with the remembered detail riding along when it
          // still matches (requestFromOnFile).
          request:
            latest && (!header.insurancePolicyNumber || header.insurancePolicyNumber.trim() === latest.input.memberId.trim())
              ? latest.input
              : requestFromOnFile(header),
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
        driver={setup.driver}
        needsNpi={setup.needsNpi}
        usage={setup.usage}
        canManage={canManage}
        npi={setup.npi}
      />
    </>
  )
}
