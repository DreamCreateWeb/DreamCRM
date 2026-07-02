import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { resolveClinicTimeZone } from '@/lib/clinic-timezone'

/**
 * The clinic's IANA timezone for an org — the one lookup every server-side
 * time render needs (the prod server runs in UTC; see lib/format-datetime.ts).
 * Best-effort: falls back to CLINIC_DEFAULT_TZ when the clinic hasn't set one,
 * the profile row is missing (e.g. the platform org), or the read fails — a
 * timezone lookup is a display concern and must never break the action it
 * decorates.
 */
export async function getClinicTimeZone(organizationId: string): Promise<string> {
  try {
    const [row] = await db
      .select({ tz: clinicProfile.timezone })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, organizationId))
      .limit(1)
    return resolveClinicTimeZone(row?.tz)
  } catch {
    return resolveClinicTimeZone(null)
  }
}
