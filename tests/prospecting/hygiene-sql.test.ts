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

import { decayCandidateWhere, earlyRefreshWhere, lastTouchSql, stripRestingReasonSql, wakeSetSql } from '@/lib/services/prospect-hygiene'
import { HAVING_MORE_THAN_ONE, tenDigitPhoneSql } from '@/lib/services/prospect-dedupe'
import {
  CLOSED_CALL_OUTCOMES,
  hotTerritoriesQuery,
  pullForwardWhere,
  territoryPulledFirstSql,
  territoryQueueOrderSql,
  territoryRefreshDueWhere,
  territorySweptAtSql,
  zip3Sql,
} from '@/lib/services/prospect-discovery'
import {
  CHAIN_UNFLAG_CANDIDATES_PER_RUN,
  addressKeySql,
  chainGroupHaving,
  chainGroupableWhere,
  chainPhoneGroupWhere,
  chainResumeWhere,
  chainUnflagCandidateWhere,
  chainUnflagCandidatesQuery,
  websiteHostSql,
} from '@/lib/services/prospect-fit'
import { dueForReverifyWhere, sweepBucketWhere, sweepCutoffs } from '@/lib/services/prospect-verify'
import { BAD_PHONE_STATUSES, DECAYABLE_STATUSES } from '@/lib/db/schema/prospecting'
import { ADDRESS_WORDS, SUITE_FOLD_PATTERN, SUITE_TOKEN_PATTERN, addressKey } from '@/lib/prospect-fit'
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
    expect(discovery).toContain('territoryRefreshDueWhere(cutoff)')
    expect(discovery).toContain('.orderBy(asc(territoryPulledFirstSql()), asc(territoryQueueOrderSql()))')
  })
  it('D.2: "due" is aged past the clock OR pulled forward; a pulled territory goes first unless its pulled refresh already threw', () => {
    const { sql: text, params } = render(territoryRefreshDueWhere(CUTOFF))
    expect(text).toBe(
      '(COALESCE("prospect_discovery_task"."last_refreshed_at", "prospect_discovery_task"."updated_at") < $1 or "prospect_discovery_task"."refresh_pulled_at" is not null)',
    )
    expect(params).toEqual([CUTOFF])
    expect(render(territoryPulledFirstSql())).toEqual({
      sql: 'CASE WHEN "prospect_discovery_task"."refresh_pulled_at" IS NOT NULL AND ("prospect_discovery_task"."last_refresh_error_at" IS NULL OR "prospect_discovery_task"."last_refresh_error_at" < "prospect_discovery_task"."refresh_pulled_at") THEN 0 ELSE 1 END',
      params: [],
    })
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

// ── P-04: the chain groups and the callers' freshness pull ──────────────────

describe('the chain sweep’s fragments (P-04)', () => {
  it('the website host: the whole value lower-cased FIRST (an upper-case scheme never becomes the host — E.3), then scheme and www stripped, the first path / port / query cut — no parameters', () => {
    expect(render(websiteHostSql())).toEqual({
      sql: `regexp_replace(regexp_replace(lower("prospect"."website_url"), '^https?://', ''), '^(www\\.)?([^/:?#]+).*$', '\\2')`,
      params: [],
    })
    // 'HTTPS://Smile.com/x': lower → 'https://smile.com/x' → the scheme strips → 'smile.com'.
    const lowered = 'HTTPS://Smile.com/x'.toLowerCase().replace(/^https?:\/\//, '').replace(/^(www\.)?([^/:?#]+).*$/, '$2')
    expect(lowered).toBe('smile.com')
  })
  it('the address key (E.2): lower, the suite token and its value dropped, the street words folded from THE ONE table, the street NULLIF\'d to letters and digits (V8), ZIP5 appended — no parameters; the pure twin agrees on the pairs', () => {
    const { sql: text, params } = render(addressKeySql())
    expect(params).toEqual([])
    // V8: the street part is nullif'd BEFORE the ZIP joins it — a row with no
    // street has a NULL key (NULL || zip is NULL), and count(distinct) skips it.
    expect(text.startsWith(`nullif(regexp_replace(`)).toBe(true)
    expect(text).toContain(`lower(coalesce("prospect"."address_line1", ''))`)
    expect(text).toContain(`'\\m${SUITE_TOKEN_PATTERN}\\M\\.?\\s*#?\\s*[a-z0-9-]+', ' ', 'g')`)
    expect(text).toContain(`'#\\s*[a-z0-9-]+', ' ', 'g')`)
    for (const [word, abbr] of ADDRESS_WORDS) expect(text, word).toContain(`'\\m${word}\\M', '${abbr}', 'g')`)
    expect(text).toMatch(/, '\[\^a-z0-9\]', '', 'g'\), ''\) \|\| left\(regexp_replace\(coalesce\("prospect"\."postal_code", ''\), '\\D', '', 'g'\), 5\)$/)
    // Every $n would be untyped text here; there are none.
    expect(text).not.toMatch(/\$\d/)
    // The pure twin, over the pairs the rule promises.
    expect(addressKey('123 MAIN ST STE 200', '787011234')).toBe(addressKey('123 Main Street Suite 200', '78701'))
    expect(addressKey('100 Main St', '78701')).not.toBe(addressKey('200 Main St', '78701'))
    expect(addressKey(null, '78701')).toBeNull()
    expect(addressKey('', '78701')).toBeNull()
    // The size count keeps the suite: no suite strip in that key — the
    // unit-like tokens fold to one spelling instead (V4), in SQL as in TS.
    const kept = render(addressKeySql({ keepSuite: true })).sql
    expect(kept).not.toContain(SUITE_TOKEN_PATTERN)
    expect(kept).toContain(`'\\m${SUITE_FOLD_PATTERN}\\M\\.?\\s*#?\\s*', 'ste ', 'g')`)
    expect(kept).toContain(`'#\\s*', 'ste ', 'g')`)
    expect(kept.startsWith(`nullif(regexp_replace(`)).toBe(true)
    expect(SUITE_FOLD_PATTERN).toBe('(ste|unit|apt|rm)')
  })
  it('HAVING count(distinct address) >= the threshold, cast', () => {
    const { sql: text, params } = render(chainGroupHaving(3))
    // V8: the key is NULL for a street-less row, and count(distinct) skips NULL.
    expect(text).toMatch(/^count\(distinct nullif\(regexp_replace\([\s\S]+\), 5\)\) >= \$1::int$/)
    expect(params).toEqual([3])
  })
  it('membership (E.5): never a merged shell or a customer, never a row disqualified for retired / closed — a row disqualified AS A CHAIN still counts; the phone group drops a number the row says is not its own', () => {
    const groupable = render(chainGroupableWhere())
    expect(groupable.sql).toBe(
      '("prospect"."status" <> $1 and "prospect"."status" <> $2 and ("prospect"."status" <> $3 or "prospect"."suppressed_reason" is null or "prospect"."suppressed_reason" not in ($4, $5)))',
    )
    expect(groupable.params).toEqual(['merged', 'converted', 'disqualified', 'retired', 'closed'])
    const phone = render(chainPhoneGroupWhere())
    expect(phone.sql).toContain(groupable.sql)
    expect(phone.sql).toContain('"prospect"."phone" is not null')
    expect(phone.sql).toContain(`'^1(\\d{10})$', '\\1') <> ''`)
    expect(phone.sql).toMatch(/\("prospect"\."phone_status" is null or "prospect"\."phone_status" not in \(\$6, \$7, \$8\)\)\)$/)
    expect(phone.params.slice(5)).toEqual([...BAD_PHONE_STATUSES])
  })
  it('the un-flag’s candidates (V7): disqualified AS A CHAIN by the sweep — fit.chain shared_host / shared_phone on the stored jsonb, no override, no DSO match — filtered IN SQL, oldest write first, capped on the FILTERED set; 501 DSO-named rows never starve a sweep-flagged one', () => {
    const where = render(chainUnflagCandidateWhere())
    expect(where.sql).toBe(
      `("prospect"."status" = $1 and "prospect"."suppressed_reason" = $2 and "prospect"."verification" #>> '{fit,chain,status}' in ('shared_host', 'shared_phone') and coalesce("prospect"."verification" #>> '{fit,chainOverride,status}', '') = '' and coalesce("prospect"."verification" #>> '{fit,dso,status}', '') <> 'match')`,
    )
    expect(where.params).toEqual(['disqualified', 'chain'])
    // The statement itself: the predicate, the order, the cap — the cap
    // applies AFTER the filter, so a DSO-named row (the verify pass writes
    // suppressed_reason 'chain' for those too) takes no slot.
    const { sql: text, params } = render(chainUnflagCandidatesQuery().getSQL())
    expect(text).toBe(
      `select "id", "verification" from "prospect" where ${where.sql} order by "prospect"."updated_at" asc limit $3`,
    )
    expect(params).toEqual(['disqualified', 'chain', CHAIN_UNFLAG_CANDIDATES_PER_RUN])
    expect(CHAIN_UNFLAG_CANDIDATES_PER_RUN).toBe(500)
    // No untyped parameter: the jsonb comparisons are literals.
    expect(text).not.toMatch(/\$[4-9]/)
  })
  it('the resume (F.1): the LATEST drip the chain flag stopped on the row, only while no live drip exists — a subquery each, parameters typed by their columns', () => {
    const { sql: text, params } = render(chainResumeWhere('pros_1'))
    expect(text).toBe(
      '("outreach_enrollment"."id" in (select "id" from "outreach_enrollment" where ("outreach_enrollment"."prospect_id" = $1 and "outreach_enrollment"."status" = $2 and "outreach_enrollment"."stop_reason" = $3) order by "outreach_enrollment"."stopped_at" desc limit $4) and not exists (select 1 from "outreach_enrollment" where ("outreach_enrollment"."prospect_id" = $5 and "outreach_enrollment"."status" in ($6, $7))))',
    )
    expect(params).toEqual(['pros_1', 'stopped_manual', 'verify_chain', 1, 'pros_1', 'active', 'paused_ooo'])
  })
})

