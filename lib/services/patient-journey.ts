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
 * PMS-IMPORT LAW: appointments the PMS sync BACKFILLED at connect time
 * (appointment.source = 'pms_import') NEVER mint transition timestamps — the
 * sync stamps their completedAt with the SYNC time, not the visit time, and
 * their row createdAt is the sync moment too. Contact-linked patients keep
 * their organic patient.source, so the patient-level backfill exclusion
 * misses them; without this appointment-level exclusion, connecting a PMS
 * reads as a fake booked+seated growth spike (the exact lie the funnel
 * exists to prevent). Rows created by ONGOING delta sync carry source 'pms'
 * (see lib/services/pms/sync.ts) — those are real new bookings made in the
 * practice system, arriving within one cron cycle of the truth, and they DO
 * mint transitions; excluding them would blind the funnel to all OD-side
 * growth forever (round-2 audit). Imported history still counts toward WHO
 * someone is (the stage facts below use ALL appointments) — it just can't
 * claim WHEN a transition happened inside any window.
 *
 * THE INVERSE LAW (round-2 audit): imported history also SUPPRESSES minting.
 * A patient whose backfilled chart already shows an earlier appointment (or
 * an earlier completed visit) made their real transition years before we
 * could see it — letting their next organic visit mint firstBookedAt/
 * firstSeatedAt would count a long-time patient as a brand-new one. The
 * imported rows' startTime is the honest visit time (only their createdAt/
 * completedAt are sync-corrupted), so it anchors the suppression check.
 *
 * 'pms_live' (round-4 audit) is the backfilled-upcoming row the delta sync
 * WATCHED complete. Its startTime is honest → it may mint SEATED; its
 * createdAt is still the connect-sync moment → it must never mint BOOKED,
 * and it stays in the imported-booked suppression anchor (it proves the
 * person was on the book by import time).
 */
const NOT_IMPORTED = sql`${schema.appointment.source} is distinct from 'pms_import'`
const IMPORTED = sql`${schema.appointment.source} = 'pms_import'`
const BOOKED_MINTABLE = sql`${schema.appointment.source} is distinct from 'pms_import' and ${schema.appointment.source} is distinct from 'pms_live'`
const IMPORTED_OR_LIVE = sql`(${schema.appointment.source} = 'pms_import' or ${schema.appointment.source} = 'pms_live')`

/** Null out a minted transition when imported history predates it. */
function suppressIfImportedEarlier(minted: Date | null, importedAt: Date | null): Date | null {
  if (!minted) return null
  if (importedAt && importedAt.getTime() < minted.getTime()) return null
  return minted
}

