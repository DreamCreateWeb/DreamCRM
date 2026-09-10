import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * The two `/messages` queries are bounded, and search still searches everything.
 *
 * `listPatientThreads` selected EVERY thread in the organization — each row
 * carrying a correlated subquery for its message preview — and then filtered
 * the staff's search term in JavaScript over the whole result. Fine for one
 * beta clinic; at a few thousand patients it is a full scan plus a per-row
 * subquery on every inbox load. `listMessagesInThread` was unbounded the same
 * way, in both of its sources.
 *
 * Adding a LIMIT to the thread query is only safe BECAUSE the search moved into
 * the WHERE clause: capping a query whose filter runs afterwards would have
 * silently searched just the first page. That pairing is what these tests pin,
 * against the statements drizzle actually builds.
 */

const rendered: Array<{ sql: string; params: unknown[] }> = []
/** Rows the next appointment/message/thread query should answer with. */
const answers: { rows: unknown[] } = { rows: [] }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const real = drizzle({} as never, { schema })

  const capture = (query: { toSQL(): { sql: string; params: unknown[] } }) => {
    rendered.push(query.toSQL())
    return answers.rows
  }
  function wrap(builder: unknown): unknown {
    return new Proxy(builder as object, {
      get(target, prop, receiver) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(capture(target as never))
        }
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args)
          return out && typeof out === 'object' ? wrap(out) : out
        }
      },
    })
  }
  return { schema, db: { select: (cols?: Record<string, unknown>) => wrap(real.select(cols as never)) } }
})

import { listPatientThreadsPage } from '@/lib/services/patient-messaging'
import { DEFAULT_THREAD_LIMIT, MAX_THREAD_LIMIT } from '@/lib/types/messaging'

async function threadSql(filters: Record<string, unknown> = {}) {
  rendered.length = 0
  answers.rows = []
  await listPatientThreadsPage('org_1', 'usr_1', filters as never)
  return rendered[0]
}

beforeEach(() => {
  rendered.length = 0
  answers.rows = []
})

describe('listPatientThreads — bounded', () => {
  it('always carries a LIMIT', async () => {
    const q = await threadSql()
    expect(q.sql).toMatch(/limit \$\d+/i)
  })

  it('asks for one row beyond the page, to learn whether more exist', async () => {
    const q = await threadSql()
    // The last bound param is the limit; it should be the page size + 1.
    expect(q.params).toContain(DEFAULT_THREAD_LIMIT + 1)
  })

  it('clamps an oversized limit to MAX_THREAD_LIMIT', async () => {
    const q = await threadSql({ limit: 99_999 })
    expect(q.params).toContain(MAX_THREAD_LIMIT + 1)
    expect(q.params).not.toContain(100_000)
  })

  it('clamps a zero or negative limit to at least one row', async () => {
    expect((await threadSql({ limit: 0 })).params).toContain(2)
    expect((await threadSql({ limit: -5 })).params).toContain(2)
  })

  it('reports hasMore only when the extra row came back', async () => {
    const row = () => ({
      id: 't', patientId: 'p', patientFirstName: 'A', patientLastName: 'B',
      patientEmail: null, patientPhone: null, status: 'open', assignedUserId: null,
      assignedUserName: null, snoozedUntil: null, lastMessageAt: new Date(),
      lastMessageDirection: null, lastMessageChannel: null, unreadCount: 0,
      starred: false, urgency: null, urgencyReason: null, createdAt: new Date(),
      lastMessagePreview: null,
    })
    answers.rows = Array.from({ length: 3 }, row)
    const exact = await listPatientThreadsPage('org_1', 'usr_1', { limit: 3 })
    expect(exact.hasMore).toBe(false)
    expect(exact.rows).toHaveLength(3)

    answers.rows = Array.from({ length: 4 }, row)
    const more = await listPatientThreadsPage('org_1', 'usr_1', { limit: 3 })
    expect(more.hasMore).toBe(true)
    expect(more.rows, 'the probe row is not shown to the user').toHaveLength(3)
  })
})

describe('listPatientThreads — search runs in Postgres', () => {
  it('puts the search term in the WHERE clause, not in a JS filter', async () => {
    const q = await threadSql({ search: 'nguyen' })
    expect(q.sql).toMatch(/where/i)
    expect(q.params).toContain('%nguyen%')
  })

  it('searches name, email and the latest message body', async () => {
    const q = await threadSql({ search: 'crown' })
    expect(q.sql).toMatch(/lower\([^]*first_name[^]*\|\|[^]*last_name[^]*\) like/i)
    expect(q.sql).toMatch(/lower\(coalesce\([^]*email[^]*\)\) like/i)
    expect(q.sql).toMatch(/select body from/i) // the latest-message subquery
  })

  it('matches a phone forgivingly, on digits only', async () => {
    const q = await threadSql({ search: '(512) 555-9117' })
    expect(q.sql).toMatch(/regexp_replace\(coalesce\([^]*phone[^]*\), '\[\^0-9\]', '', 'g'\) like/i)
    expect(q.params).toContain('%5125559117%')
  })

  it('adds no phone clause when the term has no digits', async () => {
    const q = await threadSql({ search: 'nguyen' })
    expect(q.sql).not.toMatch(/regexp_replace/i)
  })

  it('adds no search clause at all for a blank term', async () => {
    const q = await threadSql({ search: '   ' })
    expect(q.params).not.toContain('%%')
    expect(q.sql).not.toMatch(/regexp_replace/i)
  })

  it('renders as SQL the dialect accepts, with no undefined params', async () => {
    const dialect = new PgDialect()
    expect(dialect).toBeTruthy()
    for (const filters of [
      {},
      { search: 'nguyen 512' },
      { status: 'archived' },
      { assignedTo: 'me' },
      { hasUnread: true },
      { starredOnly: true },
    ]) {
      const q = await threadSql(filters)
      expect(q.sql.length).toBeGreaterThan(0)
      expect(q.params.every((p) => p !== undefined), `undefined param in: ${q.sql}`).toBe(true)
    }
  })
})
