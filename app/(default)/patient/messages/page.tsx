export const metadata = {
  title: 'Messages - DreamCRM',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getMyThread, getMyClinicHeader } from '@/lib/services/patient-portal'
import PatientMessagesView from './messages-view'

export default async function PatientMessages() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')
  if (!ctx.patientId) redirect('/')

  const [thread, clinic] = await Promise.all([
    getMyThread(ctx.organizationId, ctx.patientId),
    getMyClinicHeader(ctx.organizationId),
  ])

  // Serialize Date → string for the client component (server actions return
  // Dates fine, but passing them into a client component as props can hydrate
  // mismatched — render them as ISO strings and parse on the client.
  const serialized = thread.messages.map((m) => ({
    id: m.id,
    source: m.source,
    channel: m.channel,
    direction: m.direction,
    body: m.body,
    subject: m.subject ?? null,
    fromName: m.fromName ?? null,
    sentByUserName: m.sentByUserName ?? null,
    sentAtIso: m.sentAt.toISOString(),
  }))

  return (
    <PatientMessagesView
      clinicName={clinic?.displayName ?? ctx.organizationName}
      brandColor={clinic?.brandColor ?? null}
      messages={serialized}
    />
  )
}
