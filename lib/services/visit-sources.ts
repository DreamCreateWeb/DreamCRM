import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { schema } from '@/lib/db'
import { CSV_IMPORT_APPOINTMENT_SOURCE } from '@/lib/patient-acquisition'

/**
 * "Not the CSV roster's placeholder visit" — the predicate every CHAIR surface
 * (the agenda, Today's chair) and every POST-VISIT touch (review asks, the
 * post-visit survey, loyalty points) adds to its completed-visit read.
 *
 * A 'csv_import' row is the one completed, zero-length appointment the
 * roster import mints from a "last visit" column (lib/services/patient-import.ts)
 * so the recall engine has a last visit to count from. It is honest history
 * and it is NOT a visit anyone sat through on this platform: it has no chair,
 * no provider, no time of day, and the practice never marked it done — so it
 * must never appear on a day's agenda, never fire a review request to a
 * patient who was last seen eight months ago, and never award points.
 *
 * `is distinct from`, not `<>`: a NULL source (every hand-booked visit before
 * the column existed) is a real visit and must pass. A function, not a const:
 * reaching into the schema at module load breaks every test that stubs
 * `@/lib/db` with a partial schema.
 */
export function notCsvImportVisit(): SQL {
  return sql`${schema.appointment.source} is distinct from ${CSV_IMPORT_APPOINTMENT_SOURCE}`
}
