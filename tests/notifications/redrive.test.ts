import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'

/**
 * THE RE-DRIVE (ML-32): a staff alert email that failed to send is retried.
 *
 * `email_sent_at` (DREAMCRM-106) made "the email never went out" a state the
 * row could say, and then only a keyed replay ever acted on it — nearly no
 * notification carries a key, so for nearly all of them the state was
 * recorded and ignored. `redriveFailedNotificationEmails` is the scheduled
 * sweep that reads it. What this file pins:
 *
 *   - `owesEmail` is ONE predicate: the recipient's CURRENT prefs decide,
 *     the same way `notify()` decided at dispatch (the matrix below);
 *   - the backoff is a function of `created_at` + attempts — 5, 10, 20 min;
 *   - the cap: a row at MAX attempts is never read, the last failure counts
 *     as exhausted;
 *   - a landed re-send stamps `email_sent_at`; a failed one bumps
 *     `email_attempts` IN SQL and remembers the error — both keyed by ROW ID;
 *   - the sweep is org-agnostic (no tenant filter on the read) and still
 *     skips a shut-down clinic and never reads a demo org's rows;
 *   - a failure reports one strike for that clinic under `staff_alert`.
 *
 * Rendered through drizzle's real dialect (pg-proxy) rather than a mocked
 * `db`, because most of what matters here is the predicate — the window, the
 * cap, the demo exclusion and the id keying all live in the WHERE.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []
let windowRows: unknown[][] = []
const emailState = { sent: [] as unknown[], throws: false }
const strikes: Array<[string, string]> = []
let shutDown = new Set<string>()

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const db = drizzle(async (sql, params, method) => {
    captured.push({ sql, params })
    if (/^select .*from "notifications"/i.test(sql)) return { rows: method === 'all' ? windowRows : [] }
    return { rows: [] }
  })
  return { schema, db }
})
vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(async (input: unknown) => {
    if (emailState.throws) throw new Error('The email service didn’t respond in time, so this message hasn’t gone out.')
    emailState.sent.push(input)
  }),
}))
vi.mock('@/lib/services/billing-state', () => ({
  listShutDownOrgIds: vi.fn(async () => shutDown),
}))
vi.mock('@/lib/services/engine-failures', () => ({
  reportAutomationFailure: vi.fn(async (org: string, key: string) => {
    strikes.push([org, key])
    return true
  }),
}))

import {
  owesEmail,
  redriveDueAt,
  redriveFailedNotificationEmails,
  REDRIVE_BASE_DELAY_MS,
} from '@/lib/services/notifications'
import { MAX_NOTIFICATION_EMAIL_ATTEMPTS } from '@/lib/types/notifications'

const NOW = new Date('2026-11-03T15:00:00Z')
const MIN = 60_000

const PREFS_URGENT = { comments: true, candidates: true, offers: false, emailMode: 'urgent', pushNothing: false }

/** One row of the window query, in the SELECT's column order. */
function row(over: Partial<{
  id: number
  userId: string
  organizationId: string | null
  bucket: string
  type: string
  title: string
  body: string | null
  linkPath: string | null
  createdAt: Date
  emailAttempts: number
  email: string | null
  name: string | null
  prefs: { comments: boolean; candidates: boolean; offers: boolean; emailMode: string; pushNothing: boolean } | null
}> = {}): unknown[] {
  const r = {
    id: 7,
    userId: 'u1',
    organizationId: 'org_1',
    bucket: 'comments',
    type: 'payment_failed',
    title: 'Payment failed',
    body: 'A card was declined.',
    linkPath: '/payments',
    createdAt: new Date(NOW.getTime() - 30 * MIN),
    emailAttempts: 0,
    email: 'owner@clinic.example',
    name: 'Dr. Lee',
    prefs: PREFS_URGENT,
    ...over,
  }
  const p = r.prefs
  return [
    r.id,
    r.userId,
    r.organizationId,
    r.bucket,
    r.type,
    r.title,
    r.body,
    r.linkPath,
    r.createdAt.toISOString(),
    r.emailAttempts,
    r.email,
    r.name,
    p?.comments ?? null,
    p?.candidates ?? null,
    p?.offers ?? null,
    p?.emailMode ?? null,
    p?.pushNothing ?? null,
  ]
}

const find = (re: RegExp) => captured.filter((c) => re.test(c.sql))

beforeEach(() => {
  captured.length = 0
  windowRows = []
  emailState.sent.length = 0
  emailState.throws = false
  strikes.length = 0
  shutDown = new Set()
})

