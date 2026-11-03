import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE G5-31 TRAP, RENDERED TWICE (ML-27).
 *
 * The refresh window means the SAME appointment can legitimately be nudged
 * for its paperwork more than once (the rule ages a submission out; PMS sync
 * moves a visit in place). Every one of those sends is logged as an
 * automated, null-sentBy `forms_intake` row — exactly the shape the
 * `appt_reminder_auto_touch_uq` partial index guards. A template the index
 * did NOT exclude by name would cap intake sends at one per appointment
 * forever: the email goes out, the write raises 23505, nothing is recorded,
 * and it does it again next tick.
 *
 * So: the forms nudge keeps riding FORMS_REMINDER_TEMPLATE (no new template
 * key), the schema's index predicate excludes it by name, and the real
 * insert — rendered through drizzle's pg-proxy driver, the real dialect —
 * is sent TWICE for one appointment and carries the conflict clause both
 * times. Harness: tests/automation/reminder-claim.test.ts.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params })
      return { rows: [] }
    },
    { schema },
  )
  return { db, schema }
})
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn(async () => true) }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/services/pms', () => ({
  queueAppointmentWriteBack: vi.fn(async () => {}),
  queueAppointmentStatusWriteBack: vi.fn(async () => {}),
}))

import { logReminderSent } from '@/lib/services/appointments'
import { FORMS_REMINDER_TEMPLATE } from '@/lib/types/reminders'

beforeEach(() => {
  captured.length = 0
})

describe('the forms nudge logged twice for one appointment', () => {
  it('both inserts carry the conflict clause whose predicate excludes forms_intake BY NAME — so the second write records instead of raising', async () => {
    const input = {
      organizationId: 'org_1',
      appointmentId: 'appt_1',
      channel: 'email' as const,
      template: FORMS_REMINDER_TEMPLATE,
      sentByUserId: null,
    }
    await logReminderSent(input)
    await logReminderSent(input)

    const inserts = captured.filter((c) => c.sql.toLowerCase().startsWith('insert into "appointment_reminder_log"'))
    expect(inserts).toHaveLength(2)
    for (const insert of inserts) {
      const sql = insert.sql.toLowerCase()
      expect(sql).toContain('on conflict')
      expect(sql).toContain('do nothing')
      expect(sql).toContain(`"template" <> '${FORMS_REMINDER_TEMPLATE}'`)
      expect(insert.params).toContain(FORMS_REMINDER_TEMPLATE)
      expect(insert.params).toContain('appt_1')
      expect(insert.params).toContain(null)
    }
  })

  it('the cron rides FORMS_REMINDER_TEMPLATE — no new null-sentBy template the index would cap', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/services/reminder-automation.ts'), 'utf8')
    const formsBlock = engine.slice(engine.indexOf('export async function runDueFormReminders'))
    expect(formsBlock).toContain('template: FORMS_REMINDER_TEMPLATE')
    expect(formsBlock).not.toMatch(/template:\s*'intake_sent'/)
  })

  it('the schema’s partial index names the forms template in its exclusion', () => {
    const schema = readFileSync(join(process.cwd(), 'lib/db/schema/clinic.ts'), 'utf8')
    const at = schema.indexOf("uniqueIndex('appt_reminder_auto_touch_uq')")
    expect(at).toBeGreaterThan(0)
    expect(schema.slice(at, at + 400)).toContain('FORMS_REMINDER_TEMPLATE')
  })
})
