import 'server-only'
import { db, schema } from '@/lib/db'
import { clinicDayStart } from '@/lib/clinic-timezone'

/**
 * THE HUDDLE's day in the demo clinic (docs/daily-tools.md, slice H1).
 *
 * The demo's appointments are seeded ONCE, relative to the moment the demo
 * was created, and a resync never moves them — so a demo that has existed
 * for a month has nothing on today, nothing on yesterday, and a Huddle (and
 * an Overview "Today's chair") that reads as an empty room in the one
 * clinic that exists to show the product. This file gives the demo a
 * yesterday and a today on the CLINIC's calendar, refreshed on every resync
 * (every deploy).
 *
 * How it stays honest and small:
 *
 *  - SEVEN ROWS, FOREVER. Each has a deterministic id (the marker prefix +
 *    the org + a slot name) and is UPSERTED: a resync moves the same seven
 *    rows to the new yesterday / today and resets their status. Nothing
 *    accumulates, nothing is deleted, and the stories hold — Ethan's first
 *    visit stays his only visit, so the recap can keep welcoming him.
 *  - PERSONA-ANCHORED BY IDENTITY (the demo-org data rule): the caller
 *    passes the persona-aligned patient ids; a persona that is not on file
 *    is SKIPPED, never substituted with whoever happens to be in the org —
 *    real patients exist in the demo org.
 *  - A RECOGNISABLE MARKER: every id starts with DEMO_HUDDLE_APPT_PREFIX,
 *    and cleanupMisattributedDemoArtifacts removes any marker row found on
 *    a non-persona patient.
 *
 * Mason [11] is left out on purpose: his story is a lead who has never
 * booked. The personas' emails are RFC-reserved (example.com), which the
 * email layer never mails, so a reminder or a review ask raised by these
 * rows reaches nobody.
 */

export const DEMO_HUDDLE_APPT_PREFIX = 'appt_demohud_'

type Slot = {
  slot: string
  /** Index into the 15 personas (lib/services/demo-clinic/personas.ts). */
  persona: number
  /** A clinic-local day relative to today and a wall-clock hour on it… */
  day?: -1 | 0
  hour?: number
  /** …or a fixed number of days back, for the one older visit. */
  daysAgo?: number
  type: 'checkup' | 'cleaning' | 'consultation'
  status: 'completed' | 'no_show' | 'confirmed' | 'scheduled'
  provider: 'dentist' | 'hygienist'
  source: 'booking_widget' | 'manual' | 'invite' | 'phone'
  notes?: string
}

/**
 * Yesterday: a first visit that happened (Ethan), a returning patient who
 * was seen (Isabella — the older visit below is what makes her returning),
 * and one who did not make it (James). Today: a confirmed first visit
 * (Ava), one still to confirm whose birthday is this week (persona [2]),
 * and a clean row (persona [7], whose intake is on file).
 */
export const DEMO_HUDDLE_SLOTS: readonly Slot[] = [
  { slot: 'prior', persona: 10, daysAgo: 200, type: 'cleaning', status: 'completed', provider: 'hygienist', source: 'manual' },
  { slot: 'y1', persona: 9, day: -1, hour: 9, type: 'cleaning', status: 'completed', provider: 'hygienist', source: 'booking_widget', notes: 'First visit' },
  { slot: 'y2', persona: 10, day: -1, hour: 10.5, type: 'checkup', status: 'completed', provider: 'dentist', source: 'manual' },
  { slot: 'y3', persona: 13, day: -1, hour: 14, type: 'cleaning', status: 'no_show', provider: 'hygienist', source: 'invite' },
  { slot: 't1', persona: 12, day: 0, hour: 9, type: 'checkup', status: 'confirmed', provider: 'dentist', source: 'booking_widget', notes: 'New patient exam' },
  { slot: 't2', persona: 2, day: 0, hour: 11, type: 'cleaning', status: 'scheduled', provider: 'hygienist', source: 'manual' },
  { slot: 't3', persona: 7, day: 0, hour: 14, type: 'consultation', status: 'confirmed', provider: 'dentist', source: 'phone' },
]

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const VISIT_MS = 45 * 60 * 1000

export function demoHuddleAppointmentId(orgId: string, slot: string): string {
  return `${DEMO_HUDDLE_APPT_PREFIX}${orgId}_${slot}`
}

/** When a slot's visit starts, on the clinic's calendar. */
export function demoHuddleSlotStart(slot: Slot, now: Date, timeZone: string): Date {
  if (slot.daysAgo != null) {
    // Mid-morning on that clinic-local day — never a 3 AM visit.
    return new Date(clinicDayStart(now, timeZone, -slot.daysAgo).getTime() + 10 * HOUR_MS)
  }
  return new Date(clinicDayStart(now, timeZone, slot.day ?? 0).getTime() + (slot.hour ?? 9) * HOUR_MS)
}

/**
 * Upsert the demo's Huddle day. Returns how many rows were written. Only
 * writes — the caller resolves the personas, the location and the two
 * providers (the fresh seed already holds them; a resync looks them up).
 */
export async function seedDemoHuddleDay(input: {
  orgId: string
  /** Entry i = the patient whose identity is persona i, or null when absent. */
  personaPatientIds: ReadonlyArray<string | null>
  /** The persona roster, for the appointment's title only. */
  personaNames: ReadonlyArray<{ firstName: string; lastName: string } | undefined>
  locationId: string | null
  dentistId: string | null
  hygienistId: string | null
  now: Date
  timeZone: string
}): Promise<number> {
  const { orgId, now, timeZone } = input
  let written = 0
  for (const s of DEMO_HUDDLE_SLOTS) {
    const patientId = input.personaPatientIds[s.persona] ?? null
    // A missing persona → skip the seed. Never an arbitrary org patient.
    if (!patientId) continue
    const start = demoHuddleSlotStart(s, now, timeZone)
    const end = new Date(start.getTime() + VISIT_MS)
    const name = input.personaNames[s.persona]
    const confirmed = s.status === 'confirmed'
    const row = {
      patientId,
      locationId: input.locationId,
      providerId: s.provider === 'dentist' ? input.dentistId : input.hygienistId,
      title: name ? `${s.type} — ${name.firstName} ${name.lastName}` : s.type,
      startTime: start,
      endTime: end,
      type: s.type,
      status: s.status,
      notes: s.notes ?? null,
      source: s.source,
      confirmedAt: confirmed ? new Date(start.getTime() - DAY_MS) : null,
      confirmedVia: confirmed ? ('email' as const) : null,
      completedAt: s.status === 'completed' ? end : null,
      noShowedAt: s.status === 'no_show' ? end : null,
      cancelledAt: null,
      arrivedAt: null,
      seatedAt: null,
    }
    await db
      .insert(schema.appointment)
      .values({ id: demoHuddleAppointmentId(orgId, s.slot), organizationId: orgId, ...row })
      // The id is the row's identity: a resync MOVES the visit to the new
      // day and resets where it stands (someone marked today's done in a
      // demo; tomorrow it is yesterday's and must read as it was written).
      .onConflictDoUpdate({ target: schema.appointment.id, set: { ...row, updatedAt: now } })
    written++
  }
  return written
}
