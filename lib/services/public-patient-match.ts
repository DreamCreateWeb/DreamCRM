import 'server-only'
import { randomUUID } from 'crypto'
import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { namesLooselyMatch } from '@/lib/patient-identity'

/**
 * Family-safe patient resolution for the PUBLIC entry points (site
 * appointment request, site self-booking, chat widget).
 *
 * A contact-info match (email OR phone) only claims an existing record when
 * the submitted NAME also matches — otherwise we create a SEPARATE patient
 * that shares the contact info and tell the front desk about it
 * (`sharedContactWith`), so a spouse using the family email never lands on
 * the other spouse's chart. See lib/patient-identity.ts for the whole story.
 */

export interface ResolvePublicPatientInput {
  firstName: string
  lastName: string
  email: string | null
  phone?: string | null
  /** patient.source for a newly created record. */
  source: string
  /** patient.lifecycle for a newly created record. */
  lifecycle: 'lead' | 'new'
}

export interface PublicPatientResolution {
  patientId: string
  /** True when a new patient row was created (callers stamp referral
   *  attribution etc. only for new records). */
  created: boolean
  /** Set when the record was created BECAUSE an existing patient already has
   *  this email/phone but the name didn't match — likely family. The front
   *  desk sees this in the thread note / booking notification. */
  sharedContactWith: { id: string; name: string } | null
}

export async function resolvePublicPatient(
  organizationId: string,
  input: ResolvePublicPatientInput,
): Promise<PublicPatientResolution> {
  const email = input.email?.trim() || null
  const phone = input.phone?.trim() || null

  let candidates: Array<{ id: string; firstName: string; lastName: string }> = []
  if (email || phone) {
    const conditions = [] as ReturnType<typeof eq>[]
    if (email) conditions.push(eq(patient.email, email))
    if (phone) conditions.push(eq(patient.phone, phone))
    candidates = await db
      .select({
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
      })
      .from(patient)
      .where(
        and(
          eq(patient.organizationId, organizationId),
          conditions.length === 1 ? conditions[0] : or(...conditions)!,
        ),
      )
      .limit(5)
  }

  // Same contact info AND the same person → their existing record.
  const match = candidates.find((c) =>
    namesLooselyMatch(
      { firstName: input.firstName, lastName: input.lastName },
      { firstName: c.firstName, lastName: c.lastName },
    ),
  )
  if (match) {
    await db
      .update(patient)
      .set({ lastActivityAt: new Date() })
      .where(eq(patient.id, match.id))
    return { patientId: match.id, created: false, sharedContactWith: null }
  }

  // No record, or the contact info belongs to a DIFFERENT person (family) —
  // either way this person gets their own chart.
  const patientId = randomUUID()
  const now = new Date()
  await db.insert(patient).values({
    id: patientId,
    organizationId,
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    phone,
    isActive: 1,
    source: input.source,
    lifecycle: input.lifecycle,
    firstSeenAt: now,
    lastActivityAt: now,
  })

  const sharer = candidates[0] ?? null
  return {
    patientId,
    created: true,
    sharedContactWith: sharer
      ? { id: sharer.id, name: `${sharer.firstName} ${sharer.lastName}`.trim() }
      : null,
  }
}

/** The warm, scannable front-desk aside appended to inbound notes when a new
 *  record was minted because the contact info is shared — one home so the
 *  request, booking, and chat flows all say it the same way. */
export function sharedContactNote(newFirstName: string, sharerName: string): string {
  return `Heads-up: this contact info is also on file for ${sharerName} — likely family. We gave ${newFirstName} their own record so nothing lands on the wrong chart.`
}
