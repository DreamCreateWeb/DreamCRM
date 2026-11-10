export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getFeatureSwitchState } from '@/lib/services/feature-switches'
import { requireTenant } from '@/lib/auth/context'
import { getPatientHeader, getPatientOption, getFamilyForPatient } from '@/lib/services/patients'
import { getPatientTimeline, countTimeline } from '@/lib/services/patient-timeline'
import { listPatientNotes } from '@/lib/services/patient-notes'
import { getTagsForPatient, listPatientTags } from '@/lib/services/patient-tags'
import { listPatientDocuments } from '@/lib/services/patient-documents'
import { listFollowupsForPatient, listAssignableStaff } from '@/lib/services/patient-followups'
import { findMergeCandidates } from '@/lib/services/patient-merge'
import { getReferralContext } from '@/lib/services/patient-referrals'
import { getLoyaltySettings, getPointsBalance, listLoyaltyEvents } from '@/lib/services/loyalty'
import { listFormTemplates } from '@/lib/services/forms'
import { getInsuranceSetup, getLatestInsuranceCheckForPatient, listInsuranceChecksForPatient, listPatientInsurance } from '@/lib/services/insurance-eligibility'
import { getLatestDiscoveryForPatient } from '@/lib/services/insurance-eligibility/discovery'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { getClinicCadence } from '@/lib/services/clinic-cadence'
import { LAPSED_DEFAULT_MONTHS } from '@/lib/dates'
import { canUseInsuranceTool, recheckRequest } from '@/lib/insurance-eligibility'
import { getPatientConsent } from '@/lib/services/patient-consent'
import { listPatientAccess, recordPatientAccess, whoLookedLine } from '@/lib/services/patient-access-log'
import PatientDetail from './patient-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return { title: `Patient · DreamCRM`, description: `Patient relationship view (${id})` }
}

