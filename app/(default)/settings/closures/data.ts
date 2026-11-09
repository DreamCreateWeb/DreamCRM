import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import { clinicDayKeyFor, listUpcomingClosures } from '@/lib/services/closures'
import { holidayPresets, type ClosureRange, type HolidayPreset } from '@/lib/closures'
import { parseGbpSpecialClosures, type GbpSpecialClosure } from '@/lib/gbp-listing'

/** The Holiday closures page's read (a plain server module — the page awaits
 *  it directly; only the mutations are server actions). */
export interface ClosuresPageData {
  canEdit: boolean
  /** The clinic-local today (day key) the presets were computed against. */
  todayKey: string
  closures: ClosureRange[]
  /** US federal holidays for the next 12 months not yet on the list (computed, never stored until tapped). */
  presets: HolidayPreset[]
  /** Google's special hours, READ-ONLY, shown beside the practice's own — never merged. */
  gbp: GbpSpecialClosure[]
}

export async function getClosuresPageData(): Promise<ClosuresPageData> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Only clinic tenants can view closures')
  const [profile] = await db
    .select({ timezone: clinicProfile.timezone, gbpListing: clinicProfile.gbpListing })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  const todayKey = clinicDayKeyFor(new Date(), profile?.timezone)
  const closures = await listUpcomingClosures(ctx.organizationId, profile?.timezone)
  const have = new Set(closures.map((c) => `${c.startsOn}|${c.endsOn}`))
  return {
    canEdit: ctx.role === 'owner' || ctx.role === 'admin',
    todayKey,
    closures,
    presets: holidayPresets(todayKey).filter((p) => !have.has(`${p.startsOn}|${p.endsOn}`)),
    gbp: parseGbpSpecialClosures(profile?.gbpListing).filter((g) => g.endsOn >= todayKey),
  }
}

