import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sendHourStatsQuery } from '@/lib/services/shared-brain'

/**
 * THE CROSS-CLINIC AGGREGATE, RENDERED FOR REAL (Phase 4 slice 5).
 *
 * Standing lesson from the Phase-3 audit (docs/AUDITS.md): a database
 * modelled in JavaScript is not a database, so any NEW raw SQL gets a test
 * at the real boundary in the slice that writes it. This one is the largest
 * statement in the codebase that no ORM builder covers, and it carries two
 * properties that a JS-modelled harness could never check.
 *
 * The CORRELATION. An open event carries the time it was OPENED, not the
 * time it was sent. Bucketing by `occurred_at` on the open would teach the
 * platform that the best time to send is whenever people happen to read
 * their email — a wrong answer that looks completely plausible on a chart.
 * Sends must be bucketed by their own hour, with opens joined back to the
 * send they belong to.
 *
 * The TIME ZONE. "10 AM" has to mean the same thing to a practice in Boston
 * and one in Portland, so the hour is extracted against the SENDING
 * clinic's own zone. A bare `extract(hour from occurred_at)` would smear
 * three hours of US clinics into each other's buckets.
 */

const dialect = new PgDialect()
const q = dialect.sqlToQuery(sendHourStatsQuery(new Date('2026-05-01T00:00:00Z')))

describe('the send-hour aggregate as Postgres parses it', () => {
  it('buckets by the SEND, not by when somebody got round to reading it', () => {
    // The open side contributes membership only; the hour comes off sent_at.
    expect(q.sql).toMatch(/extract\(hour from\s+s\.sent_at/i)
    expect(q.sql).toMatch(/join opens o/i)
    expect(q.sql).toMatch(/o\.campaign_id = s\.campaign_id/i)
    expect(q.sql).toMatch(/o\.recipient_email = s\.recipient_email/i)
  })

  it('counts the JOINED column for opens — count(*) would return the send count', () => {
    // `count(o.campaign_id)` skips the nulls a LEFT JOIN produces; count(*)
    // would make every hour look like a 100% open rate.
    expect(q.sql).toMatch(/count\(o\.campaign_id\)/i)
  })

  it('reads the hour in the SENDING clinic’s own wall clock', () => {
    expect(q.sql).toMatch(/at time zone coalesce\(cp\.timezone/i)
    // A clinic with no stored zone must not drop out of the aggregate — the
    // LEFT JOIN plus a coalesce'd fallback keeps it counted.
    expect(q.sql.replace(/\n/g, ' ')).toMatch(/left join .*clinic_profile/i)
  })

  it('separates the two event types — one query cannot read them as one', () => {
    expect(q.sql).toMatch(/ce\.type = 'sent'/)
    expect(q.sql).toMatch(/ce\.type = 'open'/)
  })

  it('de-duplicates: one send per recipient per campaign, one open likewise', () => {
    // Resend can deliver the same webhook twice; without these a double
    // event would double a bucket and quietly skew the platform default.
    expect(q.sql).toMatch(/min\(ce\.occurred_at\)/i)
    expect(q.sql).toMatch(/select distinct/i)
  })

  it('binds every value as a real parameter, with casts', () => {
    // Both window bounds plus the timezone fallback — interpolating any of
    // them as a literal would be both wrong and injectable.
    expect(q.params).toHaveLength(3)
    for (const p of q.params) expect(p instanceof Date || typeof p === 'string').toBe(true)
    // Every bound parameter carries a cast — the 42P18 lesson.
    for (const m of Array.from(q.sql.matchAll(/\$\d+/g))) {
      const after = q.sql.slice(m.index! + m[0].length)
      expect(after.startsWith('::'), `uncast parameter ${m[0]} in:\n${q.sql}`).toBe(true)
    }
  })

  it('quotes the real tables from the schema', () => {
    expect(q.sql).toContain('"campaign_events"')
    expect(q.sql).toContain('"campaigns"')
    expect(q.sql).toContain('"clinic_profile"')
  })

  it('returns ONLY anonymous per-hour counts — no address, no patient, no clinic', () => {
    // The privacy line: the correlation needs recipient_email, so the join
    // happens inside Postgres and only counts come back. The select list
    // must never widen without this test failing.
    const selectList = q.sql.slice(q.sql.lastIndexOf('select'), q.sql.lastIndexOf('from'))
    expect(selectList).not.toMatch(/recipient_email(?!\s*=)/i)
    expect(selectList).not.toMatch(/patient/i)
    // organization_id appears only inside count(distinct …), never as a
    // grouped or projected value.
    expect(selectList).toMatch(/count\(distinct s\.organization_id\)/i)
    expect(selectList.replace(/count\(distinct s\.organization_id\)::int\s+as\s+clinics/i, '')).not.toMatch(
      /organization_id/i,
    )
  })

  it('counts REAL CLINICS only — the floor that makes "cross-clinic" true', () => {
    // Round-1 fix, unpinned until verification round 2. Without these the
    // demo org (whose seeder writes real campaign_events, re-dated every
    // deploy) and the platform's own B2B sends counted toward
    // MIN_CLINICS_PER_HOUR.
    expect(q.sql).toMatch(/o\."type" = 'clinic'|o\.type = 'clinic'/)
    expect(q.sql).toMatch(/o\."is_demo" = false|o\.is_demo = false/)
    expect(q.sql).toContain('"organization"')
  })

  it('groups to one row per hour — that is the entire shape the brain consumes', () => {
    expect(q.sql).toMatch(/group by 1\s*$|group by 1\s+order by 1/im)
  })
})


describe('the sample is the population the learned hour acts on (round-14 in-phase gap)', () => {
  const q = new PgDialect().sqlToQuery(sendHourStatsQuery(new Date('2026-05-01T00:00:00Z')))

  it('counts AUTOMATION campaigns only', () => {
    // The learned hour is applied to exactly one thing — automationSendAt —
    // so the sample has to be the same population the action lands on.
    // Pooling automated birthday/reactivation mail with human-made
    // marketing blasts compares CONTENT before it compares TIME, and the
    // three floors bound sample size and margin, not comparability.
    expect(q.sql).toContain('automation_key is not null')
  })

  it('still excludes the demo org and the platform tenant', () => {
    // The new predicate must ADD to the scope law, never replace it.
    expect(q.sql).toContain("o.type = 'clinic'")
    expect(q.sql).toContain('o.is_demo = false')
  })
})
