import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { getSupportThread } from '@/lib/services/messages'
import SupportView from './support-view'

export const metadata = {
  title: 'Support - DreamCRM',
  description: 'Message the DreamCRM team',
}

export const dynamic = 'force-dynamic'

/**
 * The clinic's direct line to Dream Create — the third Messages surface
 * (Patients · Mailbox · Support). One thread per practice; everything from
 * the platform side renders as "Support", never a person's name (owner
 * directive 2026-08-26). Platform + patient tenants have no business here:
 * platform staff work the same threads from Client Messaging, patients have
 * their own clinic-messaging portal.
 */
export default async function SupportPage() {
  const user = await requireUser()
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic' || !ctx.organizationId) redirect('/messages')

  // The demo org has no real staff (the context is cookie-synthesized), so
  // there is no live thread to open — show the surface as a preview instead
  // of minting a support thread from Dream Create to itself.
  if (ctx.isDemo) {
    return <SupportView demo messages={[]} currentUserId={user.id} />
  }

  const thread = await getSupportThread(ctx.organizationId, user.id)
  return <SupportView messages={thread.messages} currentUserId={user.id} />
}
