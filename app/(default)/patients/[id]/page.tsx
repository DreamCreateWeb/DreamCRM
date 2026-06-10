export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getPatientHeader, listPatientOptions } from '@/lib/services/patients'
import { getPatientTimeline, countTimeline } from '@/lib/services/patient-timeline'
import { listPatientNotes } from '@/lib/services/patient-notes'
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
  const [header, timeline, notes, forms, patientOptions] = await Promise.all([
    getPatientHeader(ctx.organizationId, id),
    getPatientTimeline(ctx.organizationId, id),
    listPatientNotes(ctx.organizationId, id),
    listFormTemplates(ctx.organizationId),
    listPatientOptions(ctx.organizationId),
  ])
  if (!header) notFound()

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
    />
  )
}
