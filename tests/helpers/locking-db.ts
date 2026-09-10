/**
 * A fake `db` that models Postgres transaction ISOLATION well enough to prove a
 * check-then-write race is closed.
 *
 * A plain mock can't: every query resolves instantly from a queue, so two
 * "concurrent" calls never actually interleave and a TOCTOU bug looks fine.
 * This harness gives the two behaviours that decide the outcome of a race:
 *
 *  1. `db.transaction(cb)` runs `cb` against a `tx` handle whose writes land in
 *     a PENDING set and are only merged into the shared store on commit — so a
 *     concurrent reader cannot see another transaction's uncommitted rows.
 *  2. `tx.execute(sql\`… pg_advisory_xact_lock(hashtext($key)) …\`)` takes a
 *     real in-process mutex keyed on `$key`, released at commit/rollback — so a
 *     second transaction asking for the same key WAITS.
 *
 * Together: code that reads outside the lock races (both callers see the stale
 * state), and code that re-reads inside the lock does not. A test can then
 * fire two calls with `Promise.all` and assert exactly one wins.
 *
 * Deliberately simple: rows are plain objects, and `select()` resolves through
 * a caller-supplied `resolve(tableName, rows)` so each test decides what a
 * query against a given table returns. No SQL is parsed.
 */

export interface StoredRow {
  [key: string]: unknown
}

export interface LockingDbOptions {
  /**
   * Answer a SELECT. `rows` is every committed row of that table plus the
   * calling transaction's own uncommitted writes. Return the rows the query
   * should yield (the service only ever reads `[0]` or sums a column).
   */
  resolve: (table: string, rows: StoredRow[]) => unknown[]
}

export interface LockingDb {
  /** The object to hand to `vi.mock('@/lib/db')` as `db`. */
  db: unknown
  /** Committed rows by table name. */
  store: Map<string, StoredRow[]>
  /** Lock keys taken, in order — asserts the guard actually ran. */
  locksTaken: string[]
  /** Peak number of transactions inside the same lock key. >1 means a race. */
  maxConcurrentInLock: number
  rows(table: string): StoredRow[]
}

const NAME = Symbol.for('drizzle:Name')

function tableName(t: unknown): string {
  const n = (t as Record<symbol, unknown> | null)?.[NAME]
  return typeof n === 'string' ? n : 'unknown'
}

/** Pull the literal text out of a drizzle `sql` template for lock detection. */
export function sqlText(q: unknown): string {
  const chunks = (q as { queryChunks?: unknown[] } | null)?.queryChunks
  if (!Array.isArray(chunks)) return ''
  let out = ''
  for (const c of chunks) {
    const v = (c as { value?: unknown } | null)?.value
    if (Array.isArray(v)) out += v.join('')
    else if (typeof c === 'string') out += c
  }
  return out
}

/** The interpolated (non-literal) params of a drizzle `sql` template. */
export function sqlParams(q: unknown): unknown[] {
  const chunks = (q as { queryChunks?: unknown[] } | null)?.queryChunks
  if (!Array.isArray(chunks)) return []
  return chunks.filter((c) => !(c as { value?: unknown } | null)?.value)
}

export function createLockingDb(options: LockingDbOptions): LockingDb {
  const store = new Map<string, StoredRow[]>()
  const locksTaken: string[] = []
  // key → queue of waiters; the holder owns the head.
  const heldLocks = new Map<string, Array<() => void>>()
  const inLock = new Map<string, number>()
  const result: Partial<LockingDb> = { store, locksTaken, maxConcurrentInLock: 0 }

  const rows = (table: string) => store.get(table) ?? []

  function selectChain(pending: Map<string, StoredRow[]>) {
    let from = 'unknown'
    const chain: Record<string, unknown> = {}
    const answer = () => options.resolve(from, [...rows(from), ...(pending.get(from) ?? [])])
    const self = () => chain
    chain.from = (t: unknown) => {
      from = tableName(t)
      return self()
    }
    for (const m of ['where', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy']) chain[m] = self
    chain.limit = async () => answer()
    chain.then = (res: (v: unknown) => void) => res(answer())
    return chain
  }

  async function acquire(key: string): Promise<() => void> {
    locksTaken.push(key)
    const queue = heldLocks.get(key)
    if (queue) {
      await new Promise<void>((resolve) => queue.push(resolve))
    } else {
      heldLocks.set(key, [])
    }
    const depth = (inLock.get(key) ?? 0) + 1
    inLock.set(key, depth)
    result.maxConcurrentInLock = Math.max(result.maxConcurrentInLock ?? 0, depth)
    let released = false
    return () => {
      if (released) return
      released = true
      inLock.set(key, (inLock.get(key) ?? 1) - 1)
      const waiters = heldLocks.get(key)
      const next = waiters?.shift()
      if (next) next()
      else heldLocks.delete(key)
    }
  }

  const db = {
    select: () => selectChain(new Map()),
    insert: (t: unknown) => ({
      values: async (vals: StoredRow) => {
        const name = tableName(t)
        store.set(name, [...rows(name), vals])
      },
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
    execute: async () => [],
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const pending = new Map<string, StoredRow[]>()
      const releases: Array<() => void> = []
      const tx = {
        execute: async (q: unknown) => {
          const text = sqlText(q)
          const m = /pg_advisory_(?:xact_)?lock/.test(text)
          if (m) {
            const key = String(sqlParams(q)[0] ?? '')
            releases.push(await acquire(key))
          }
          return []
        },
        select: () => selectChain(pending),
        insert: (t: unknown) => ({
          values: async (vals: StoredRow) => {
            const name = tableName(t)
            pending.set(name, [...(pending.get(name) ?? []), vals])
          },
        }),
        update: () => ({ set: () => ({ where: async () => {} }) }),
        delete: () => ({ where: async () => {} }),
      }
      try {
        const out = await cb(tx)
        // Commit: pending writes become visible to everyone.
        for (const [name, added] of Array.from(pending.entries())) {
          store.set(name, [...rows(name), ...added])
        }
        return out
      } finally {
        // Advisory XACT locks release at commit OR rollback.
        for (const r of releases.reverse()) r()
      }
    },
  }

  result.db = db
  result.rows = rows
  return result as LockingDb
}

/** The `schema` proxy the repo's other db mocks use — snake_cases the key. */
export function schemaProxy() {
  return new Proxy(
    {},
    {
      get: (_t, prop) => ({
        [NAME]: String(prop).replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
      }),
    },
  )
}
