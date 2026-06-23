import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'

/**
 * Per-clinic cadence settings that shape the relationship glyphs + recall:
 *  - recallMonths: default recall interval (Settings → Practice). Null falls
 *    through to RECALL_DEFAULT_MONTHS in derivePatientRecallStatus.
 *  - lapsedMonths: months without a visit before a patient is 💤 lapsed. Null
 *    falls through to LAPSED_DEFAULT_MONTHS in lapsedCutoff().
 *
 * One read for both, shared by the Patients list + the Appointments agenda so
 * the 💤/recall thresholds can't diverge across surfaces.
 */
export interface ClinicCadence {
  recallMonths: number | null
  lapsedMonths: number | null
}

export async function getClinicCadence(organizationId: string): Promise<ClinicCadence> {
  const [row] = await db
    .select({
      recallMonths: clinicProfile.recallDefaultMonths,
      lapsedMonths: clinicProfile.lapsedAfterMonths,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  return {
    recallMonths: row?.recallMonths ?? null,
    lapsedMonths: row?.lapsedMonths ?? null,
  }
}
