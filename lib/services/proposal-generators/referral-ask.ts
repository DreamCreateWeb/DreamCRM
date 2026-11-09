import 'server-only'
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { fileProposal } from '@/lib/services/proposals'
import { clinicDayStart } from '@/lib/clinic-timezone'

/**
 * THE REFERRAL ASK (ML-39, G3-19 — under ML-11's lane convention).
 *
 * The practice never asks a happy patient to bring a friend; the moment is
 * right after they said so. This files ONE card per happy patient: a short,
 * warm note with the patient's own share link (the same link the portal's
 * refer card mints — a friend who books through it is stamped "referred by"
 * on their record, which is what the Growth hub's Word of mouth row counts).
 * Once a practice grants `referral_ask`, the yes is the machine's own, inside
 * the patient send window (PATIENT_INBOX_CAPABILITIES).
 *
 * "Happy" is a PROMOTER, never a guess — one of two real signals inside the
 * last HAPPY_WINDOW_DAYS clinic-local days:
 *  - an NPS answer of 9 or 10 (`nps_response.score`, `responded_at`), or
 *  - a 5★ review-request outcome (`review_request.rating = 5`,
 *    `completed_at`).
 *
 * Selection floors, all reads of real columns:
 *  - an active, unmerged patient with an email AND marketing email opt-in
 *    (this is outreach — an opt-out is louder than a promoter);
 *  - never asked before: the sourceKey is `referral_ask:<patientId>` and
 *    fileProposal is idempotent per (org, sourceKey) for good, so ONE ask per
 *    patient EVER — a declined card is their answer too. (That is stricter
 *    than any 180-day floor, so no second ledger read is needed.)
 *  - at most MAX_REFERRAL_ASKS_PER_RUN per org per pass, freshest answer
 *    first.
 *
 * AI-free by design: code-owned, anti-shame copy; staff edit it on the card.
 * The card carries the real link in its body, so "what the card shows is
 * what sends" holds with no undisclosed button.
 */

/** Clinic-local days a happy answer stays fresh enough to ask on. */
export const HAPPY_WINDOW_DAYS = 14
/** Cards per org per pass. */
export const MAX_REFERRAL_ASKS_PER_RUN = 3
/** Promoter floor on the 0–10 survey. */
export const PROMOTER_NPS_MIN = 9
/** The 5★ outcome of a review request. */
export const FIVE_STAR = 5
const CANDIDATE_LIMIT = 20
const DAY_MS = 24 * 60 * 60 * 1000
/** A "you just said you were happy" ask goes stale; two weeks like the window. */
const EXPIRES_DAYS = 14

export const REFERRAL_ASK_SUBJECT = 'Know someone who’d like us?'

export function referralAskBody(opts: { first: string; shareUrl: string }): string {
  return `Hi ${opts.first},

It meant a lot to hear you had a good experience with us. If a friend or family member is looking for a dentist, you could pass us along — here is your personal link, and we’ll know they came from you:

${opts.shareUrl}

No pressure at all — and thank you, either way.`
}

export const referralAskSourceKey = (patientId: string): string => `referral_ask:${patientId}`

export async function generateReferralAskProposals(
  organizationId: string,
  now: Date,
  timeZone: string,
): Promise<number> {
  const since = clinicDayStart(now, timeZone, -HAPPY_WINDOW_DAYS)

  const [nps, reviews] = await Promise.all([
    db
      .select({ patientId: schema.npsResponse.patientId, at: schema.npsResponse.respondedAt, score: schema.npsResponse.score })
      .from(schema.npsResponse)
      .where(
        and(
          eq(schema.npsResponse.organizationId, organizationId),
          isNotNull(schema.npsResponse.score),
          gte(schema.npsResponse.respondedAt, since),
        ),
      )
      .orderBy(desc(schema.npsResponse.respondedAt))
      .limit(CANDIDATE_LIMIT * 3),
    db
      .select({ patientId: schema.reviewRequest.patientId, at: schema.reviewRequest.completedAt, rating: schema.reviewRequest.rating })
      .from(schema.reviewRequest)
      .where(
        and(
          eq(schema.reviewRequest.organizationId, organizationId),
          eq(schema.reviewRequest.rating, FIVE_STAR),
          gte(schema.reviewRequest.completedAt, since),
        ),
      )
      .orderBy(desc(schema.reviewRequest.completedAt))
      .limit(CANDIDATE_LIMIT * 3),
  ])

  // Re-applied in memory so the SQL half and the rule can never disagree.
  const freshest = new Map<string, number>()
  const note = (patientId: string | null, at: Date | null) => {
    if (!patientId || !at || at.getTime() < since.getTime()) return
    const prev = freshest.get(patientId)
    if (prev === undefined || at.getTime() > prev) freshest.set(patientId, at.getTime())
  }
  for (const r of nps) if (typeof r.score === 'number' && r.score >= PROMOTER_NPS_MIN) note(r.patientId, r.at)
  for (const r of reviews) if (r.rating === FIVE_STAR) note(r.patientId, r.at)
  if (freshest.size === 0) return 0

  const ordered = Array.from(freshest.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, CANDIDATE_LIMIT)

  const [patients, asked] = await Promise.all([
    db
      .select({
        id: schema.patient.id,
        firstName: schema.patient.firstName,
        email: schema.patient.email,
        isActive: schema.patient.isActive,
        marketingEmailOptIn: schema.patient.marketingEmailOptIn,
        mergedIntoPatientId: schema.patient.mergedIntoPatientId,
      })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, ordered))),
    db
      .select({ sourceKey: schema.proposal.sourceKey })
      .from(schema.proposal)
      .where(
        and(
          eq(schema.proposal.organizationId, organizationId),
          eq(schema.proposal.capability, 'referral_ask'),
          inArray(schema.proposal.sourceKey, ordered.map(referralAskSourceKey)),
        ),
      ),
  ])
  const patientById = new Map(patients.map((p) => [p.id, p]))
  const alreadyAsked = new Set(asked.map((a) => a.sourceKey))

  let linkFor: ((org: string, patientId: string) => Promise<{ shareUrl: string }>) | null = null
  let filed = 0
  for (const id of ordered) {
    if (filed >= MAX_REFERRAL_ASKS_PER_RUN) break
    const patient = patientById.get(id)
    if (!patient || patient.isActive !== 1 || patient.mergedIntoPatientId) continue
    if (!patient.email?.trim() || patient.marketingEmailOptIn !== 1) continue
    const sourceKey = referralAskSourceKey(id)
    if (alreadyAsked.has(sourceKey)) continue

    // The door: the patient's own share link — minted only now that there is
    // a card to carry it. No link, no card (an ask with no door is a nag).
    if (!linkFor) {
      const { getOrCreateReferralLink } = await import('@/lib/services/patient-referrals')
      linkFor = getOrCreateReferralLink
    }
    let shareUrl: string
    try {
      shareUrl = (await linkFor(organizationId, id)).shareUrl
    } catch (e) {
      console.warn('[proposals] referral_ask: could not mint a share link', e)
      continue
    }

    const first = patient.firstName?.trim() || 'there'
    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'referral_ask',
      sourceKey,
      patientId: id,
      title: `Ask ${patient.firstName?.trim() || 'this patient'} to refer a friend — they just said they were happy`,
      body: referralAskBody({ first, shareUrl }),
      payload: {
        patientId: id,
        subject: REFERRAL_ASK_SUBJECT,
        shareUrl,
        context: { kind: 'referral', author: first },
      },
      expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY_MS),
    })
    if (ok) filed++
  }
  return filed
}
