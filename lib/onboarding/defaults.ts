import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'

/**
 * Day-0 defaults for a freshly-created clinic.
 *
 * The demo clinic seeds a rich profile (hours, services, staff, …) but real
 * clinics start near-empty. Most of that emptiness is fine — the public site,
 * portal, nav, and dashboard all resolve null jsonb fields to honest empty
 * states (see `resolvePortalSettings`, `resolveLeadForm`, `getSlotsForDay`).
 *
 * Office HOURS are the exception: a brand-new clinic with null hours has a
 * LIVE `/book` page (the subdomain serves immediately) where every single day
 * returns `day_closed` — so a prospective patient sees "We're closed this day"
 * on all 14 days, which reads as broken, not as a clinic that hasn't finished
 * setup. Hours also drive the public footer's weekly schedule and the patient
 * portal. So we seed a sensible standard week up front; the clinic refines it
 * in Settings → Clinic Profile (the Getting-started "Set your office hours"
 * task still nudges them to confirm).
 *
 * This is a STARTING POINT, not a claim — Mon–Fri 9–5, weekends closed is the
 * most common US dental week and is trivially editable. We deliberately do NOT
 * seed services / staff / testimonials / stats (those would be fake content —
 * see DESIGN.md "no fake content"); hours are a neutral operational default,
 * not marketing copy.
 */

interface HourEntry {
  open: string | null
  close: string | null
}
export type DefaultHours = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', HourEntry>

/** Mon–Fri 9:00–17:00, weekends closed. Wall-clock strings (no zone); the
 *  clinic's timezone resolves them at render. */
export const DEFAULT_CLINIC_HOURS: DefaultHours = {
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '17:00' },
  sat: { open: null, close: null },
  sun: { open: null, close: null },
}

/**
 * Seed day-0 operational defaults onto a clinic profile, idempotently. Only
 * writes a field that is still null — so re-running onboarding never clobbers a
 * clinic that already set its own hours, and a clinic that explicitly cleared a
 * field won't have it re-seeded mid-edit (the only write path is the initial
 * onboarding/provisioning, before the clinic touches Settings).
 *
 * Best-effort by contract: callers MUST wrap this in try/catch so a seeding
 * hiccup can never block checkout or provisioning (mirrors the
 * `seedDefaultIntakeForm` pattern from PR #304).
 */
export async function seedClinicDay0Defaults(organizationId: string): Promise<void> {
  const [profile] = await db
    .select({ hours: clinicProfile.hours })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!profile) return

  const patch: Record<string, unknown> = {}
  if (profile.hours == null) patch.hours = DEFAULT_CLINIC_HOURS

  if (Object.keys(patch).length === 0) return
  patch.updatedAt = new Date()
  await db.update(clinicProfile).set(patch).where(eq(clinicProfile.organizationId, organizationId))
}