export interface PatientJourneyRow extends JourneyTimestamps {
  patientId: string
  stage: JourneyStage
  /** True when the PERSON arrived by bulk backfill (patient.source is a
   *  BACKFILL_PATIENT_SOURCES value) — their firstSeenAt is the import
   *  moment, not a real inquiry. Window math over these timestamps must skip
   *  backfilled people, exactly as getJourneyFunnel does; this flag is that
   *  exclusion, pre-derived so consumers can't forget it. */
  isBackfilled: boolean
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
      source: schema.patient.source,
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
      firstBookedAt: sql<Date | null>`min(case when ${BOOKED_MINTABLE} then ${schema.appointment.createdAt} end)`,
      hasLiveAppointment: sql<boolean>`bool_or(${schema.appointment.status} <> 'cancelled')`,
      hasCompletedEver: sql<boolean>`bool_or(${schema.appointment.status} = 'completed')`,
      // Seated anchors on the EARLIER of completedAt and startTime: startTime
      // is the honest visit time when staff mark late (the catch-net
      // institutionalizes up to 30-day catch-up marking — round-3 audit),
      // while completedAt covers legacy rows and early completions.
      firstSeatedAt: sql<Date | null>`min(
        case when ${schema.appointment.status} = 'completed' and ${NOT_IMPORTED}
             then least(coalesce(${schema.appointment.completedAt}, ${schema.appointment.startTime}), ${schema.appointment.startTime})
        end
      )`,
      // Imported-history anchors for the inverse law. Booked anchors on the
      // EARLIER of startTime and the row's own createdAt: a backfilled
      // UPCOMING appointment (future startTime) still proves the person was
      // on the practice's book by the moment we imported it — without the
      // createdAt leg it couldn't suppress an earlier organic mint
      // (round-3 audit). Seated keeps startTime (the honest visit time; a
      // completed imported row's completedAt is sync-corrupted).
      importedBookedAt: sql<Date | null>`min(case when ${IMPORTED_OR_LIVE} then least(${schema.appointment.startTime}, ${schema.appointment.createdAt}) end)`,
      importedSeatedAt: sql<Date | null>`min(case when ${schema.appointment.status} = 'completed' and ${IMPORTED} then ${schema.appointment.startTime} end)`,
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
    const isBackfilled = BACKFILL_PATIENT_SOURCES.has(p.source ?? '')
    const firstBookedAt = suppressIfImportedEarlier(
      a?.firstBookedAt ? new Date(a.firstBookedAt) : null,
      a?.importedBookedAt ? new Date(a.importedBookedAt) : null,
    )
    const firstSeatedAt = suppressIfImportedEarlier(
      a?.firstSeatedAt ? new Date(a.firstSeatedAt) : null,
      a?.importedSeatedAt ? new Date(a.importedSeatedAt) : null,
    )
    out.set(p.id, {
      patientId: p.id,
      stage: resolveJourneyStage({
        hasAppointment: !!a?.hasLiveAppointment,
        // Stage facts use ALL history (an imported completed visit still makes
        // them a patient) — only the TIMESTAMPS are import-excluded.
        hasCompletedVisit: !!a?.hasCompletedEver,
        archived: p.lifecycle === 'archived',
        // A bulk-imported roster member IS a patient of the practice even
        // when the import carried no visit rows (CSV imports map identity
        // only — round-3 audit).
        importedRoster: isBackfilled,
      }),
      firstSeenAt: p.firstSeenAt ? new Date(p.firstSeenAt) : null,
      firstBookedAt,
      firstSeatedAt,
      isBackfilled,
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
      source: schema.patient.source,
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
      // Roster members count as patients even with no visit rows (CSV
      // imports carry none) — the population must not call a clinic's
      // whole imported roster "inquiries" (round-3 audit).
      importedRoster: BACKFILL_PATIENT_SOURCES.has(r.source ?? ''),
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
      firstBookedAt: sql<Date | null>`min(case when ${BOOKED_MINTABLE} then ${schema.appointment.createdAt} end)`,
      // Same anchor rules as getJourneyForPatients above (round-3 audit):
      // seated takes the earlier of completedAt/startTime (late marking must
      // not shift the seat date); imported-booked takes the earlier of
      // startTime/createdAt (an upcoming imported row proves the person was
      // booked by import time).
      firstSeatedAt: sql<Date | null>`min(
        case when ${schema.appointment.status} = 'completed' and ${NOT_IMPORTED}
             then least(coalesce(${schema.appointment.completedAt}, ${schema.appointment.startTime}), ${schema.appointment.startTime})
        end
      )`,
      importedBookedAt: sql<Date | null>`min(case when ${IMPORTED_OR_LIVE} then least(${schema.appointment.startTime}, ${schema.appointment.createdAt}) end)`,
      importedSeatedAt: sql<Date | null>`min(case when ${schema.appointment.status} = 'completed' and ${IMPORTED} then ${schema.appointment.startTime} end)`,
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
    const firstBookedAt = suppressIfImportedEarlier(
      r.firstBookedAt ? new Date(r.firstBookedAt) : null,
      r.importedBookedAt ? new Date(r.importedBookedAt) : null,
    )
    const firstSeatedAt = suppressIfImportedEarlier(
      r.firstSeatedAt ? new Date(r.firstSeatedAt) : null,
      r.importedSeatedAt ? new Date(r.importedSeatedAt) : null,
    )
    if (r.firstSeenAt && new Date(r.firstSeenAt) >= since) funnel.inquiries++
    if (firstBookedAt && firstBookedAt >= since) funnel.booked++
    if (firstSeatedAt && firstSeatedAt >= since) funnel.seated++
  }
  return funnel
}
