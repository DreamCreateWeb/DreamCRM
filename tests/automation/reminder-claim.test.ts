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
/** When set, the next statement rejects with it — the DB going away mid-write. */
let failNext: Error | null = null

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params })
      if (failNext) {
        const err = failNext
        failNext = null
        throw err
      }
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
  logReminderSent,
  releaseReminderClaim,
} from '@/lib/services/appointments'
import { FORMS_REMINDER_TEMPLATE } from '@/lib/types/reminders'

const INPUT = {
  organizationId: 'org_1',
  appointmentId: 'appt_1',
  channel: 'email' as const,
  template: 'auto_reminder_24h',
}

beforeEach(() => {
  captured.length = 0
  nextRows = []
  failNext = null
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
    // The index predicate — ALL of it. A conflict clause that omits any part
    // of it is a 42P10 on every tick, and reminders stop entirely.
    expect(sql).toContain('"sent_by_user_id" is null')
    expect(sql).toContain('"template" is not null')
    expect(sql).toContain(`"template" <> '${FORMS_REMINDER_TEMPLATE}'`)
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

  it('a failed provider-id stamp NEVER unwinds into the caller', async () => {
    // If this threw, it would unwind into the SMS send helper's catch, the
    // engine would read `{ ok: false }` and RELEASE a claim for a text the
    // carrier already took — then send the patient a second one next tick.
    // Exactly the duplicate the whole mechanism exists to prevent.
    failNext = new Error('connection terminated')
    await expect(
      confirmReminderSent(claim, { providerMessageId: 'sms_abc' }),
    ).resolves.toBeUndefined()
  })
})

/**
 * THE WRITER GUARD.
 *
 * `claimAutomatedReminder` is not the only thing that writes an
 * automated-shaped row into this table — `logReminderSent` does too, and the
 * forms nudge logs through it with `sentByUserId: null`. A bare INSERT there is
 * the worst failure this table can produce: the message goes out, the write
 * raises 23505, the engine records nothing, and it does the whole thing again
 * on the next tick. Forever — because the forms dedup is a time WINDOW and the
 * row it would have to see is the one that never got written.
 */
describe('every automated-shaped write carries the conflict clause', () => {
  async function logForms() {
    nextRows = []
    await logReminderSent({
      organizationId: 'org_1',
      appointmentId: 'appt_1',
      channel: 'email',
      template: FORMS_REMINDER_TEMPLATE,
      sentByUserId: null,
    })
    return captured.find((c) =>
      c.sql.toLowerCase().startsWith('insert into "appointment_reminder_log"'),
    )!
  }

  it('logReminderSent does not send a bare INSERT', async () => {
    const insert = await logForms()
    expect(insert).toBeDefined()
    expect(insert.sql.toLowerCase()).toContain('on conflict')
    expect(insert.sql.toLowerCase()).toContain('do nothing')
  })

  it('the forms nudge sits OUTSIDE the index, so its windowed repeat still records', async () => {
    // PMS sync moves an appointment's start_time IN PLACE, so a visit pushed a
    // week out comes back around and a patient who still has not filled the
    // form is legitimately nudged again. Under the index that second write
    // would be an error; the index excludes the template by name.
    const insert = await logForms()
    expect(insert.sql).toContain(`"template" <> '${FORMS_REMINDER_TEMPLATE}'`)
    expect(insert.params).toContain(FORMS_REMINDER_TEMPLATE)
  })

  it('a manual staff send is outside the index too — repeat sends stay legal', async () => {
    nextRows = []
    await logReminderSent({
      organizationId: 'org_1',
      appointmentId: 'appt_1',
      channel: 'email',
      template: 'default_reminder',
      sentByUserId: 'user_1',
    })
    const insert = captured.find((c) =>
      c.sql.toLowerCase().startsWith('insert into "appointment_reminder_log"'),
    )!
    // sent_by_user_id is set, so the row falls outside the partial predicate.
    expect(insert.params).toContain('user_1')
    expect(insert.sql.toLowerCase()).toContain('"sent_by_user_id" is null')
  })
})

/**
 * Migrations auto-apply on boot and a failure keeps the previous version
 * serving — so a unique index that trips over rows the bug already wrote does
 * not just fail, it BLOCKS EVERY DEPLOY until someone cleans prod by hand.
 * The de-duplication has to be in the same file, ahead of the index.
 */
describe('migration 0160 — the de-dup runs before the guard', () => {
  const sql = readFileSync(join(process.cwd(), 'lib/db/migrations/0160_damp_luckman.sql'), 'utf8')

  it('drops any earlier index of the same name before creating this one', () => {
    // The predicate changed during review. A database carrying the earlier
    // draft has an index with this name and the WRONG predicate: a bare CREATE
    // fails and blocks boot, and leaving it would be worse — `ON CONFLICT`
    // matches on the predicate, so a stale one is a 42P10 on every claim.
    const dropAt = sql.indexOf('DROP INDEX IF EXISTS "appt_reminder_auto_touch_uq"')
    const createAt = sql.indexOf('CREATE UNIQUE INDEX "appt_reminder_auto_touch_uq"')
    expect(dropAt).toBeGreaterThanOrEqual(0)
    expect(dropAt).toBeLessThan(createAt)
  })

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
    expect(dedup).toContain('WHERE "sent_by_user_id" IS NULL')
    expect(dedup).toContain('AND "template" IS NOT NULL')
    // And never a forms nudge: those repeat legitimately inside their window,
    // so a "duplicate" there is real history, not a bug's leftovers.
    expect(dedup).toContain(`AND "template" <> '${FORMS_REMINDER_TEMPLATE}'`)
    // Keeps one row per group, deletes the rest.
    expect(dedup).toContain('rn > 1')
  })

  it('the index it builds and the rows it cleans describe the SAME set', () => {
    const dedup = sql.slice(0, sql.indexOf('CREATE UNIQUE INDEX'))
    const index = sql.slice(sql.indexOf('CREATE UNIQUE INDEX'))
    for (const clause of ['sent_by_user_id', 'template', FORMS_REMINDER_TEMPLATE]) {
      expect(dedup, clause).toContain(clause)
      expect(index, clause).toContain(clause)
    }
  })

  it('keeps the row carrying downstream state, then the earliest send', () => {
    expect(sql).toContain('("delivered_at" IS NOT NULL OR "replied_at" IS NOT NULL) DESC')
    expect(sql).toContain('"sent_at" ASC')
  })
})
