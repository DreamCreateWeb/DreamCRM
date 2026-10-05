import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { campaignEvents } from '@/lib/db/schema/domain'

/**
 * The frequency cap's read path (R1·S5 ledger entry, fixed 2026-10-05,
 * migration 0168).
 *
 * `partitionByFrequencyCap` and `partitionByPriorAutomationSend` count a
 * PERSON's `type = 'sent'` rows, keyed by patient_id OR recipient_email. Every
 * earlier index on campaign_events led with campaign_id, so that read scanned
 * the table on every send. Two partial indexes close it — two because the
 * predicate is an OR and Postgres can only BitmapOr it when both arms are
 * indexed.
 *
 * What is worth freezing is the PREDICATE and the PAIR: a future
 * `db:generate` that re-emits these as plain indexes (dropping the WHERE) or
 * keeps only one of them would leave an index that looks like the fix and
 * isn't. So the schema is read through drizzle, not by grep, and the
 * journaled SQL is pinned to it.
 */

const MIG_DIR = resolve(process.cwd(), 'lib/db/migrations')
const PATIENT_IDX = 'campaign_events_sent_patient_idx'
const EMAIL_IDX = 'campaign_events_sent_email_idx'

function journaledSql(): string {
  const journal = JSON.parse(readFileSync(join(MIG_DIR, 'meta/_journal.json'), 'utf8')) as {
    entries: Array<{ tag: string }>
  }
  return journal.entries
    .map((e) => {
      const f = join(MIG_DIR, `${e.tag}.sql`)
      return existsSync(f) ? readFileSync(f, 'utf8') : ''
    })
    .join('\n')
}

describe("the frequency cap's per-person partial indexes", () => {
  const indexes = getTableConfig(campaignEvents).indexes

  it('the schema declares both arms of the OR, each partial on type = sent', () => {
    for (const [name, lead] of [
      [PATIENT_IDX, 'patient_id'],
      [EMAIL_IDX, 'recipient_email'],
    ] as const) {
      const idx = indexes.find((i) => i.config.name === name)
      expect(idx, name).toBeDefined()
      expect(idx!.config.unique, `${name} is a lookup, not a constraint`).toBe(false)
      const cols = idx!.config.columns.map((c) => ('name' in c ? c.name : String(c)))
      expect(cols, `${name} leads with the cap key, then the window`).toEqual([lead, 'occurred_at'])
      expect(idx!.config.where, `${name} must be partial`).toBeDefined()
    }
  })

  it('the journaled migration carries the same two indexes WITH the predicate', () => {
    const sql = journaledSql()
    for (const [name, lead] of [
      [PATIENT_IDX, 'patient_id'],
      [EMAIL_IDX, 'recipient_email'],
    ] as const) {
      const re = new RegExp(
        `CREATE INDEX "${name}" ON "campaign_events" USING btree \\("${lead}","occurred_at"\\) WHERE "campaign_events"\\."type" = 'sent';`,
      )
      expect(sql, `${name} in a journaled migration, partial on type = 'sent'`).toMatch(re)
    }
  })

  it('nothing re-created either index without the predicate', () => {
    const sql = journaledSql()
    for (const name of [PATIENT_IDX, EMAIL_IDX]) {
      const creates = sql.match(new RegExp(`CREATE INDEX "${name}"[^;]*;`, 'g')) ?? []
      expect(creates.length, `${name} created exactly once`).toBe(1)
      expect(creates[0]).toContain("WHERE")
    }
  })
})
