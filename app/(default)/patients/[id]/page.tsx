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
import { listFormTemplates } from '@/lib/services/forms'
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
  const [header, timeline, notes, forms, patientOptions, tags, tagCatalog, documents, followups, staff, family] =
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
    ])
  if (!header) notFound()
  // A merged tombstone isn't a real record anymore — send old links to the survivor.
  if (header.mergedIntoPatientId) redirect(`/patients/${header.mergedIntoPatientId}`)

  const canMerge = ctx.role === 'owner' || ctx.role === 'admin'
  const mergeCandidates = canMerge ? await findMergeCandidates(ctx.organizationId, id) : []

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
    />
  )
}
