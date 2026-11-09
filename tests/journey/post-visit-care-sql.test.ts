import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE AFTERCARE CLAIM, RENDERED FOR REAL (ML-28 — the double-insert boundary).
 *
 * post-visit-care.test.ts models the claim in JavaScript, which is the right
 * way to assert the RULE and completely blind to whether Postgres will accept
 * the statement. The whole once-per-visit guard hangs on ONE property no JS
 * mock can see: the claim's `ON CONFLICT` target has to match the partial
 * unique index `appt_reminder_auto_touch_uq` INCLUDING its predicate, and the
 * aftercare template has to be one that predicate covers (sent_by_user_id
 * null, template not null, template <> 'forms_intake'). Get either wrong and
 * every evening either raises 42P10 (no note ever goes out) or inserts freely
 * (every tick sends again).
 *
 * So the generator runs here against drizzle's pg-proxy driver — the real
 * dialect, the real schema, the real SQL, no database — TWICE for the same
 * visit: the first insert returns its row (claimed), the second returns
 * nothing (the index won), and exactly one email leaves.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []
/** Scripted answers: how many claim inserts have been answered so far. */
let claimInserts = 0

const TZ = 'America/Chicago'
const ORG = 'org_1'

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params })
      if (/^insert into "appointment_reminder_log"/i.test(sql)) {
        claimInserts++
        // First claim wins its row; the second loses on the index → no rows.
        return { rows: claimInserts === 1 ? [['rem_1']] : [] }
      }
      if (/from "clinic_profile"/i.test(sql)) return { rows: [[null]] }
      if (/from "appointment"/i.test(sql)) {
        // id, type, status, start_time, patient_id, first_name, last_name, email, is_active
        return {
          rows: [['appt_1', 'cleaning', 'completed', '2026-07-30T15:00:00.000', 'pat_1', 'Maria', 'Lopez', 'maria@example.com', 1]],
        }
      }
      return { rows: [] }
    },
    { schema },
  )
  return { db, schema }
})
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn(async () => true) }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => TZ) }))
vi.mock('@/lib/services/pms', () => ({
  queueAppointmentWriteBack: vi.fn(async () => {}),
  queueAppointmentStatusWriteBack: vi.fn(async () => {}),
}))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn(async () => {}) }))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Acme Dental <acme@dreamcreatestudio.com>',
    replyTo: 'acme@in.dreamcreatestudio.com',
    name: 'Acme Dental',
    timeZone: TZ,
  })),
}))
const mail = vi.hoisted(() => ({ deliver: vi.fn(async (_m: Record<string, unknown>) => {}) }))
vi.mock('@/lib/email', () => ({
  deliver: (m: Record<string, unknown>) => mail.deliver(m),
  patientEmailShell: () => '<shell/>',
}))

import { generatePostVisitCare } from '@/lib/services/proposal-generators/post-visit-care'
import { FORMS_REMINDER_TEMPLATE } from '@/lib/types/reminders'

// 6:30 PM Thursday 2026-07-30 in Chicago (CDT).
const EVENING = new Date('2026-07-30T23:30:00Z')

beforeEach(() => {
  captured.length = 0
  claimInserts = 0
  mail.deliver.mockClear()
})

describe('the aftercare claim — the statement Postgres actually receives', () => {
  it('two evening ticks render the insert twice; the index wins the second and one email leaves', async () => {
    await generatePostVisitCare(ORG, EVENING, TZ)
    await generatePostVisitCare(ORG, EVENING, TZ)

    const inserts = captured.filter((c) => /^insert into "appointment_reminder_log"/i.test(c.sql))
    expect(inserts).toHaveLength(2)
    for (const ins of inserts) {
      // The conflict target is the partial index's own columns AND predicate —
      // anything less raises 42P10 on every claim.
      expect(ins.sql).toMatch(/on conflict \("appointment_id","template"\)/i)
      expect(ins.sql).toMatch(/where .*"sent_by_user_id" is null and .*"template" is not null and .*"template" <> 'forms_intake'/i)
      expect(ins.sql).toMatch(/do nothing/i)
      expect(ins.sql).toMatch(/returning/i)
      // The row the index covers: an automated email touch under the
      // aftercare template for THIS visit — never the forms nudge's key.
      expect(ins.params).toContain('aftercare')
      expect(ins.params).toContain('email')
      expect(ins.params).toContain('appt_1')
      expect(ins.params).toContain(ORG)
      expect(ins.params).not.toContain(FORMS_REMINDER_TEMPLATE)
    }
    // Exactly one note went out across both ticks.
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    expect(mail.deliver.mock.calls[0][0]).toMatchObject({ to: 'maria@example.com', subject: 'After your cleaning today' })
    // Nothing was deleted: the claim held (a release only follows a failed send).
    expect(captured.some((c) => /^delete from "appointment_reminder_log"/i.test(c.sql))).toBe(false)
  })

  it('the visit read is tenant-scoped and keyed on today’s clinic-local day and a completed status', async () => {
    await generatePostVisitCare(ORG, EVENING, TZ)
    const read = captured.find((c) => /from "appointment"/i.test(c.sql))!
    expect(read.sql).toMatch(/inner join "patient"/i)
    expect(read.sql).toMatch(/"appointment"\."organization_id" = \$\d+/)
    expect(read.sql).toMatch(/"appointment"\."status" = \$\d+/)
    expect(read.sql).toMatch(/"appointment"\."start_time" >= \$\d+/)
    expect(read.sql).toMatch(/"appointment"\."start_time" < \$\d+/)
    expect(read.sql).toMatch(/"patient"\."is_active" = \$\d+/)
    expect(read.params).toContain(ORG)
    expect(read.params).toContain('completed')
    // Thursday's clinic-local day in Chicago: midnight CDT is 05:00Z.
    const stamps = read.params.filter((p): p is string => typeof p === 'string' && /^2026-07-3/.test(p))
    expect(stamps.some((s) => s.startsWith('2026-07-30 05:00') || s.startsWith('2026-07-30T05:00'))).toBe(true)
    expect(stamps.some((s) => s.startsWith('2026-07-31 05:00') || s.startsWith('2026-07-31T05:00'))).toBe(true)
  })
})
