import { describe, it, expect, vi } from 'vitest'
import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core'

/**
 * THE HYGIENE STATEMENTS, RENDERED FOR REAL (P-03 — the
 * tests/journey/autonomy-sql.test.ts pattern). The sibling suites mock
 * `drizzle-orm` to assert RESULTS and are blind to how Postgres parses a
 * statement. This file renders every raw fragment the pass uses through the
 * real dialect and pins the one property that makes each parseable: no
 * untyped parameter where Postgres cannot infer a type, and the shape the
 * rule promises (the decayable statuses, the live-enrollment exclusion,
 * the GREATEST over every touch, the leading-sentence strip).
 */

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  // A real query builder, no connection — enough to BUILD the subquery
  // `decayCandidateWhere` embeds; nothing here ever executes.
  const qb = new QueryBuilder()
  return { schema, db: { select: (fields: never) => qb.select(fields) } }
})
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: vi.fn(),
  bumpProspectingCounter: vi.fn(),
  getProspectingCounter: vi.fn(),
  counterDay: vi.fn(),
  counterMonth: vi.fn(),
  stopActiveEnrollments: vi.fn(),
  pauseActiveEnrollments: vi.fn(),
  resumeVerifyPausedEnrollments: vi.fn(),
  clearSystemFollowUp: vi.fn(),
}))

import { decayCandidateWhere, lastTouchSql, stripRestingReasonSql, wakeSetSql } from '@/lib/services/prospect-hygiene'
import { HAVING_MORE_THAN_ONE, tenDigitPhoneSql } from '@/lib/services/prospect-dedupe'
import { territoryQueueOrderSql, territorySweptAtSql } from '@/lib/services/prospect-discovery'
import { dueForReverifyWhere, sweepBucketWhere, sweepCutoffs } from '@/lib/services/prospect-verify'
import { DECAYABLE_STATUSES } from '@/lib/db/schema/prospecting'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const dialect = new PgDialect()
const render = (q: unknown) => dialect.sqlToQuery(q as never)
const NOW = new Date('2026-11-10T12:00:00Z')
const CUTOFF = new Date('2026-08-12T12:00:00Z')

describe('the decay predicate', () => {
  it('reads the decayable statuses, excludes a live enrollment and a row a cold caller holds, anchors on the last touch else the birth, with a cast cutoff', () => {
    const { sql: text, params } = render(decayCandidateWhere(NOW, CUTOFF))
    expect(text).toContain('"prospect"."status" in ($1, $2, $3, $4)')
    expect(params.slice(0, 4)).toEqual([...DECAYABLE_STATUSES])
    expect(text).toMatch(/\("prospect"\."next_follow_up_at" is null or "prospect"\."next_follow_up_at" <= \$5\)/)
    // P-02: a row someone is dialling is being worked.
    expect(text).toContain('"prospect"."assigned_caller_id" is null')
    expect(text).toMatch(/not exists \(select 1 from "outreach_enrollment" where \("outreach_enrollment"\."prospect_id" = "prospect"\."id" and "outreach_enrollment"\."status" in \(\$6, \$7\)\)\)/)
    expect(params.slice(5, 7)).toEqual(['active', 'paused_ooo'])
    // The one raw comparison: a cast parameter, never an untyped $n.
    expect(text).toMatch(/COALESCE\(GREATEST\([\s\S]+\), "prospect"\."created_at"\) < \$8::timestamptz/)
    expect(params[7]).toBe(CUTOFF.toISOString())
    expect(params).toHaveLength(8)
  })

  it('"last touch" is the GREATEST of a sent touch, a call, an inbound event, a self-booked demo, the intent and the enrichment', () => {
    const { sql: text, params } = render(lastTouchSql())
    expect(text).toContain('SELECT MAX("outreach_touch_log"."sent_at") FROM "outreach_touch_log"')
    expect(text).toContain('"outreach_touch_log"."status" = \'sent\'')
    expect(text).toContain('SELECT MAX("prospect_call_log"."created_at") FROM "prospect_call_log"')
    expect(text).toContain('SELECT MAX("outreach_event"."occurred_at") FROM "outreach_event"')
    expect(text).toContain('SELECT MAX("prospect_meeting"."booked_at") FROM "prospect_meeting"')
    expect(text).toContain('"prospect"."intent_at"')
    expect(text).toContain('"prospect"."enriched_at"')
    expect(params).toEqual([])
  })
})

describe('the wake', () => {
  it('restores the remembered status only from the decayable set — every $n inside IN carries a cast', () => {
    const { sql: text, params } = render(wakeSetSql().status)
    expect(text).toBe(
      'CASE WHEN "prospect"."status" = \'dormant\' THEN (CASE WHEN "prospect"."dormant_from_status" IN ($1::text, $2::text, $3::text, $4::text) THEN "prospect"."dormant_from_status" ELSE \'enriched\' END) ELSE "prospect"."status" END',
    )
    expect(params).toEqual([...DECAYABLE_STATUSES])
    for (const m of Array.from(text.matchAll(/\$\d+/g))) {
      expect(text.slice(m.index! + m[0].length).startsWith('::'), `parameter ${m[0]} is bound without a cast`).toBe(true)
    }
  })

  it('clears the memory only on a resting row', () => {
    const { sql: text, params } = render(wakeSetSql().dormantFromStatus)
    expect(text).toBe('CASE WHEN "prospect"."status" = \'dormant\' THEN NULL ELSE "prospect"."dormant_from_status" END')
    expect(params).toEqual([])
  })

  it('strips only a LEADING resting sentence from quality_reasons, and only when it is an array', () => {
    const { sql: text, params } = render(stripRestingReasonSql())
    expect(text).toBe(
      'CASE WHEN jsonb_typeof("prospect"."quality_reasons") = \'array\' AND jsonb_array_length("prospect"."quality_reasons") > 0 AND ("prospect"."quality_reasons" ->> 0) LIKE \'No touch since %\' THEN "prospect"."quality_reasons" - 0 ELSE "prospect"."quality_reasons" END',
    )
    expect(params).toEqual([])
    expect(render(wakeSetSql().qualityReasons).sql).toBe(text)
  })
})