describe('owesEmail — the one predicate', () => {
  const urgentRow = { bucket: 'comments', type: 'payment_failed' } // urgent in the registry
  const routineRow = { bucket: 'comments', type: 'portal_booking' } // not urgent

  it.each([
    // mode        row         bucket on  paused  owes
    ['all', urgentRow, true, false, true],
    ['all', routineRow, true, false, true],
    ['urgent', urgentRow, true, false, true],
    ['urgent', routineRow, true, false, false],
    ['none', urgentRow, true, false, false],
    ['none', routineRow, true, false, false],
    // the bucket is off: nothing in it is owed, whatever the mode
    ['all', urgentRow, false, false, false],
    // "Pause all" beats every mode
    ['all', urgentRow, true, true, false],
    ['urgent', urgentRow, true, true, false],
  ] as const)('mode=%s %o bucketOn=%s paused=%s → %s', (mode, r, on, paused, owes) => {
    expect(owesEmail(r, { comments: on, candidates: on, offers: on, emailMode: mode, pushNothing: paused })).toBe(owes)
  })

  it('an unrecognised stored mode floors to urgent, the calm default (same as notify)', () => {
    expect(owesEmail(urgentRow, { ...PREFS_URGENT, emailMode: 'loud' })).toBe(true)
    expect(owesEmail(routineRow, { ...PREFS_URGENT, emailMode: 'loud' })).toBe(false)
  })

  it('reads the row’s OWN bucket toggle, and an unknown bucket owes nothing', () => {
    const prefs = { comments: false, candidates: true, offers: false, emailMode: 'all', pushNothing: false }
    expect(owesEmail({ bucket: 'comments', type: 'payment_failed' }, prefs)).toBe(false)
    expect(owesEmail({ bucket: 'candidates', type: 'payment_failed' }, prefs)).toBe(true)
    expect(owesEmail({ bucket: 'offers', type: 'payment_failed' }, prefs)).toBe(false)
    expect(owesEmail({ bucket: 'mystery', type: 'payment_failed' }, prefs)).toBe(false)
  })
})

describe('the backoff — created_at + 2^attempts × 5 minutes', () => {
  const created = new Date('2026-11-03T12:00:00Z')
  it.each([
    [0, 5],
    [1, 10],
    [2, 20],
  ])('attempt %i is due %i minutes after the row', (attempts, minutes) => {
    expect(redriveDueAt(created, attempts).getTime()).toBe(created.getTime() + minutes * MIN)
  })
  it('is anchored on the row, so there is no "next attempt" column to drift', () => {
    expect(REDRIVE_BASE_DELAY_MS).toBe(5 * MIN)
    expect(redriveDueAt(created, -1)).toEqual(redriveDueAt(created, 0))
  })
})

