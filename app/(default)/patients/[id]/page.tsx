export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getPatientHeader, listPatientOptions, getFamilyForPatient } from '@/lib/services/patients'
import { getPatientTimeline, countTimeline } from '@/lib/services/patient-timeline'
import { listPatientNotes } from '@/lib/services/patient-notes'
import { getTagsForPatient, listPatientTags } from '@/lib/services/patient-tags'
import { listPatientDocuments } from '@/lib/services/patient-documents'
import { listFollowupsForPatient, listAssignableStaff } from '@/lib/services/patient-followups'
import { findMergeCandidates } from '@/lib/services/patient-merge'
import { getReferralContext } from '@/lib/services/patient-referrals'
import { getLoyaltySettings, getPointsBalance, listLoyaltyEvents } from '@/lib/services/loyalty'
import { listFormTemplates } from '@/lib/services/forms'
import { getLatestInsuranceCheckForPatient, listInsuranceChecksForPatient } from '@/lib/services/insurance-eligibility'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { canUseInsuranceTool, requestFromOnFile, resolveInsuranceDriverId } from '@/lib/insurance-eligibility'
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
  if (ctx.tenantType === 'platform') redirect('/ecommerce/customers')

  const { id } = await params
  const [header, timeline, notes, forms, patientOptions, tags, tagCatalog, documents, followups, staff, family, referral, latestInsuranceCheck, timeZone, insuranceHistory] =
    await Promise.all([
      getPatientHeader(ctx.organizationId, id),
      getPatientTimeline(ctx.organizationId, id),
      listPatientNotes(ctx.organizationId, id),
      listFormTemplates(ctx.organizationId),
      listPatientOptions(ctx.organizationId),
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
    ])
  if (!header) notFound()
  // A merged tombstone isn't a real record anymore — send old links to the survivor.
  if (header.mergedIntoPatientId) redirect(`/patients/${header.mergedIntoPatientId}`)

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
  // would send when no check exists yet (the on-file card as self-subscriber).
  // PREVIEW: null hides the rail card AND the needs-attention nudge for
  // everyone but platform admins.
  const onFileRequest = requestFromOnFile(header)
  const insurance = canUseInsuranceTool(ctx)
    ? {
        latest: latestInsuranceCheck,
        history: insuranceHistory,
        hasOnFile: !!header.insuranceProvider,
        onFileRequest,
        // A clearinghouse driver needs the exact payer, and a carrier NAME on
        // file is not one — without a remembered payer id (or a stored check
        // that carries one) a Check-now here would only be refused, so the
        // card offers the picker instead.
        needsPayerPick:
          resolveInsuranceDriverId() !== 'sandbox' &&
          !!header.insuranceProvider &&
          !onFileRequest.payerId &&
          !latestInsuranceCheck?.input.payerId,
      }
    : null

  const counts = countTimeline(timeline)
  const intakeForms = forms.map((f) => ({ id: f.id, title: f.title }))

  return (
    <PatientDetail
      header={header}
      timeline={timeline}
      counts={counts}
      notes={notes}
      intakeForms={intakeForms}
      isPlatformAdmin={ctx.platformAdmin}
      patientOptions={patientOptions}
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
    />
  )
}
