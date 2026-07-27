import 'server-only'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  resolveJourneyStage,
  type JourneyStage,
  type JourneyTimestamps,
} from '@/lib/patient-journey'
import { BACKFILL_PATIENT_SOURCES } from '@/lib/patient-acquisition'

/**
 * Server half of the journey-stage spine (Transformation Phase 1 — DESIGN.md
 * "The North Star"). Resolves stages + transition timestamps from the
 * appointments table in bulk; the pure logic lives in lib/patient-journey.ts.
 *
 * "Seated" uses `completedAt ?? startTime` for completed visits (early rows
 * predate the completedAt column).
 *
 * PMS-IMPORT LAW: appointments the PMS sync backfilled (appointment.source =
 * 'pms_import') NEVER mint transition timestamps — the sync stamps their
 * completedAt with the SYNC time, not the visit time, and their row
 * createdAt is the sync moment too. Contact-linked patients keep their
 * organic patient.source, so the patient-level backfill exclusion misses
 * them; without this appointment-level exclusion, connecting a PMS reads as
 * a fake booked+seated growth spike (the exact lie the funnel exists to
 * prevent). Imported history still counts toward WHO someone is (the stage
 * facts below use ALL appointments) — it just can't claim WHEN a transition
 * happened inside any window.
 */
const NOT_IMPORTED = sql`${schema.appointment.source} is distinct from 'pms_import'`

export interface PatientJourneyRow extends JourneyTimestamps {
  patientId: string
  stage: JourneyStage
}

/**
 * Journey stage + transition timestamps for a set of patients (one org).
 * Two bulk queries regardless of set size. Unknown ids are omitted.
 */
export async function getJourneyForPatients(
  organizationId: string,
  patientIds: string[],
): Promise<Map<string, PatientJourneyRow>> {
  const out = new Map<string, PatientJourneyRow>()
  if (patientIds.length === 0) return out

  const patients = await db
    .select({
      id: schema.patient.id,
      firstSeenAt: schema.patient.firstSeenAt,
      lifecycle: schema.patient.lifecycle,
    })
    .from(schema.patient)
    .where(
      and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, patientIds)),
    )

  // One aggregate pass over their appointments: first booked + first seated +
  // whether anything on the books ISN'T cancelled. Stage 'booked' requires a
  // live (non-cancelled) appointment — a person whose every booking was
  // cancelled is an inquiry needing re-conversion, not someone on the
  // schedule. A no-show still counts as booked: they're in the show-up war.
  const appts = await db
    .select({
      patientId: schema.appointment.patientId,
      firstBookedAt: sql<Date | null>`min(case when ${NOT_IMPORTED} then ${schema.appointment.createdAt} end)`,
      hasLiveAppointment: sql<boolean>`bool_or(${schema.appointment.status} <> 'cancelled')`,
      hasCompletedEver: sql<boolean>`bool_or(${schema.appointment.status} = 'completed')`,
      firstSeatedAt: sql<Date | null>`min(
        case when ${schema.appointment.status} = 'completed' and ${NOT_IMPORTED}
             then coalesce(${schema.appointment.completedAt}, ${schema.appointment.startTime})
        end
      )`,
    })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        inArray(schema.appointment.patientId, patientIds),
      ),
    )
    .groupBy(schema.appointment.patientId)
  const apptByPatient = new Map(appts.map((a) => [a.patientId, a]))

  for (const p of patients) {
    const a = apptByPatient.get(p.id)
    const firstBookedAt = a?.firstBookedAt ? new Date(a.firstBookedAt) : null
    const firstSeatedAt = a?.firstSeatedAt ? new Date(a.firstSeatedAt) : null
    out.set(p.id, {
      patientId: p.id,
      stage: resolveJourneyStage({
        hasAppointment: !!a?.hasLiveAppointment,
        // Stage facts use ALL history (an imported completed visit still makes
        // them a patient) — only the TIMESTAMPS are import-excluded.
        hasCompletedVisit: !!a?.hasCompletedEver,
        archived: p.lifecycle === 'archived',
      }),
      firstSeenAt: p.firstSeenAt ? new Date(p.firstSeenAt) : null,
      firstBookedAt,
      firstSeatedAt,
    })
  }
  return out
}

