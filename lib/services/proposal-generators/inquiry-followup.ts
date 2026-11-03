import 'server-only'
import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { aiConfigured } from '@/lib/ai'
import { fileProposal, getSentInquiryReply } from '@/lib/services/proposals'
import { CORE_VOICE_RULES } from '@/lib/services/service-library-ai'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { formatClinicDate } from '@/lib/format-datetime'

/**
 * INQUIRY FOLLOW-UPS (ML-22 — the second touch, under ML-11's convention).
 *
 * Someone wrote in through the website, the desk answered (or the machine's
 * first reply went out — `inquiry_response`, which stays THE first touch
 * and is untouched here), and then: silence. Today the row sits in
 * "Contacted" for good. This generator drafts ONE short second email —
 * "still thinking it over? here's the easy next step" — and files it for a
 * yes; once a practice grants `inquiry_followup`, the yes is the machine's
 * own, inside the patient send window (PATIENT_INBOX_CAPABILITIES).
 *
 * Selection — a lead that is:
 *  - `status = 'contacted'` with an EMAIL. Phone-only inquiries are NOT
 *    touched by this generator (the call card is a later slice); they get
 *    the desk's call-back day + notes only;
 *  - contacted at least INQUIRY_FOLLOWUP_AFTER_DAYS clinic-local DAYS ago
 *    (contacted Monday → the earliest card is Thursday's pass; the floor is
 *    a day boundary on the practice's calendar, never 72 UTC hours), and
 *    within the last INQUIRY_FOLLOWUP_WINDOW_DAYS — an inquiry that sat for
 *    a month is the desk's to archive, not a "just checking in";
 *  - never followed up (`followed_up_at` is null — the executor stamps it);
 *  - not parked: a call-back day today or ahead means the desk has a plan,
 *    and a second email on top of their call is noise. A call-back day that
 *    slipped past is exactly when the machine should offer to help;
 *  - at most MAX_INQUIRY_FOLLOWUPS_PER_RUN per org per pass, oldest contact
 *    first.
 *
 * Dedupe — the sourceKey is `inquiry_followup:<leadId>`: one second touch
 * per inquiry, ever (fileProposal is idempotent per (org, sourceKey) for
 * good, so a declined or expired card is the answer about THIS inquiry —
 * the same law the first touch lives under). Checked before any AI spend.
 *
 * The draft comes from the driver's own `draftText` — the same voice rules,
 * schema, monthly allowance and failure taxonomy the first touch uses —
 * loaded lazily so this file never imports the driver at module load (the
 * driver imports this file). AI off → nothing filed: a template "just
 * checking in" to a specific person is worse than none. The prompt gets
 * what we actually replied the first time (the approved inquiry_response
 * row, when there is one) and may only repeat what that reply offered.
 *
 * The card is an EMAIL artifact (the inquiry quoted as context, the draft
 * as the body, the "Book a time" button disclosed — inquiry_followup is in
 * BOOKING_BUTTON_CAPABILITIES — and a door to the inquiry itself).
 */

/** Clinic-local days a contact must have sat before a second touch is drafted. */
export const INQUIRY_FOLLOWUP_AFTER_DAYS = 3
/** A contact older than this is not "still thinking it over" — it is the desk's to archive. */
export const INQUIRY_FOLLOWUP_WINDOW_DAYS = 14
/** Cards per org per pass. */
export const MAX_INQUIRY_FOLLOWUPS_PER_RUN = 5
/** Leads read per pass (oldest contact first) before the caps. */
const CANDIDATE_LIMIT = 20
const DAY_MS = 24 * 60 * 60 * 1000
/** A "checking in" goes stale as fast as the first reply did. */
const EXPIRES_DAYS = 7

export type OnSoftFailure = () => void

/** Cheap existence check so no AI draft is spent on an already-filed inquiry. */
async function sourceKeyTaken(organizationId: string, sourceKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposal.id })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.sourceKey, sourceKey)))
    .limit(1)
  return !!row
}

