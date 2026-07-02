import 'server-only'
import { randomBytes, randomUUID } from 'crypto'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { publicSiteUrl } from '@/lib/services/clinic-site'

/**
 * Refer-a-friend (Solutionreach parity, done our way): each patient gets ONE
 * share link — `/book?ref=<token>` on the clinic's public site — minted lazily
 * from the portal's share card. When a NEW patient books (or requests a visit)
 * through that link, `patient.referred_by_patient_id` is stamped once at
 * creation and never overwritten, so the front desk sees "Referred by Mia"
 * on the record and Mia's own record shows who she brought in. No points, no
 * gift-card ledger — clinics thank referrers their own way; we make the
 * attribution visible instead of guessed at from "how did you hear about us?".
 */

export interface ReferralLink {
  token: string
  /** Absolute share URL on the clinic's public site (custom domain aware). */
  shareUrl: string
}

async function buildShareUrl(organizationId: string, token: string): Promise<string> {
  const [org] = await db
    .select({ slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1)
  const [profile] = await db
    .select({ websiteDomain: schema.clinicProfile.websiteDomain })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const base = publicSiteUrl({
    slug: org?.slug ?? '',
    profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
  })
  return `${base}/book?ref=${token}`
}

/**
 * The patient's share link, minting it on first ask. Idempotent — the unique
 * (org, patient) index means a concurrent double-mint loses the race and we
 * re-read the winner's row.
 */
export async function getOrCreateReferralLink(
  organizationId: string,
  patientId: string,
): Promise<ReferralLink> {
  const existing = await db
    .select({ token: schema.patientReferralLink.token })
    .from(schema.patientReferralLink)
    .where(
      and(
        eq(schema.patientReferralLink.organizationId, organizationId),
        eq(schema.patientReferralLink.patientId, patientId),
      ),
    )
    .limit(1)
  if (existing[0]) {
    return { token: existing[0].token, shareUrl: await buildShareUrl(organizationId, existing[0].token) }
  }

  const token = `ref_${randomBytes(12).toString('base64url')}`
  try {
    await db.insert(schema.patientReferralLink).values({
      id: randomUUID(),
      organizationId,
      patientId,
      token,
    })
    return { token, shareUrl: await buildShareUrl(organizationId, token) }
  } catch {
    // Unique-index race: someone else minted between our read and insert —
    // theirs is the link now.
    const [winner] = await db
      .select({ token: schema.patientReferralLink.token })
      .from(schema.patientReferralLink)
      .where(
        and(
          eq(schema.patientReferralLink.organizationId, organizationId),
          eq(schema.patientReferralLink.patientId, patientId),
        ),
      )
      .limit(1)
    if (!winner) throw new Error('Could not create your share link — please try again.')
    return { token: winner.token, shareUrl: await buildShareUrl(organizationId, winner.token) }
  }
}

/**
 * Resolve a `?ref=` token to the referring patient — ORG-SCOPED, so a token
 * from clinic A can never attribute a booking at clinic B. Returns null for
 * unknown/foreign tokens (the booking simply proceeds unattributed).
 */
export async function resolveReferralToken(
  organizationId: string,
  token: string,
): Promise<{ referrerPatientId: string } | null> {
  const t = token.trim()
  if (!t) return null
  const [row] = await db
    .select({ patientId: schema.patientReferralLink.patientId })
    .from(schema.patientReferralLink)
    .where(
      and(
        eq(schema.patientReferralLink.token, t),
        eq(schema.patientReferralLink.organizationId, organizationId),
      ),
    )
    .limit(1)
  return row ? { referrerPatientId: row.patientId } : null
}

/**
 * Stamp referral attribution on a just-created patient. Guards, in order:
 * unknown token → no-op; self-referral → no-op; already attributed → no-op
 * (set once, never overwritten — the WHERE clause enforces it even if two
 * paths race). Best-effort by design: callers never let this block a booking.
 */
export async function stampReferralAttribution(
  organizationId: string,
  newPatientId: string,
  refToken: string,
): Promise<boolean> {
  const resolved = await resolveReferralToken(organizationId, refToken)
  if (!resolved) return false
  if (resolved.referrerPatientId === newPatientId) return false
  await db
    .update(schema.patient)
    .set({ referredByPatientId: resolved.referrerPatientId })
    .where(
      and(
        eq(schema.patient.id, newPatientId),
        eq(schema.patient.organizationId, organizationId),
        isNull(schema.patient.referredByPatientId),
      ),
    )
  return true
}

export interface ReferralContext {
  /** Who brought THIS patient in (null = organic/unknown). */
  referredBy: { id: string; name: string } | null
  /** Patients THIS patient brought in, newest first. */
  referred: Array<{ id: string; name: string }>
}

/**
 * Both directions of the referral picture for a patient record: who referred
 * them, and who they've referred. Merged-away records are excluded so the
 * card never links to a tombstone.
 */
export async function getReferralContext(
  organizationId: string,
  patientId: string,
): Promise<ReferralContext> {
  const [me] = await db
    .select({ referredByPatientId: schema.patient.referredByPatientId })
    .from(schema.patient)
    .where(and(eq(schema.patient.id, patientId), eq(schema.patient.organizationId, organizationId)))
    .limit(1)

  let referredBy: ReferralContext['referredBy'] = null
  if (me?.referredByPatientId) {
    const [ref] = await db
      .select({
        id: schema.patient.id,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
      })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.id, me.referredByPatientId),
          eq(schema.patient.organizationId, organizationId),
          isNull(schema.patient.mergedIntoPatientId),
        ),
      )
      .limit(1)
    if (ref) referredBy = { id: ref.id, name: `${ref.firstName} ${ref.lastName}`.trim() }
  }

  const referredRows = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.referredByPatientId, patientId),
        eq(schema.patient.organizationId, organizationId),
        isNull(schema.patient.mergedIntoPatientId),
        ne(schema.patient.id, patientId),
      ),
    )
    .limit(20)

  return {
    referredBy,
    referred: referredRows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`.trim() })),
  }
}

/** How many friends this patient has brought in (for the portal share card). */
export async function countReferrals(organizationId: string, patientId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.referredByPatientId, patientId),
        eq(schema.patient.organizationId, organizationId),
        isNull(schema.patient.mergedIntoPatientId),
      ),
    )
  return rows.length
}
