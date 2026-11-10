export const metadata = {
  title: 'Insurance - DreamCRM',
  description: 'Look up a patient’s insurance benefits before they sit down',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { canUseInsuranceTool, recheckRequest } from '@/lib/insurance-eligibility'
import {
  getInsuranceCheckById,
  getInsuranceSetup,
  getLatestInsuranceCheckForPatient,
  listCarrierSuggestions,
  listPatientInsurance,
  listRecentInsuranceChecks,
} from '@/lib/services/insurance-eligibility'
import { getPatientHeader } from '@/lib/services/patients'
import { getPayerNote } from '@/lib/services/insurance-eligibility/payer-notebook'
import { getDiscoveryUsage, getLatestDiscoveryForPatient } from '@/lib/services/insurance-eligibility/discovery'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { formatClinicDate } from '@/lib/format-datetime'
import ModuleHint from '@/components/onboarding/module-hint'
import InsuranceTool from './insurance-tool'
import InsuranceIntro from './intro'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function InsurancePage({ searchParams }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'caller') redirect('/calls')
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
  const discoverParam = params.discover === '1'
  const planParam = params.plan === 'secondary' ? 'secondary' : 'primary'
  // The lead drawer's door: what the visitor typed on the website, as a
  // starting point for the form (the carrier is the payer picker's QUERY).
  const clip = (v: string | string[] | undefined) => (typeof v === 'string' ? v.trim().slice(0, 120) : '')
  const startWith = !patientParam && (clip(params.payer) || clip(params.name)) ? { carrier: clip(params.payer), name: clip(params.name) } : null

  const [recent, carriers, timeZone, header, latestForPatient, linked, discoveryUsage, latestDiscovery, planCards, otherRankLatest] = await Promise.all([
    listRecentInsuranceChecks(ctx.organizationId, 50),
    listCarrierSuggestions(ctx.organizationId),
    getClinicTimeZone(ctx.organizationId),
    patientParam ? getPatientHeader(ctx.organizationId, patientParam) : Promise.resolve(null),
    patientParam ? getLatestInsuranceCheckForPatient(ctx.organizationId, patientParam, planParam) : Promise.resolve(null),
    // A history-drawer deep link: one specific stored check, org-scoped — a
    // foreign or unknown id simply yields nothing and the page opens as usual.
    checkParam ? getInsuranceCheckById(ctx.organizationId, checkParam) : Promise.resolve(null),
    // INSURANCE DISCOVERY: its own allowance under the live driver only (a
    // search is a dearer line than a check), and the patient's last search
    // so a pending one can be picked back up.
    setup.driver === 'stedi' ? getDiscoveryUsage(ctx.organizationId) : Promise.resolve(null),
    patientParam ? getLatestDiscoveryForPatient(ctx.organizationId, patientParam).catch(() => null) : Promise.resolve(null),
    patientParam ? listPatientInsurance(ctx.organizationId, patientParam).catch(() => []) : Promise.resolve([]),
    // The OTHER plan's latest check, so the printable sheet can say when each plan was last verified.
    patientParam ? getLatestInsuranceCheckForPatient(ctx.organizationId, patientParam, planParam === 'secondary' ? 'primary' : 'secondary').catch(() => null) : Promise.resolve(null),
  ])
  const secondaryCard = planCards.find((c) => c.rank === 'secondary') ?? null
  // ?plan=secondary on a record without one falls back to the primary (never an empty "secondary" form).
  const rank = planParam === 'secondary' && secondaryCard ? 'secondary' : 'primary'
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
          // still matches. ONE rule, shared with the record's rail card
          // (`recheckRequest`), so the two can never disagree again.
          request: recheckRequest(
            rank === 'secondary' && secondaryCard
              ? {
                  firstName: header.firstName,
                  lastName: header.lastName,
                  dateOfBirth: header.dateOfBirth,
                  insuranceProvider: secondaryCard.provider,
                  insurancePolicyNumber: secondaryCard.policyNumber,
                  insuranceGroupNumber: secondaryCard.groupNumber,
                  insuranceDetail: secondaryCard.detail,
                }
              : header,
            latest,
          ).request,
          rank: rank as 'primary' | 'secondary',
          hasSecondary: !!secondaryCard,
          sheetPlans: secondaryCard
            ? (() => {
                const verifiedLine = (c: typeof latestForPatient) =>
                  c && c.status === 'active' ? `Verified ${formatClinicDate(new Date(c.checkedAtIso), timeZone)}` : null
                const primaryCard = planCards.find((c) => c.rank === 'primary') ?? null
                const primaryCheck = rank === 'primary' ? latestForPatient : otherRankLatest
                const secondaryCheck = rank === 'secondary' ? latestForPatient : otherRankLatest
                const slot = (c: { provider: string | null; policyNumber: string | null; groupNumber: string | null } | null, chk: typeof latestForPatient) =>
                  c ? { carrier: c.provider, memberId: c.policyNumber, groupNumber: c.groupNumber, verified: verifiedLine(chk) } : null
                return { primary: slot(primaryCard, primaryCheck), secondary: slot(secondaryCard, secondaryCheck) }
              })()
            : null,
          state: header.state,
          postalCode: header.postalCode,
        }
      : null

  // THE PAYER NOTEBOOK (2026-10-08): the practice's own facts about the
  // opening check's payer, so the sheet is complete on first paint.
  const initialCheck = prefill ? latest : null
  const initialPayerNote = initialCheck
    ? await getPayerNote(ctx.organizationId, initialCheck.input.payerId ?? null, initialCheck.result?.payerName ?? initialCheck.input.payerName ?? initialCheck.input.carrierName).catch(() => null)
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
        startWith={startWith}
        timeZone={timeZone}
        prefill={prefill}
        initialCheck={initialCheck}
        initialPayerNote={initialPayerNote}
        driver={setup.driver}
        needsNpi={setup.needsNpi}
        usage={setup.usage}
        canManage={canManage}
        npi={setup.npi}
        discoveryUsage={discoveryUsage}
        latestDiscovery={prefill ? latestDiscovery : null}
        discoverOpen={discoverParam}
      />
    </>
  )
}
