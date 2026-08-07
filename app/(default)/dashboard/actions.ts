'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { approveProposal, declineProposal } from '@/lib/services/proposals'
import { setCapabilityTrust } from '@/lib/services/autonomy'
import { getCapability } from '@/lib/autonomy'

/**
 * Approval Inbox actions (Transformation Phase 2). Any clinic staff role may
 * decide — approving a proposal is exactly the front desk's job; the inbox
 * exists so the machine never acts beyond trust without a human yes.
 */

function ensureClinicStaff(ctx: { tenantType: string; role: string }): string | null {
  if (ctx.tenantType !== 'clinic') return 'Only clinic teams have an approval inbox.'
  if (ctx.role === 'patient') return 'Patients can’t approve clinic work.'
  return null
}

export async function approveProposalAction(input: {
  proposalId: string
  /** The (possibly edited) work product. Omit to approve as drafted. */
  body?: string
  /** The (possibly edited) email subject, for email-sending capabilities. */
  subject?: string
  /** A setup ask's typed answer (chair count, booking mode) — the executor
   *  validates it; the card collects it. */
  answer?: string
}): Promise<{ ok: true; message?: string } | { ok: false; error: string; expired?: boolean }> {
  const ctx = await requireTenant()
  const gate = ensureClinicStaff(ctx)
  if (gate) return { ok: false, error: gate }
  const r = await approveProposal(ctx.organizationId, input.proposalId, ctx.userId, {
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.answer !== undefined ? { answer: input.answer } : {}),
  })
  // The STRUCTURED dead-card signal rides through to the client — the card
  // clears on the flag, never on matching the error copy (verification
  // round: three retire messages didn't match the old regex and left a
  // dead card with a live Approve button).
  if (!r.ok) return { ok: false, error: r.error, ...(r.expired ? { expired: true } : {}) }
  revalidatePath('/dashboard')
  // The ledger one-liner doubles as the confirmation toast — the yes is
  // answered with what actually happened (round-1 audit).
  return { ok: true, message: r.message }
}

/**
 * The ladder's two human moves (Phase 3): "always do this for me" from a
 * card, and "back to asking" from the Overview strip. Any clinic staff
 * role — trust is the front desk's to give and to take back; the service
 * layer refuses non-grantable capabilities and narrates every change.
 */
export async function setAutonomyAction(input: {
  capability: string
  level: 'ask' | 'auto'
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  const gate = ensureClinicStaff(ctx)
  if (gate) return { ok: false, error: gate }
  const r = await setCapabilityTrust(ctx.organizationId, input.capability, input.level, ctx.userId)
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/dashboard')
  const label = getCapability(input.capability)?.label ?? input.capability
  return {
    ok: true,
    message:
      input.level === 'auto'
        ? ctx.isDemo
          ? `From now on I’d handle “${label}” on my own — in the demo I’ll show you how, but nothing actually goes out.`
          : `From now on I’ll handle “${label}” on my own — you’ll see each one listed on your Overview.`
        : `Okay — I’ll check with you again before “${label}”.`,
  }
}

export async function declineProposalAction(input: {
  proposalId: string
}): Promise<{ ok: true; message?: string } | { ok: false; error: string; expired?: boolean }> {
  const ctx = await requireTenant()
  const gate = ensureClinicStaff(ctx)
  if (gate) return { ok: false, error: gate }
  const r = await declineProposal(ctx.organizationId, input.proposalId, ctx.userId)
  if (!r.ok) return { ok: false, error: r.error, ...(r.expired ? { expired: true } : {}) }
  revalidatePath('/dashboard')
  // A no is acknowledged too (round-2 audit): the machine says what the
  // decline means — this piece of work is never re-asked about.
  return { ok: true, message: 'Okay — I won’t ask about this one again.' }
}