export default async function PatientDetailPage({ params }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'caller') redirect('/calls')
  if (ctx.tenantType === 'platform') redirect('/ecommerce/customers')

  const { id } = await params
  const [header, timeline, notes, forms, tags, tagCatalog, documents, followups, staff, family, referral, latestInsuranceCheck, timeZone, insuranceHistory, insuranceSetup, latestDiscovery, planCards, latestSecondaryCheck] =
    await Promise.all([
      getPatientHeader(ctx.organizationId, id),
      getPatientTimeline(ctx.organizationId, id),
      listPatientNotes(ctx.organizationId, id),
      listFormTemplates(ctx.organizationId),
      getTagsForPatient(ctx.organizationId, id),
      listPatientTags(ctx.organizationId),
      listPatientDocuments(ctx.organizationId, id),
      listFollowupsForPatient(ctx.organizationId, id),
      listAssignableStaff(ctx.organizationId),
      getFamilyForPatient(ctx.organizationId, id),
      getReferralContext(ctx.organizationId, id),
      getLatestInsuranceCheckForPatient(ctx.organizationId, id),
      getClinicTimeZone(ctx.organizationId),
      listInsuranceChecksForPatient(ctx.organizationId, id, 10),
      canUseInsuranceTool(ctx) ? getInsuranceSetup(ctx.organizationId) : Promise.resolve(null),
      canUseInsuranceTool(ctx) ? getLatestDiscoveryForPatient(ctx.organizationId, id).catch(() => null) : Promise.resolve(null),
      canUseInsuranceTool(ctx) ? listPatientInsurance(ctx.organizationId, id).catch(() => []) : Promise.resolve([]),
      canUseInsuranceTool(ctx) ? getLatestInsuranceCheckForPatient(ctx.organizationId, id, 'secondary').catch(() => null) : Promise.resolve(null),
    ])
  if (!header) notFound()
  // A merged tombstone isn't a real record anymore — send old links to the survivor.
  if (header.mergedIntoPatientId) redirect(`/patients/${header.mergedIntoPatientId}`)

  const guardian = header.guardianPatientId ? await getPatientOption(ctx.organizationId, header.guardianPatientId).catch(() => null) : null
  const canMerge = ctx.role === 'owner' || ctx.role === 'admin'
  const mergeCandidates = canMerge ? await findMergeCandidates(ctx.organizationId, id) : []

  // Rewards rail card — only loaded (and rendered) when the program is on.
  const loyaltySettings = await getLoyaltySettings(ctx.organizationId)
  const loyalty = loyaltySettings.enabled
    ? {
        balance: await getPointsBalance(ctx.organizationId, id),
        events: (await listLoyaltyEvents(ctx.organizationId, id, 6)).map((e) => ({
          id: e.id,
          kind: e.kind,
          points: e.points,
          note: e.note,
          createdAtIso: e.createdAt.toISOString(),
        })),
      }
    : null

  // Insurance-check rail card: the latest stored verdict + what a re-check
  // would send — the SAME rule the tool page uses (`recheckRequest`): the
  // stored check's input while its member id is still the card on file, the
  // on-file card the moment staff change the policy number. The card used
  // to send `latest.input` unconditionally, so correcting a typo and pressing
  // "Check again" billed a live check against the OLD number.
  // null hides the rail card AND the needs-attention nudge outside a clinic
  // tenant (the tool is a clinic feature) and until the clinic turns the
  // tool on from /insurance (the intro card).
  const recheck = recheckRequest(header, latestInsuranceCheck)
  const onFileRequest = recheck.request
  const secondaryCard = planCards.find((c) => c.rank === 'secondary') ?? null
  const secondaryRecheck = secondaryCard
    ? recheckRequest(
        {
          firstName: header.firstName,
          lastName: header.lastName,
          dateOfBirth: header.dateOfBirth,
          insuranceProvider: secondaryCard.provider,
          insurancePolicyNumber: secondaryCard.policyNumber,
          insuranceGroupNumber: secondaryCard.groupNumber,
          insuranceDetail: secondaryCard.detail,
        },
        latestSecondaryCheck,
      )
    : null
  const insurance = insuranceSetup?.enabled
    ? {
        latest: latestInsuranceCheck,
        history: insuranceHistory,
        hasOnFile: !!header.insuranceProvider,
        onFileRequest,
        cardChanged: recheck.cardChanged,
        // A clearinghouse driver needs the exact payer, and a carrier NAME on
        // file is not one — without a remembered payer id (or a stored check
        // that carries one) a Check-now here would only be refused, so the
        // card offers the picker instead.
        needsPayerPick:
          insuranceSetup.driver !== 'sandbox' &&
          !!header.insuranceProvider &&
          !onFileRequest.payerId &&
          !latestInsuranceCheck?.input.payerId,
        // Under the live driver with no practice NPI a check would only be
        // refused — the card sends them to the one box that fixes it.
        needsNpi: insuranceSetup.needsNpi,
        // The no-card door: test mode can't search (Stedi refuses it), so the
        // card doesn't offer what the tool would only refuse.
        canDiscover: insuranceSetup.driver !== 'stedi_test',
        secondary: {
          card: secondaryCard ? { provider: secondaryCard.provider, policyNumber: secondaryCard.policyNumber, groupNumber: secondaryCard.groupNumber } : null,
          latest: latestSecondaryCheck,
          onFileRequest: secondaryRecheck?.request ?? null,
          cardChanged: secondaryRecheck?.cardChanged ?? false,
          needsPayerPick:
            insuranceSetup.driver !== 'sandbox' &&
            !!secondaryCard?.provider &&
            !secondaryRecheck?.request.payerId &&
            !latestSecondaryCheck?.input.payerId,
          needsNpi: insuranceSetup.needsNpi,
        },
        discovery: latestDiscovery ? { status: latestDiscovery.status, coveragesFound: latestDiscovery.coveragesFound, createdAtIso: latestDiscovery.createdAtIso } : null,
      }
    : null

  // The chart access log: this load is one "view" (platform admins in demo
  // mode included, under their own user id). Best-effort — never fails the page.
  await recordPatientAccess(ctx.organizationId, ctx.userId, 'view', id)
  const consent = await getPatientConsent(ctx.organizationId, id).catch(() => null)
  // "Opened by Dana today, Priya yesterday" — owner/admin only.
  const whoLooked = canMerge
    ? whoLookedLine(await listPatientAccess(ctx.organizationId, id, 30), timeZone)
    : ''

  const counts = countTimeline(timeline)
  // The Intake Forms door (law 1): closed = no 'Send intake' anywhere on the record (the send would be refused).
  const intakeOpen = await getFeatureSwitchState(ctx.organizationId).then((s) => s.intake_forms).catch(() => true)
  const intakeForms = intakeOpen ? forms.map((f) => ({ id: f.id, title: f.title })) : []
  // The clinic's 💤 threshold — the record's lapsed nudge and legend say the
  // number the flag actually fires at (Settings → Practice), never a fixed one.
  const cadence = await getClinicCadence(ctx.organizationId).catch(() => ({ recallMonths: null, lapsedMonths: null }))
  const lapsedMonths = cadence.lapsedMonths && cadence.lapsedMonths > 0 ? cadence.lapsedMonths : LAPSED_DEFAULT_MONTHS

  return (
    <PatientDetail
      header={header}
      timeline={timeline}
      counts={counts}
      notes={notes}
      intakeForms={intakeForms}
      isPlatformAdmin={ctx.platformAdmin}
      guardian={guardian}
      tags={tags}
      tagCatalog={tagCatalog}
      documents={documents}
      followups={followups}
      staff={staff}
      canMerge={canMerge}
      mergeCandidates={mergeCandidates}
      family={family}
      referral={referral}
      loyalty={loyalty}
      canAdjustLoyalty={canMerge}
      insurance={insurance}
      timeZone={timeZone}
      lapsedMonths={lapsedMonths}
      consent={consent}
      whoLooked={whoLooked}
    />
  )
}