describe('the window read, as Postgres parses it', () => {
  it('asks for unsent rows under the cap inside 24h, never a demo org, and names no tenant', async () => {
    await redriveFailedNotificationEmails({ now: NOW })
    const [read] = find(/^select .*from "notifications"/i)
    expect(read).toBeTruthy()
    expect(read.sql).toMatch(/"notifications"\."email_sent_at" is null/i)
    expect(read.sql).toMatch(/"notifications"\."email_attempts" < \$\d/i)
    expect(read.sql).toMatch(/"notifications"\."created_at" > \$\d/i)
    expect(read.sql).toMatch(/"organization"\."is_demo" = \$\d/i)
    expect(read.sql).toMatch(/"notification_prefs"\."email_mode" = \$\d/i)
    expect(read.sql).toMatch(/"notifications"\."type" in \(/i)
    expect(read.params).toContain(MAX_NOTIFICATION_EMAIL_ATTEMPTS)
    expect(read.params).toContain(false) // is_demo
    expect(read.params).toContain('all')
    // The 24h floor, serialized the way the proxy driver hands it to Postgres.
    expect(read.params.map(String)).toContain(new Date(NOW.getTime() - 24 * 60 * MIN).toISOString())
    // ORG-AGNOSTIC: the sweep walks the platform; the rows carry their org.
    expect(read.sql).not.toMatch(/"notifications"\."organization_id" = \$\d/i)
    expect(read.sql).toMatch(/order by "notifications"\."created_at" asc/i)
  })

  it('does not even look up the billing wall when the window is empty', async () => {
    const { listShutDownOrgIds } = await import('@/lib/services/billing-state')
    const result = await redriveFailedNotificationEmails({ now: NOW })
    expect(result.scanned).toBe(0)
    expect(listShutDownOrgIds).not.toHaveBeenCalled()
  })
})

describe('the sweep', () => {
  it('re-sends a due, owed row and stamps email_sent_at on THAT row by id', async () => {
    windowRows = [row({ id: 42 })]
    const result = await redriveFailedNotificationEmails({ now: NOW })

    expect(emailState.sent).toHaveLength(1)
    expect(emailState.sent[0]).toMatchObject({
      to: 'owner@clinic.example',
      name: 'Dr. Lee',
      title: 'Payment failed',
      body: 'A card was declined.',
      linkPath: '/payments',
    })
    const [stamp] = find(/^update "notifications"/i)
    expect(stamp.sql).toMatch(/set "email_sent_at" = \$\d/i)
    expect(stamp.sql).toMatch(/"email_last_error" = \$\d/i)
    expect(stamp.sql).toMatch(/where "notifications"\."id" = \$\d/i)
    expect(stamp.params).toContain(42)
    // The proxy driver sees the timestamp the way Postgres will: serialized.
    expect(stamp.params.map(String)).toContain(NOW.toISOString())
    expect(result).toMatchObject({ scanned: 1, attempted: 1, sent: 1, failed: 0, exhausted: 0 })
    expect(strikes).toEqual([])
  })

  it('a failed re-send bumps email_attempts IN SQL, keeps the error, and strikes the clinic once', async () => {
    windowRows = [row({ id: 42, organizationId: 'org_9' })]
    emailState.throws = true
    const result = await redriveFailedNotificationEmails({ now: NOW })

    const [bump] = find(/^update "notifications"/i)
    expect(bump.sql).toMatch(/"email_attempts" = "notifications"\."email_attempts" \+ 1/i)
    expect(bump.sql).toMatch(/"email_last_error" = \$\d/i)
    expect(bump.sql).not.toMatch(/email_sent_at/i)
    expect(bump.sql).toMatch(/where "notifications"\."id" = \$\d/i)
    expect(bump.params).toContain(42)
    expect(bump.params.some((p) => typeof p === 'string' && p.includes('didn’t respond'))).toBe(true)
    expect(result).toMatchObject({ attempted: 1, sent: 0, failed: 1, exhausted: 0 })
    expect(strikes).toEqual([['org_9', 'staff_alert']])
  })

  it('the last allowed re-attempt failing counts as exhausted — the tray’s line from then on', async () => {
    windowRows = [
      row({
        id: 1,
        emailAttempts: MAX_NOTIFICATION_EMAIL_ATTEMPTS - 1,
        createdAt: new Date(NOW.getTime() - 60 * MIN),
      }),
    ]
    emailState.throws = true
    const result = await redriveFailedNotificationEmails({ now: NOW })
    expect(result).toMatchObject({ attempted: 1, failed: 1, exhausted: 1 })
  })

  it('a row whose backoff has not elapsed waits — no email, no write', async () => {
    // attempts=1 → due at created+10min; the row is 8 minutes old.
    windowRows = [row({ emailAttempts: 1, createdAt: new Date(NOW.getTime() - 8 * MIN) })]
    const result = await redriveFailedNotificationEmails({ now: NOW })
    expect(emailState.sent).toEqual([])
    expect(find(/^update/i)).toEqual([])
    expect(result).toMatchObject({ scanned: 1, waiting: 1, attempted: 0 })
  })

  it('a row the recipient’s CURRENT prefs no longer owe is skipped, untouched', async () => {
    windowRows = [
      row({ id: 1, prefs: { ...PREFS_URGENT, emailMode: 'none' } }),
      row({ id: 2, prefs: { ...PREFS_URGENT, pushNothing: true } }),
      row({ id: 3, type: 'portal_booking' }), // routine under 'urgent'
      row({ id: 4, email: null }), // nowhere to send
    ]
    const result = await redriveFailedNotificationEmails({ now: NOW })
    expect(emailState.sent).toEqual([])
    expect(find(/^update/i)).toEqual([])
    expect(result).toMatchObject({ scanned: 4, skipped: 4, attempted: 0 })
  })

  it('no prefs row means the calm defaults — urgent types are owed, routine ones are not', async () => {
    windowRows = [row({ id: 1, prefs: null }), row({ id: 2, prefs: null, type: 'portal_booking' })]
    const result = await redriveFailedNotificationEmails({ now: NOW })
    expect(emailState.sent).toHaveLength(1)
    expect(result).toMatchObject({ sent: 1, skipped: 1 })
  })

  it('a shut-down clinic’s rows are left alone until paying revives it', async () => {
    shutDown = new Set(['org_dead'])
    windowRows = [row({ id: 1, organizationId: 'org_dead' }), row({ id: 2, organizationId: 'org_live' })]
    const result = await redriveFailedNotificationEmails({ now: NOW })
    expect(emailState.sent).toHaveLength(1)
    expect(find(/^update "notifications"/i)[0].params).toContain(2)
    expect(result).toMatchObject({ shutDown: 1, sent: 1 })
  })

  it('one row’s failure never stops the walk — each row is its own unit', async () => {
    windowRows = [row({ id: 1, organizationId: 'org_a' }), row({ id: 2, organizationId: 'org_b' })]
    const { sendNotificationEmail } = await import('@/lib/email')
    // Once: the first row's send dies, the second falls back to the mock's
    // ordinary behaviour (and so does every test after this one).
    vi.mocked(sendNotificationEmail).mockImplementationOnce(async () => {
      throw new Error('boom')
    })
    const result = await redriveFailedNotificationEmails({ now: NOW })
    expect(result).toMatchObject({ attempted: 2, sent: 1, failed: 1 })
    expect(strikes).toEqual([['org_a', 'staff_alert']])
  })

  it('a platform-wide row (no org) is re-driven and strikes nobody', async () => {
    windowRows = [row({ id: 5, organizationId: null })]
    emailState.throws = true
    const result = await redriveFailedNotificationEmails({ now: NOW })
    expect(result).toMatchObject({ attempted: 1, failed: 1 })
    expect(strikes).toEqual([])
  })
})
