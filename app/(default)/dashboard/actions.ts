'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { approveProposal, declineProposal } from '@/lib/services/proposals'

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
}): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  const gate = ensureClinicStaff(ctx)
  if (gate) return { ok: false, error: gate }
  const r = await approveProposal(ctx.organizationId, input.proposalId, ctx.userId, {
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
  })
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/dashboard')
  // The ledger one-liner doubles as the confirmation toast — the yes is
  // answered with what actually happened (round-1 audit).
  return { ok: true, message: r.message }
}

export async function declineProposalAction(input: {
  proposalId: string
}): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  const gate = ensureClinicStaff(ctx)
  if (gate) return { ok: false, error: gate }
  const r = await declineProposal(ctx.organizationId, input.proposalId, ctx.userId)
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/dashboard')
  // A no is acknowledged too (round-2 audit): the machine says what the
  // decline means — this piece of work is never re-asked about.
  return { ok: true, message: 'Okay — I won’t ask about this one again.' }
}
