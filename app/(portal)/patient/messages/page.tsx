export const metadata = {
  title: 'Messages — Patient portal',
}

export const dynamic = 'force-dynamic'

import { getMyThread } from '@/lib/services/patient-portal'
import { markOutboundMessagesReadByPatient } from '@/lib/services/patient-messaging'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import PortalMessagesView from './messages-view'

export default async function PortalMessagesPage() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'messages')
  const { ctx, clinic, brand } = pc

  const thread = await getMyThread(ctx.organizationId, ctx.patientId)
  // Opening the conversation marks the clinic's in-app messages read — powers
  // the staff-side "Read" receipt. Best-effort; never blocks the render.
  await markOutboundMessagesReadByPatient(ctx.organizationId, ctx.patientId)

  // Serialize Date → ISO string for the client component.
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
    attachments: m.attachments ?? [],
  }))

  return (
    <PortalMessagesView
      clinicName={clinic?.displayName ?? ctx.organizationName}
      clinicPhone={clinic?.phone ?? null}
      brand={brand}
      messages={serialized}
    />
  )
}
