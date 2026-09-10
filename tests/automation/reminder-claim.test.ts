import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * THE REMINDER CLAIM, RENDERED FOR REAL.
 *
 * The engine's own harness (reminder-engine.test.ts) models the claim in
 * JavaScript, which is the right way to assert the ORCHESTRATION and
 * completely blind to whether Postgres will accept the statement. This one
 * pins the statement itself, because the whole guard hangs on ONE property
 * that no JS mock can see: an `ON CONFLICT` target has to match a real unique
 * index, INCLUDING its predicate. Get the predicate wrong and Postgres raises
 * 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
 * specification") on every claim — which the engine would count as a lost
 * claim and NO reminder would ever go out again.
 *
 * So the service runs against drizzle's pg-proxy driver: the real dialect,
 * the real schema, the real SQL — no database required.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []
/** Rows the next statement resolves with (a claim insert returns [] on conflict). */
let nextRows: unknown[] = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params })
      return { rows: nextRows as never }
    },
    { schema },
  )
  return { db, schema }
})
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn(async () => true) }))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/New_York'),
}))
vi.mock('@/lib/services/pms', () => ({
  queueAppointmentWriteBack: vi.fn(async () => {}),
  queueAppointmentStatusWriteBack: vi.fn(async () => {}),
}))

import {
  claimAutomatedReminder,
  confirmReminderSent,
  releaseReminderClaim,
} from '@/lib/services/appointments'

const INPUT = {
  organizationId: 'org_1',
  appointmentId: 'appt_1',
  channel: 'email' as const,
  template: 'auto_reminder_24h',
}

beforeEach(() => {
  captured.length = 0
  nextRows = []
})

describe('claimAutomatedReminder — the statement Postgres actually receives', () => {
  it('conflicts on (appointment_id, template) with the partial index’s own predicate', async () => {
    nextRows = [{ id: 'rem_1' }]
    await claimAutomatedReminder(INPUT)

    expect(captured).toHaveLength(1)
    const sql = captured[0].sql.toLowerCase()
    expect(sql).toContain('insert into "appointment_reminder_log"')
    // The target columns, in the index's order.
    expect(sql).toMatch(/on conflict \(\s*"appointment_id",\s*"template"\s*\)/)
    // The index predicate, without which this is a 42P10 on every tick.
    expect(sql).toContain('"sent_by_user_id" is null and "appointment_reminder_log"."template" is not null')
    expect(sql).toContain('do nothing')
    // It must return the row, or a lost claim is indistinguishable from a won
    // one and the engine would send on both.
    expect(sql).toContain('returning')
  })

  it('claims as an AUTOMATED send — a staff row would sit outside the index', async () => {
    nextRows = [{ id: 'rem_1' }]
    const claim = await claimAutomatedReminder(INPUT)
    expect(claim).not.toBeNull()
    // sent_by_user_id is bound null: the partial index only covers automated
    // rows, so claiming as a person would silently opt out of the guard.
    expect(captured[0].params).toContain(null)
    expect(captured[0].params).toContain('auto_reminder_24h')
    expect(captured[0].params).toContain('appt_1')
  })

  it('returns null when the row already exists — nothing to send', async () => {
    nextRows = []
    expect(await claimAutomatedReminder(INPUT)).toBeNull()
  })

  it('hands back the id the caller must confirm or release', async () => {
    nextRows = [{ id: 'ignored-by-the-caller' }]
    const claim = await claimAutomatedReminder(INPUT)
    expect(claim).toMatchObject({
      organizationId: 'org_1',
      appointmentId: 'appt_1',
      channel: 'email',
      template: 'auto_reminder_24h',
    })
    expect(claim!.id).toBeTruthy()
  })
})

describe('confirmReminderSent / releaseReminderClaim', () => {
  const claim = {
    id: 'rem_1',
    organizationId: 'org_1',
    appointmentId: 'appt_1',
    channel: 'sms' as const,
    template: 'auto_reminder_24h',
  }

  it('stamps the provider message id so a delivery receipt can find the row', async () => {
    await confirmReminderSent(claim, { providerMessageId: 'sms_abc' })
    const update = captured.find((c) => c.sql.toLowerCase().startsWith('update'))
    expect(update).toBeDefined()
    expect(update!.sql.toLowerCase()).toContain('"provider_message_id"')
    expect(update!.params).toContain('sms_abc')
    // Scoped by org as well as id — the tenant filter is not optional here.
    expect(update!.params).toContain('org_1')
  })

  it('writes no UPDATE at all for an email send (there is no receipt key)', async () => {
    await confirmReminderSent({ ...claim, channel: 'email' })
    expect(captured.filter((c) => c.sql.toLowerCase().startsWith('update'))).toHaveLength(0)
  })

  it('narrates the send in the action ledger only once it has gone out', async () => {
    const { recordAction } = await import('@/lib/services/action-ledger')
    vi.mocked(recordAction).mockClear()
    // pg-proxy hands drizzle POSITIONAL rows, in the select's own order:
    // patientId, startTime, firstName.
    nextRows = [['pat_1', new Date('2026-06-11T14:00:00Z'), 'Sam']]
    await confirmReminderSent({ ...claim, channel: 'email' })
    expect(vi.mocked(recordAction)).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', capability: 'appointment_reminder' }),
    )
  })

  it('releases by id AND org, and never throws the batch', async () => {
    await releaseReminderClaim(claim)
    const del = captured.find((c) => c.sql.toLowerCase().startsWith('delete'))
    expect(del).toBeDefined()
    expect(del!.params).toEqual(expect.arrayContaining(['org_1', 'rem_1']))
  })
})

/**
 * Migrations auto-apply on boot and a failure keeps the previous version
 * serving — so a unique index that trips over rows the bug already wrote does
 * not just fail, it BLOCKS EVERY DEPLOY until someone cleans prod by hand.
 * The de-duplication has to be in the same file, ahead of the index.
 */
describe('migration 0160 — the de-dup runs before the guard', () => {
  const sql = readFileSync(join(process.cwd(), 'lib/db/migrations/0160_lucky_dark_beast.sql'), 'utf8')

  it('deletes duplicate automated rows before creating the unique index', () => {
    const deleteAt = sql.indexOf('DELETE FROM "appointment_reminder_log"')
    const indexAt = sql.indexOf('CREATE UNIQUE INDEX "appt_reminder_auto_touch_uq"')
    expect(deleteAt).toBeGreaterThanOrEqual(0)
    expect(indexAt).toBeGreaterThanOrEqual(0)
    expect(deleteAt).toBeLessThan(indexAt)
    // Two statements, so the second can't run inside the first's snapshot.
    expect(sql).toContain('statement-breakpoint')
  })

  it('de-dups exactly the rows the index covers — never a staff or ad-hoc send', () => {
    const dedup = sql.slice(0, sql.indexOf('CREATE UNIQUE INDEX'))
    expect(dedup).toContain('PARTITION BY "appointment_id", "template"')
    expect(dedup).toContain('WHERE "sent_by_user_id" IS NULL AND "template" IS NOT NULL')
    // Keeps one row per group, deletes the rest.
    expect(dedup).toContain('rn > 1')
  })

  it('keeps the row carrying downstream state, then the earliest send', () => {
    expect(sql).toContain('("delivered_at" IS NOT NULL OR "replied_at" IS NOT NULL) DESC')
    expect(sql).toContain('"sent_at" ASC')
  })
})
