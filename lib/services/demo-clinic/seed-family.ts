import 'server-only'
import { and, eq, gte, isNull, like, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { DEMO_REVIEW_TEXTS } from './reviews-data'

// Family links, testimonial top-ups, and the legacy Acme rename sweep.

/**
 * Family-access seed (patient portal): gives Emma Lopez a 9-year-old
 * dependent, Lily, with an upcoming cleaning — so the portal's Family page,
 * the "for Lily" visit-card treatment, and guardian booking all have real
 * demo data. Idempotent: looks up by name, inserts only what's missing.
 * Used by both the new-clinic-seed path AND the self-heal path.
 */
export async function seedDemoFamilyForOrg(orgId: string, now: Date): Promise<void> {
  const [guardian] = await db
    .select({ id: schema.patient.id, city: schema.patient.city, state: schema.patient.state, postalCode: schema.patient.postalCode, addressLine1: schema.patient.addressLine1, phone: schema.patient.phone })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, orgId),
        eq(schema.patient.firstName, 'Emma'),
        eq(schema.patient.lastName, 'Lopez'),
      ),
    )
    .limit(1)
  if (!guardian) return // personas not seeded yet — fresh path calls us after patients

  let [lily] = await db
    .select({ id: schema.patient.id, guardianPatientId: schema.patient.guardianPatientId })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, orgId),
        eq(schema.patient.firstName, 'Lily'),
        eq(schema.patient.lastName, 'Lopez'),
      ),
    )
    .limit(1)

  if (!lily) {
    const dob = new Date(now.getFullYear() - 9, 2, 14) // ~9 years old
    const id = newId('pat')
    await db.insert(schema.patient).values({
      id,
      organizationId: orgId,
      firstName: 'Lily',
      lastName: 'Lopez',
      dateOfBirth: dob.toISOString().slice(0, 10),
      email: null, // kids share the household inbox — guardian gets the email
      phone: guardian.phone,
      addressLine1: guardian.addressLine1,
      city: guardian.city,
      state: guardian.state,
      postalCode: guardian.postalCode,
      guardianPatientId: guardian.id,
      source: 'manual',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 200 * 86_400_000),
      lastActivityAt: new Date(now.getTime() - 10 * 86_400_000),
    })
    lily = { id, guardianPatientId: guardian.id }
  } else if (!lily.guardianPatientId) {
    await db
      .update(schema.patient)
      .set({ guardianPatientId: guardian.id, updatedAt: new Date() })
      .where(and(eq(schema.patient.organizationId, orgId), eq(schema.patient.id, lily.id)))
  }

  // One upcoming cleaning for Lily so the Family page has a live card.
  const [upcoming] = await db
    .select({ id: schema.appointment.id })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, orgId),
        eq(schema.appointment.patientId, lily.id),
        gte(schema.appointment.startTime, now),
      ),
    )
    .limit(1)
  if (!upcoming) {
    const [hygienist] = await db
      .select({ id: schema.clinicProvider.id })
      .from(schema.clinicProvider)
      .where(
        and(eq(schema.clinicProvider.organizationId, orgId), eq(schema.clinicProvider.role, 'hygienist')),
      )
      .limit(1)
    const start = new Date(now.getTime() + 5 * 86_400_000)
    start.setUTCHours(16, 0, 0, 0) // 10/11am clinic-local
    await db.insert(schema.appointment).values({
      id: newId('appt'),
      organizationId: orgId,
      patientId: lily.id,
      providerId: hygienist?.id ?? null,
      title: 'Cleaning - Lily Lopez',
      startTime: start,
      endTime: new Date(start.getTime() + 30 * 60_000),
      type: 'cleaning',
      status: 'scheduled',
      source: 'portal',
      notes: 'Booked by mom (Emma) from the portal. Bubblegum fluoride, please!',
    })
  }
}

/**
 * Idempotent backfill of review_request.review_text + rating on legacy
 * demos that were seeded before migration 0035 added the column. Without
 * this, every card on /reviews/received shows "this patient went straight
 * to a third-party platform" even though the public site has the text —
 * because the text lives in clinic_profile.testimonials JSON, never on
 * the review_request row that the dashboard reads from.
 *
 * Joins review_request → patient, matches the patient name to a
 * DEMO_REVIEW_TEXTS entry (via the well-known persona ordering: Mia at 0,
 * Liam at 1, …), and updates the row when review_text is currently null.
 * Real-clinic data is never touched: this only runs in the demo-clinic
 * self-heal path, and only modifies rows whose patient name exactly
 * matches a seeded persona.
 */
