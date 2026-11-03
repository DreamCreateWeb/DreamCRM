'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  markLeadContacted,
  archiveLead,
  reopenLead,
  convertLeadToPatient,
  findConvertDedupeMatch,
  setLeadCallBack,
  setLeadNote,
} from '@/lib/services/leads'
import { clinicDayInstant } from '@/lib/clinic-timezone'

async function requireClinicTenant() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Only clinic tenants can manage leads')
  }
  return ctx
}

/**
 * The approved machine-sent reply for this inquiry, if there is one — the
 * lead drawer's "What we sent" block (round-3 audit: the inquiry executor's
 * artifact lands on no other surface, and a front desk that can't read its
 * own outbound is blind when the person calls back). The date renders
 * clinic-local per the timezone law.
 */
export interface SentInquiryMailView {
  subject: string | null
  body: string
  sentAtLabel: string | null
  simulated: boolean
}

export async function getSentInquiryReplyAction(leadId: string): Promise<
  | {
      ok: true
      reply: SentInquiryMailView | null
      /** ML-22: the approved second touch, when there is one. */
      followup: SentInquiryMailView | null
    }
  | { ok: false }
> {
  try {
    const ctx = await requireClinicTenant()
    const [{ getSentInquiryReply, getSentInquiryFollowup }, { getClinicTimeZone }, { formatClinicDayTime }] =
      await Promise.all([
        import('@/lib/services/proposals'),
        import('@/lib/services/clinic-timezone'),
        import('@/lib/format-datetime'),
      ])
    const [reply, followup] = await Promise.all([
      getSentInquiryReply(ctx.organizationId, leadId),
      getSentInquiryFollowup(ctx.organizationId, leadId),
    ])
    if (!reply && !followup) return { ok: true, reply: null, followup: null }
    const tz = await getClinicTimeZone(ctx.organizationId)
    const view = (m: NonNullable<typeof reply>): SentInquiryMailView => ({
      subject: m.subject,
      body: m.body,
      sentAtLabel: m.sentAt ? formatClinicDayTime(m.sentAt, tz) : null,
      simulated: m.simulated,
    })
    return { ok: true, reply: reply ? view(reply) : null, followup: followup ? view(followup) : null }
  } catch {
    return { ok: false }
  }
}

/**
 * ML-22 — park a call-back DAY on an inquiry (a `YYYY-MM-DD` key on the
 * clinic's calendar; `null` clears it). Resolved to clinic-local noon here
 * (the tz law) so the day reads the same on the board, in the drawer and
 * to the generator's "the desk has a plan" check.
 */
export async function setLeadCallBackAction(
  id: string,
  dayKey: string | null,
): Promise<{ ok: true; callBackAt: string | null } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  let at: Date | null = null
  if (dayKey) {
    const { getClinicTimeZone } = await import('@/lib/services/clinic-timezone')
    const tz = await getClinicTimeZone(ctx.organizationId)
    at = clinicDayInstant(dayKey, tz)
    if (!at) return { ok: false, error: 'Pick a day on the calendar.' }
  }
  try {
    await setLeadCallBack(ctx.organizationId, id, at)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  revalidatePath('/leads')
  return { ok: true, callBackAt: at ? at.toISOString() : null }
}

/** ML-22 — the desk's own note on an inquiry (an empty note clears it). */
export async function setLeadNoteAction(
  id: string,
  notes: string,
): Promise<{ ok: true; notes: string | null } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  const trimmed = notes.trim().slice(0, 2000)
  try {
    await setLeadNote(ctx.organizationId, id, trimmed || null)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  revalidatePath('/leads')
  return { ok: true, notes: trimmed || null }
}

export async function markLeadContactedAction(id: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await markLeadContacted(ctx.organizationId, id)
  revalidatePath('/leads')
  revalidatePath('/')
  return { ok: true }
}

export async function archiveLeadAction(
  id: string,
  reason: string | null,
): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await archiveLead(ctx.organizationId, id, reason)
  revalidatePath('/leads')
  revalidatePath('/')
  return { ok: true }
}

export async function reopenLeadAction(id: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await reopenLead(ctx.organizationId, id)
  revalidatePath('/leads')
  return { ok: true }
}

/**
 * Bulk triage: mark the selected inquiries contacted, or archive them, in one
 * pass (you call a batch of new leads, then clear them all at once instead of
 * one drawer at a time). One bad row never fails the whole batch.
 */
export async function bulkSetLeadStatusAction(
  ids: string[],
  action: 'contacted' | 'archived',
): Promise<{ ok: true; updated: number }> {
  const ctx = await requireClinicTenant()
  let updated = 0
  for (const id of ids) {
    try {
      if (action === 'contacted') await markLeadContacted(ctx.organizationId, id)
      else await archiveLead(ctx.organizationId, id, null)
      updated++
    } catch {
      // skip a row that can't transition rather than aborting the batch
    }
  }
  revalidatePath('/leads')
  revalidatePath('/')
  return { ok: true, updated }
}

/**
 * Dry-run dedupe check — does this lead's email/phone already match an
 * existing patient? Returns the matched name so the UI can ask "link to
 * them, or create a separate patient?" BEFORE committing the convert.
 * Guards against silently merging e.g. a child lead into a parent who
 * shares the same phone number (common in family dental practices).
 */
export async function previewLeadConvertAction(
  id: string,
): Promise<{ ok: true; matchedPatientName: string | null } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  try {
    const match = await findConvertDedupeMatch(ctx.organizationId, id)
    return { ok: true, matchedPatientName: match?.name ?? null }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function convertLeadAction(
  id: string,
  options: { forceNewPatient?: boolean } = {},
): Promise<{ ok: true; patientId: string; deduped: boolean; patientName: string } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  try {
    const result = await convertLeadToPatient(ctx.organizationId, id, options)
    revalidatePath('/leads')
    revalidatePath('/patients')
    revalidatePath('/')
    return { ok: true, patientId: result.patientId, deduped: result.deduped, patientName: result.patientName }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