export async function generateInquiryFollowupProposals(
  organizationId: string,
  clinicName: string,
  now: Date,
  timeZone: string,
  onSoftFailure?: OnSoftFailure,
): Promise<number> {
  if (!aiConfigured()) return 0

  // The floor is a DAY boundary on the practice's calendar: "contacted at
  // least N days ago" means the contact's clinic-local day is N or more
  // days before today — i.e. before the start of the day (N-1) days back.
  const floor = clinicDayStart(now, timeZone, -(INQUIRY_FOLLOWUP_AFTER_DAYS - 1))
  const windowStart = new Date(now.getTime() - INQUIRY_FOLLOWUP_WINDOW_DAYS * DAY_MS)
  const todayStart = clinicDayStart(now, timeZone, 0)

  const candidates = await db
    .select({
      id: schema.lead.id,
      name: schema.lead.name,
      email: schema.lead.email,
      message: schema.lead.message,
      preferredDate: schema.lead.preferredDate,
      contactedAt: schema.lead.contactedAt,
      callBackAt: schema.lead.callBackAt,
    })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.status, 'contacted'),
        isNull(schema.lead.followedUpAt),
        lt(schema.lead.contactedAt, floor),
        gte(schema.lead.contactedAt, windowStart),
      ),
    )
    .orderBy(asc(schema.lead.contactedAt))
    .limit(CANDIDATE_LIMIT)

  // Re-applied in memory so the SQL half and the rule can never disagree
  // (and so a mocked read is held to the same floor).
  const waiting = candidates.filter((l) => {
    if (!l.email?.trim()) return false
    if (!l.contactedAt || l.contactedAt.getTime() >= floor.getTime() || l.contactedAt.getTime() < windowStart.getTime()) return false
    // Parked by the desk for today or later → theirs to handle.
    if (l.callBackAt && l.callBackAt.getTime() >= todayStart.getTime()) return false
    return true
  })
  if (waiting.length === 0) return 0

  // THE drafting home + the booking door, loaded only once there is work.
  const [{ draftText }, { resolveClinicBookingUrl }] = await Promise.all([
    import('@/lib/services/proposal-generators'),
    import('@/lib/services/marketing-send'),
  ])
  // Whether the email will carry a "Book a time" button decides the next
  // step the draft may offer (the executor re-resolves at the tap).
  const bookingUrl = await resolveClinicBookingUrl(organizationId).catch(() => null)

  let filed = 0
  for (const lead of waiting) {
    if (filed >= MAX_INQUIRY_FOLLOWUPS_PER_RUN) break
    const sourceKey = `inquiry_followup:${lead.id}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const first = lead.name.trim().split(/\s+/)[0] || 'there'
    const contactedOn = formatClinicDate(lead.contactedAt!, timeZone)
    // What we actually said the first time — the approved machine reply,
    // when there is one. Best-effort: an unreadable record drafts without.
    const firstReply = await getSentInquiryReply(organizationId, lead.id).catch(() => null)
    const nextStep = bookingUrl
      ? 'book a time online — the email adds a "Book a time" button under your words, so do not paste a link or describe one'
      : 'reply to this email or call the office'

    const draft = await draftText(organizationId, {
      system: `You are the front desk of ${clinicName}, a dental clinic, writing a short SECOND email to someone who asked a question through the website. We answered on ${contactedOn} and have not heard back since. A staff member reviews and edits before it sends. ${CORE_VOICE_RULES}
Additional rules:
- 2–3 sentences. Warm and unhurried — they may simply be busy. No guilt, no pressure, no "I noticed you haven't replied".
- Offer the easy next step: ${nextStep}.
- Only repeat what our first reply actually offered. Do not add prices, available times, insurance answers or promises the first reply did not make.
- Do not restate their whole question back to them.
- No signature block — the email template signs for the clinic.`,
      user: `Their name: ${lead.name}\n${lead.preferredDate ? `Preferred date they mentioned: ${lead.preferredDate}\n` : ''}What they asked:\n${lead.message?.trim() || '(no message — they just left contact details)'}\n\nWhat we replied${firstReply ? '' : ' (a staff member reached out by phone or email — no written reply on record)'}:\n${firstReply?.body?.trim() || '(nothing on record)'}\n\nDraft the second email body.`,
    })
    if (!draft.ok) {
      // The first touch's law: org-global refusals end the pass; one
      // un-draftable inquiry skips only itself.
      if (draft.reason === 'not_configured' || draft.reason === 'no_allowance') break
      if (draft.reason === 'failed') onSoftFailure?.()
      continue
    }

    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'inquiry_followup',
      sourceKey,
      title: `Check back in with ${first} — nothing since we reached out on ${contactedOn}`,
      body: draft.text,
      payload: {
        leadId: lead.id,
        subject: `Checking in from ${clinicName}`,
        // The inquiry itself, quoted on the card (the first touch's shape),
        // so nobody approves a "checking in" blind.
        context: {
          kind: 'inquiry',
          author: lead.name,
          text: lead.message,
          preferredDate: lead.preferredDate,
        },
      },
      expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY_MS),
    })
    if (ok) filed++
  }
  return filed
}