export async function topUpDemoReviewText(orgId: string): Promise<void> {
  const rows = await db
    .select({
      reviewRequestId: schema.reviewRequest.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
    })
    .from(schema.reviewRequest)
    .innerJoin(schema.patient, eq(schema.reviewRequest.patientId, schema.patient.id))
    .where(
      and(
        eq(schema.reviewRequest.organizationId, orgId),
        eq(schema.reviewRequest.status, 'completed'),
        // Fill null review_text (pre-0035 legacy) OR force-refresh any text that
        // still names "Acme" — one-time (2026-06): Acme→Dream Dental. The
        // matched rows are overwritten from DEMO_REVIEW_TEXTS (Dream Dental
        // copy) below. Remove the like() clause with the rename branches.
        or(
          isNull(schema.reviewRequest.reviewText),
          like(schema.reviewRequest.reviewText, '%Acme%'),
        ),
      ),
    )
  if (rows.length === 0) return

  // Persona name → index, matching buildPatientPersonas's order so we can
  // look up the DEMO_REVIEW_TEXTS entry by name.
  const personaIdxByName = new Map<string, number>([
    ['Mia Hayes', 0],
    ['Liam Brooks', 1],
    ['Charlotte Diaz', 2],
    ['Marcus Johnson', 3],
    ['Sophia Iverson', 4],
    ['Aiden Kim', 5],
    ['Emma Lopez', 6],
    ['Noah Mitchell', 7],
    ['Olivia Anderson', 8],
    ['Ethan Carter', 9],
    ['Isabella Evans', 10],
    ['Mason Garza', 11],
    ['Ava Fischer', 12],
    ['James Owens', 13],
  ])

  for (const row of rows) {
    const idx = personaIdxByName.get(`${row.firstName} ${row.lastName}`)
    if (idx == null) continue
    const entry = DEMO_REVIEW_TEXTS[idx]
    if (!entry) continue
    await db
      .update(schema.reviewRequest)
      .set({
        reviewText: entry.text,
        rating: entry.rating,
        updatedAt: new Date(),
      })
      .where(eq(schema.reviewRequest.id, row.reviewRequestId))
  }
}

/**
 * one-time (2026-06): Acme→Dream Dental — force-refresh demo artifacts that
 * live in seed-only write paths (so the standard backfill-when-null self-heal
 * never revisits them on an already-seeded demo): the primary location NAME and
 * the seo_meta title/description copy. We rewrite the literal "Acme" → "Dream
 * Dental" in the stored values rather than re-seeding, so any clinic-side
 * tweaks to the surrounding text survive. Scoped entirely to the isDemo org.
 * Remove this helper + its call site with the rest of the rename branches.
 */
export async function renameDemoAcmeArtifacts(orgId: string): Promise<void> {
  // Primary location name.
  const [loc] = await db
    .select({ id: schema.clinicLocation.id, name: schema.clinicLocation.name })
    .from(schema.clinicLocation)
    .where(eq(schema.clinicLocation.organizationId, orgId))
    .limit(1)
  if (loc && typeof loc.name === 'string' && loc.name.includes('Acme')) {
    await db
      .update(schema.clinicLocation)
      .set({ name: loc.name.replace(/Acme Dental/g, 'Dream Dental').replace(/Acme/g, 'Dream Dental') })
      .where(eq(schema.clinicLocation.id, loc.id))
  }

  // seo_meta title + descriptions.
  const [profile] = await db
    .select({ seoMeta: schema.clinicProfile.seoMeta })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (profile?.seoMeta) {
    const json = JSON.stringify(profile.seoMeta)
    if (json.includes('Acme')) {
      const renamed = JSON.parse(
        json.replace(/Acme Dental/g, 'Dream Dental').replace(/Acme/g, 'Dream Dental'),
      )
      await db
        .update(schema.clinicProfile)
        .set({ seoMeta: renamed, updatedAt: new Date() })
        .where(eq(schema.clinicProfile.organizationId, orgId))
    }
  }
}