describe('the sweep’s group-by and the refresh clock', () => {
  it('HAVING count(*) > 1 — no parameters', () => {
    expect(render(HAVING_MORE_THAN_ONE)).toEqual({ sql: 'count(*) > 1', params: [] })
  })
  it('the phone KEY: the stored column as ten digits — an eleven-digit legacy row drops its leading 1, in SQL, with no parameters', () => {
    expect(render(tenDigitPhoneSql())).toEqual({
      sql: `regexp_replace(regexp_replace(coalesce("prospect"."phone", ''), '\\D', '', 'g'), '^1(\\d{10})$', '\\1')`,
      params: [],
    })
    // …and it is what every phone pre-filter compares against.
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const dedupe = readFileSync('lib/services/prospect-dedupe.ts', 'utf8')
    expect(dedupe).not.toMatch(/eq\(schema\.prospect\.phone,/)
    expect(dedupe).not.toMatch(/inArray\(schema\.prospect\.phone,/)
    expect(dedupe).not.toMatch(/groupBy\(schema\.prospect\.phone\)/)
    const discovery = readFileSync('lib/services/prospect-discovery.ts', 'utf8')
    expect(discovery).not.toMatch(/inArray\(schema\.prospect\.phone,/)
    expect(discovery).toContain('inArray(tenDigitPhoneSql(), phones)')
  })
  it('a territory is aged by its last refresh, else the end of its first sweep', () => {
    expect(render(territorySweptAtSql())).toEqual({
      sql: 'COALESCE("prospect_discovery_task"."last_refreshed_at", "prospect_discovery_task"."updated_at")',
      params: [],
    })
  })
  it('V10: the due territories are ORDERED by the most recent attempt of either kind — a refresh that threw goes to the back of the line without leaving it', () => {
    expect(render(territoryQueueOrderSql())).toEqual({
      sql: 'GREATEST("prospect_discovery_task"."last_refreshed_at", "prospect_discovery_task"."last_refresh_error_at", "prospect_discovery_task"."updated_at")',
      params: [],
    })
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const discovery = readFileSync('lib/services/prospect-discovery.ts', 'utf8')
    expect(discovery).toContain('lt(territorySweptAtSql(), cutoff)')
    expect(discovery).toContain('.orderBy(asc(territoryQueueOrderSql()))')
  })
})

describe('the re-verify sweep’s buckets (V8)', () => {
  const config = { ...PROSPECTING_DEFAULTS, hygiene: { ...PROSPECTING_DEFAULTS.hygiene, reverifyAfterDays: 60, parkedRecheckDays: 14 } }
  const cutoffs = sweepCutoffs(config, NOW)

  it('"due again" is the stale clock, or the PARKED clock on a parked row — one predicate', () => {
    const { sql: text, params } = render(dueForReverifyWhere(cutoffs))
    expect(text).toBe('("prospect"."verified_at" < $1 or ("prospect"."quality_band" = $2 and "prospect"."verified_at" < $3))')
    // A timestamp column binds its Date as ISO text — the two clocks, as given.
    expect(params).toEqual([cutoffs.staleCutoff.toISOString(), 'parked', cutoffs.parkedCutoff.toISOString()])
    expect(cutoffs.staleCutoff).toEqual(new Date('2026-09-11T12:00:00Z'))
    expect(cutoffs.parkedCutoff).toEqual(new Date('2026-10-27T12:00:00Z'))
  })

  it('the RESTING bucket re-checks a parked resting row on the parked clock its sentence promises — not reverifyAfterDays', () => {
    const { sql: text, params } = render(sweepBucketWhere('resting', cutoffs))
    expect(text).toBe(
      '("prospect"."status" = $1 and ("prospect"."verified_at" is null or ("prospect"."verified_at" < $2 or ("prospect"."quality_band" = $3 and "prospect"."verified_at" < $4))))',
    )
    expect(params).toEqual(['dormant', cutoffs.staleCutoff.toISOString(), 'parked', cutoffs.parkedCutoff.toISOString()])
  })

  it('the live buckets: never-verified enriched rows, then verified rows due again', () => {
    const unverified = render(sweepBucketWhere('unverified', cutoffs))
    expect(unverified.sql).toContain('"prospect"."status" in ($1, $2, $3, $4, $5)')
    expect(unverified.sql).toContain('"prospect"."verified_at" is null and "prospect"."enriched_at" is not null')
    const stale = render(sweepBucketWhere('stale', cutoffs))
    expect(stale.sql).toContain('"prospect"."verified_at" is not null')
    expect(stale.sql).toContain('"prospect"."quality_band" = $')
    expect(stale.params).toContain(cutoffs.parkedCutoff.toISOString())
    // …and the sweep reads exactly these three.
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const verify = readFileSync('lib/services/prospect-verify.ts', 'utf8')
    for (const bucket of ['unverified', 'stale', 'resting']) expect(verify).toContain(`sweepBucketWhere('${bucket}', cutoffs)`)
  })
})