export interface JourneyStageCounts {
  inquiry: number
  booked: number
  patient: number
}

/**
 * Org-wide stage counts (archived excluded) — the journey bar's standing
 * population. One aggregate query; bulk-backfilled records (PMS/CSV) count
 * here (they ARE the roster) — it's the TRANSITION metrics below that
 * exclude them, because acquisition means won-through-our-channels.
 */
export async function getJourneyStageCounts(organizationId: string): Promise<JourneyStageCounts> {
  const rows = await db
    .select({
      patientId: schema.patient.id,
      hasBooked: sql<boolean>`bool_or(${schema.appointment.status} <> 'cancelled')`,
      hasSeated: sql<boolean>`bool_or(${schema.appointment.status} = 'completed')`,
    })
    .from(schema.patient)
    .leftJoin(
      schema.appointment,
      and(
        eq(schema.appointment.patientId, schema.patient.id),
        eq(schema.appointment.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        ne(schema.patient.lifecycle, 'archived'),
      ),
    )
    .groupBy(schema.patient.id)

  const counts: JourneyStageCounts = { inquiry: 0, booked: 0, patient: 0 }
  for (const r of rows) {
    const stage = resolveJourneyStage({
      hasAppointment: !!r.hasBooked,
      hasCompletedVisit: !!r.hasSeated,
      archived: false,
    })
    if (stage !== 'archived') counts[stage]++
  }
  return counts
}

export interface JourneyFunnelWindow {
  /** People who ENTERED the journey in the window (record minted, any
   *  non-backfill source) — named for the stage they enter at. A walk-in
   *  the front desk typed in counts here too: they entered, then usually
   *  transition to booked/seated the same day. */
  inquiries: number
  /** People whose FIRST appointment was created in the window. */
  booked: number
  /** People whose FIRST completed visit landed in the window — the only
   *  number the app may call "new patients". */
  seated: number
}

/**
 * The acquisition funnel over a rolling window: transitions, not populations.
 * Each stage counts the people who made THAT transition inside the window,
 * so the three numbers tell the conversion story the platform exists for.
 * Bulk-backfilled records are excluded throughout (connecting a PMS or
 * importing a CSV must never read as a growth spike).
 */
export async function getJourneyFunnel(
  organizationId: string,
  days = 30,
  now: Date = new Date(),
): Promise<JourneyFunnelWindow> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      patientId: schema.patient.id,
      source: schema.patient.source,
      firstSeenAt: schema.patient.firstSeenAt,
      firstBookedAt: sql<Date | null>`min(case when ${NOT_IMPORTED} then ${schema.appointment.createdAt} end)`,
      firstSeatedAt: sql<Date | null>`min(
        case when ${schema.appointment.status} = 'completed' and ${NOT_IMPORTED}
             then coalesce(${schema.appointment.completedAt}, ${schema.appointment.startTime})
        end
      )`,
    })
    .from(schema.patient)
    .leftJoin(
      schema.appointment,
      and(
        eq(schema.appointment.patientId, schema.patient.id),
        eq(schema.appointment.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        ne(schema.patient.lifecycle, 'archived'),
      ),
    )
    .groupBy(schema.patient.id)

  const funnel: JourneyFunnelWindow = { inquiries: 0, booked: 0, seated: 0 }
  for (const r of rows) {
    if (BACKFILL_PATIENT_SOURCES.has(r.source ?? '')) continue
    if (r.firstSeenAt && new Date(r.firstSeenAt) >= since) funnel.inquiries++
    if (r.firstBookedAt && new Date(r.firstBookedAt) >= since) funnel.booked++
    if (r.firstSeatedAt && new Date(r.firstSeatedAt) >= since) funnel.seated++
  }
  return funnel
}
