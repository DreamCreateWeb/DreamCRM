export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getPatientHeader } from '@/lib/services/patients'
import { getPatientTimeline, countTimeline } from '@/lib/services/patient-timeline'
import { listPatientNotes } from '@/lib/services/patient-notes'
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
  const [header, timeline, notes] = await Promise.all([
    getPatientHeader(ctx.organizationId, id),
    getPatientTimeline(ctx.organizationId, id),
    listPatientNotes(ctx.organizationId, id),
  ])
  if (!header) notFound()

  const counts = countTimeline(timeline)

  return (
    <PatientDetail
      header={header}
      timeline={timeline}
      counts={counts}
      notes={notes}
      isPlatformAdmin={ctx.platformAdmin}
    />
  )
}