describe('callers steer freshness (P-04)', () => {
  it('the hunt tile’s early-refresh read (V6): a pull still set, on an ENABLED state only', () => {
    const { sql: text, params } = render(earlyRefreshWhere(['GA', 'TX']))
    expect(text).toBe('("prospect_discovery_task"."refresh_pulled_at" is not null and "prospect_discovery_task"."state" in ($1, $2))')
    expect(params).toEqual(['GA', 'TX'])
  })
  it('the territory key is the ZIP’s first three digits', () => {
    expect(render(zip3Sql())).toEqual({ sql: 'substr("prospect"."postal_code", 1, 3)', params: [] })
  })
  it('the hot territories: closed / disconnected outcomes inside the window, joined to the practice, grouped by state × zip3, HAVING ≥ the threshold (cast), distinct practices — with the closed-only count and the NEWEST call (D.3 / C27)', () => {
    const { sql: text, params } = render(hotTerritoriesQuery(CUTOFF, 3).getSQL())
    expect(text).toContain(`count(distinct case when "prospect_call_log"."outcome" = 'closed' then "prospect_call_log"."prospect_id" end)::int`)
    expect(text).toContain('max("prospect_call_log"."created_at")')
    expect(text).toContain('inner join "prospect" on "prospect_call_log"."prospect_id" = "prospect"."id"')
    expect(text).toContain('"prospect_call_log"."outcome" in ($1, $2)')
    expect(params.slice(0, 2)).toEqual([...CLOSED_CALL_OUTCOMES])
    expect(CLOSED_CALL_OUTCOMES).toEqual(['closed', 'disconnected'])
    expect(text).toContain('"prospect_call_log"."created_at" >= $3')
    // A timestamp column maps its Date to ISO text at the driver edge.
    expect(params[2]).toBe(CUTOFF.toISOString())
    expect(text).toContain('"prospect"."state" is not null and "prospect"."postal_code" is not null')
    expect(text).toContain('group by "prospect"."state", substr("prospect"."postal_code", 1, 3)')
    expect(text).toContain('having count(distinct "prospect_call_log"."prospect_id") >= $4::int')
    expect(params[3]).toBe(3)
    expect(text).toContain('count(distinct "prospect_call_log"."prospect_id")::int')
  })
  it('the pull (D.3) touches the territory’s finished tasks (the zip3 and its zip5 children), never one already pulled, and only when the last sweep is OLDER than the newest closed call — cast, never an untyped $n', () => {
    const newest = new Date('2026-11-09T18:00:00Z')
    const { sql: text, params } = render(pullForwardWhere('TX', '787', newest))
    expect(text).toBe(
      '("prospect_discovery_task"."state" = $1 and "prospect_discovery_task"."zip_prefix" like $2 and "prospect_discovery_task"."status" = $3 and "prospect_discovery_task"."refresh_pulled_at" is null and COALESCE("prospect_discovery_task"."last_refreshed_at", "prospect_discovery_task"."updated_at") < $4::timestamptz)',
    )
    expect(params).toEqual(['TX', '787%', 'done', newest.toISOString()])
  })
})
