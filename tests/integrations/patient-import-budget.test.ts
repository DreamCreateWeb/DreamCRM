import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Budgeted, resumable patient import (deliverable #1 + #3).
 *
 * runImport reconciles a (possibly huge) patient list under a soft time budget:
 * when the budget is hit mid-import it parks a resume cursor on
 * pms_connection.meta and returns a clean `partial` + progress; the NEXT run
 * resumes from the cursor and finishes. A crashed `running` row older than the
 * stale window is reaped (not left blocking). A patient with a linked login
 * keeps their contact info (overwriting would break sign-in), counted as
 * skippedContactOverwrites.
 *
 * We use a small IN-MEMORY store so we can assert the FINAL state (which
 * patients exist, the parked cursor, the run statuses) — proving every patient
 * is reconciled across two resumed runs.
 */

// ── In-memory store ──────────────────────────────────────────────────────────
type Row = Record<string, unknown>
interface Store {
  connection: Row | null
  syncRuns: Row[]
  entityMaps: Row[]
  patients: Row[]
  /** When set, a patient UPDATE targeting this id throws (transient-blip sim). */
  failPatientUpdateId: string | null
}
const store: Store = { connection: null, syncRuns: [], entityMaps: [], patients: [], failPatientUpdateId: null }

// drizzle condition shape produced by the mocked operators below.
type Cond = { op: 'eq'; col: string; val: unknown } | { op: 'and'; parts: Cond[] } | { op: 'other' }
function eqValue(cond: Cond | undefined, col: string): unknown {
  if (!cond) return undefined
  if (cond.op === 'eq') return cond.col === col ? cond.val : undefined
  if (cond.op === 'and') {
    for (const p of cond.parts) {
      const v = eqValue(p, col)
      if (v !== undefined) return v
    }
  }
  return undefined
}

function tableOf(t: unknown): string {
  // schema proxy: schema.<table> stringifies to the table name.
  return String(t).split('.')[0]
}

function rowsFor(table: string): Row[] {
  if (table === 'pmsConnection') return store.connection ? [store.connection] : []
  if (table === 'pmsSyncRun') return store.syncRuns
  if (table === 'pmsEntityMap') return store.entityMaps
  if (table === 'patient') return store.patients
  return []
}

function applyWhere(table: string, rows: Row[], cond: Cond | undefined): Row[] {
  if (!cond) return rows
  // The only WHERE filter the import path needs to respect precisely is the
  // per-row patient fetch by id; everything else (org scoping, entityType) is
  // single-tenant in these tests so ignoring it is safe.
  const id = eqValue(cond, 'patient.id')
  if (table === 'patient' && id !== undefined) return rows.filter((r) => r.id === id)
  const runStatus = eqValue(cond, 'pmsSyncRun.status')
  if (table === 'pmsSyncRun' && runStatus !== undefined) return rows.filter((r) => r.status === runStatus)
  return rows
}

function makeDb() {
  return {
    select: (_proj?: unknown) => {
      let table = ''
      let cond: Cond | undefined
      let lim: number | undefined
      const chain: Record<string, unknown> = {}
      chain.from = (t: unknown) => {
        table = tableOf(t)
        return chain
      }
      chain.where = (c: Cond) => {
        cond = c
        return chain
      }
      chain.orderBy = () => chain
      chain.groupBy = () => chain
      chain.limit = (n: number) => {
        lim = n
        return chain
      }
      ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
        let out = applyWhere(table, [...rowsFor(table)], cond)
        if (lim !== undefined) out = out.slice(0, lim)
        return resolve(out)
      }
      return chain
    },
    insert: (t: unknown) => ({
      values: (v: Row) => {
        const table = tableOf(t)
        if (table === 'pmsSyncRun') store.syncRuns.push({ ...v })
        else if (table === 'pmsEntityMap') store.entityMaps.push({ ...v })
        else if (table === 'patient') store.patients.push({ ...v })
        const ret: Record<string, unknown> = {
          onConflictDoUpdate: () => Promise.resolve(),
          onConflictDoNothing: () => Promise.resolve(),
        }
        ;(ret as { then: unknown }).then = (resolve: (x: unknown) => unknown) => resolve(undefined)
        return ret
      },
    }),
    update: (t: unknown) => ({
      set: (s: Row) => ({
        where: (c: Cond) => {
          const table = tableOf(t)
          if (table === 'pmsConnection' && store.connection) Object.assign(store.connection, s)
          else if (table === 'pmsSyncRun') {
            const id = eqValue(c, 'pmsSyncRun.id')
            const target = id !== undefined ? store.syncRuns.find((r) => r.id === id) : store.syncRuns[store.syncRuns.length - 1]
            if (target) Object.assign(target, s)
          } else if (table === 'patient') {
            const id = eqValue(c, 'patient.id')
            if (id != null && id === store.failPatientUpdateId) {
              return Promise.reject(new Error('transient DB blip'))
            }
            const target = store.patients.find((r) => r.id === id)
            if (target) Object.assign(target, s)
          } else if (table === 'pmsEntityMap') {
            const id = eqValue(c, 'pmsEntityMap.id')
            const target = id !== undefined ? store.entityMaps.find((r) => r.id === id) : undefined
            if (target) Object.assign(target, s)
          }
          return Promise.resolve()
        },
      }),
    }),
  }
}

vi.mock('@/lib/db', () => {
  // schema.<table> stringifies to "<table>"; schema.<table>.<col> stringifies
  // to "<table>.<col>" — so the mock can both name the table (`.from(...)`) and
  // read the column in a WHERE (`eq(schema.patient.id, x)`).
  const schema = new Proxy(
    {},
    {
      get: (_t, tbl) => {
        const tableName = String(tbl)
        return new Proxy(
          {},
          {
            get: (_x, col) => {
              if (col === Symbol.toPrimitive || col === 'toString' || col === 'valueOf') return () => tableName
              const full = `${tableName}.${String(col)}`
              return { [Symbol.toPrimitive]: () => full, toString: () => full, valueOf: () => full }
            },
          },
        )
      },
    },
  )
  return { db: makeDb(), schema }
})

vi.mock('drizzle-orm', () => ({
  and: (...parts: Cond[]) => ({ op: 'and', parts }),
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col: String(col), val }),
  desc: (x: unknown) => x,
  inArray: () => ({ op: 'other' }),
  isNotNull: () => ({ op: 'other' }),
}))

// Provider: route through the demo provider, but stub it to return our patient
// list (and no appointments/recalls). getProviderClient picks DemoProvider when
// connection.provider === 'demo'.
let providerPatients: Array<Record<string, unknown>> = []
vi.mock('@/lib/services/pms/demo', () => ({
  DemoProvider: class {
    id = 'demo' as const
    async testConnection() {
      return { ok: true }
    }
    async listProviders() {
      return []
    }
    async listPatients() {
      return providerPatients
    }
    async listAppointments() {
      return []
    }
    async listRecalls() {
      return []
    }
    async createPatient() {
      return { externalId: 'x' }
    }
    async createCommLog() {
      return { externalId: 'x' }
    }
    async createAppointment() {
      return { externalId: 'x' }
    }
    async updateAppointment() {}
  },
}))

import { runImport } from '@/lib/services/pms/sync'

function makePmsPatients(n: number) {
  // externalId 'p001'.. so localeCompare sort is stable + predictable.
  return Array.from({ length: n }, (_, i) => {
    const id = `p${String(i + 1).padStart(3, '0')}`
    return { externalId: id, firstName: `First${i + 1}`, lastName: `Last${i + 1}`, email: `${id}@x.com`, phone: null }
  })
}

beforeEach(() => {
  store.connection = {
    organizationId: 'org1',
    provider: 'demo',
    status: 'connected',
    syncDirection: 'import',
    autoSyncEnabled: 1,
    meta: {},
    lastSyncAt: null,
  }
  store.syncRuns = []
  store.entityMaps = []
  store.patients = []
  store.failPatientUpdateId = null
  providerPatients = []
})

describe('runImport — time-budgeted patient import', () => {
  it('caps at the budget, parks a resume cursor, returns partial + progress', async () => {
    providerPatients = makePmsPatients(60) // 3 batches of 25 (well, 25/25/10)
    // Clock: first batch is "instant", then every check is past the deadline.
    // Budget 0 means: after the first batch (i>start), clock>=deadline → stop.
    let t = 1000
    const now = () => t
    // softBudgetMs 0 → deadline = 1000. After processing batch 1, the i>start
    // budget check sees clock(1000) >= deadline(1000) → park.
    const r = await runImport('org1', { softBudgetMs: 0, now })

    expect(r.status).toBe('partial')
    expect(r.partial).toBe(true)
    expect(r.resumeAvailable).toBe(true)
    expect(r.progress).toEqual({ imported: 25, total: 60 })
    // 25 patients created so far.
    expect(store.patients).toHaveLength(25)
    // Cursor parked at 25.
    expect((store.connection!.meta as Row).patientImportCursor).toBe(25)
    // The run row is recorded 'partial'.
    expect(store.syncRuns[store.syncRuns.length - 1].status).toBe('partial')
    void t
  })

  it('resumes from the parked cursor and finishes (all patients reconciled across two runs)', async () => {
    const all = makePmsPatients(60)
    providerPatients = all

    // Run 1: budget 0 → first batch only (25), park cursor.
    await runImport('org1', { softBudgetMs: 0, now: () => 1000 })
    expect(store.patients).toHaveLength(25)
    expect((store.connection!.meta as Row).patientImportCursor).toBe(25)

    // Run 2: generous budget → resume at 25, finish the remaining 35.
    const r2 = await runImport('org1', { softBudgetMs: 10_000, now: () => 2000 })
    expect(r2.status).toBe('success')
    expect(r2.partial).toBe(false)
    expect(r2.resumeAvailable).toBe(false)
    expect(r2.progress).toEqual({ imported: 60, total: 60 })

    // Every PMS patient now exists exactly once in DreamCRM.
    expect(store.patients).toHaveLength(60)
    const externalIds = new Set(store.entityMaps.map((m) => m.externalId))
    expect(externalIds.size).toBe(60)
    for (const p of all) expect(externalIds.has(p.externalId)).toBe(true)
    // Cursor cleared on completion.
    expect((store.connection!.meta as Row).patientImportCursor).toBeUndefined()
  })

  it('a single run within budget imports everything in one pass (no cursor)', async () => {
    providerPatients = makePmsPatients(40)
    const r = await runImport('org1', { softBudgetMs: 10_000, now: () => 1000 })
    expect(r.status).toBe('success')
    expect(store.patients).toHaveLength(40)
    expect((store.connection!.meta as Row).patientImportCursor).toBeUndefined()
  })
})

describe('runImport — stale running-row reaping', () => {
  it('reaps an expired running row (older than the stale window) instead of blocking', async () => {
    providerPatients = makePmsPatients(5)
    // A zombie 'running' row from 20 minutes ago (stale window is 15 min).
    const zombieStart = new Date(Date.now() - 20 * 60 * 1000)
    store.syncRuns.push({ id: 'zombie', organizationId: 'org1', status: 'running', startedAt: zombieStart })

    const r = await runImport('org1', { softBudgetMs: 10_000 })
    expect(r.status).toBe('success')
    // Zombie was flipped to error (reaped), the fresh run succeeded.
    const zombie = store.syncRuns.find((x) => x.id === 'zombie')
    expect(zombie!.status).toBe('error')
    expect(String(zombie!.error)).toMatch(/abandoned/i)
    expect(store.patients).toHaveLength(5)
  })

  it('refuses to start when a FRESH running row exists (real overlap)', async () => {
    providerPatients = makePmsPatients(5)
    store.syncRuns.push({ id: 'live', organizationId: 'org1', status: 'running', startedAt: new Date() })
    await expect(runImport('org1', { softBudgetMs: 10_000 })).rejects.toThrow(/already running/i)
    // Nothing imported; the live run is untouched.
    expect(store.patients).toHaveLength(0)
    expect(store.syncRuns.find((x) => x.id === 'live')!.status).toBe('running')
  })
})

describe('runImport — contact-overwrite guard for linked patients', () => {
  it('keeps a linked patient’s email/phone over the PMS value and counts it', async () => {
    // Seed an existing mapped patient WITH a login (userId set) + an entity map.
    store.patients.push({
      id: 'pat-linked',
      organizationId: 'org1',
      firstName: 'Old',
      lastName: 'Name',
      email: 'login@portal.com', // the address their sign-in keys on
      phone: '5551112222',
      userId: 'user-1', // linked login
      pmsBalanceCents: null,
    })
    store.entityMaps.push({
      id: 'map-1',
      organizationId: 'org1',
      entityType: 'patient',
      externalId: 'p001',
      internalId: 'pat-linked',
      contentHash: 'STALE', // force an update pass
    })
    // PMS reports a DIFFERENT email/phone + a new name.
    providerPatients = [
      { externalId: 'p001', firstName: 'New', lastName: 'Name', email: 'changed@pms.com', phone: '5559998888' },
    ]

    const r = await runImport('org1', { softBudgetMs: 10_000 })
    expect(r.status).toBe('success')

    const pat = store.patients.find((p) => p.id === 'pat-linked')!
    // Name (and other non-contact fields) PMS-wins…
    expect(pat.firstName).toBe('New')
    // …but contact stays OURS because the patient has a login.
    expect(pat.email).toBe('login@portal.com')
    expect(pat.phone).toBe('5551112222')

    // The run counts the preserved contact.
    const runRow = store.syncRuns[store.syncRuns.length - 1]
    const counts = runRow.counts as Record<string, { updated: number; skippedContactOverwrites?: number }>
    expect(counts.patients.updated).toBe(1)
    expect(counts.patients.skippedContactOverwrites).toBe(1)
  })

  it('DOES overwrite contact for an UNLINKED patient (no login → PMS-wins)', async () => {
    store.patients.push({
      id: 'pat-unlinked',
      organizationId: 'org1',
      firstName: 'Old',
      lastName: 'Name',
      email: 'old@x.com',
      phone: '5551112222',
      userId: null, // NO login
      pmsBalanceCents: null,
    })
    store.entityMaps.push({
      id: 'map-2',
      organizationId: 'org1',
      entityType: 'patient',
      externalId: 'p001',
      internalId: 'pat-unlinked',
      contentHash: 'STALE',
    })
    providerPatients = [
      { externalId: 'p001', firstName: 'New', lastName: 'Name', email: 'changed@pms.com', phone: '5559998888' },
    ]

    await runImport('org1', { softBudgetMs: 10_000 })
    const pat = store.patients.find((p) => p.id === 'pat-unlinked')!
    expect(pat.email).toBe('changed@pms.com')
    expect(pat.phone).toBe('5559998888')
    const counts = store.syncRuns[store.syncRuns.length - 1].counts as Record<string, { skippedContactOverwrites?: number }>
    expect(counts.patients.skippedContactOverwrites ?? 0).toBe(0)
  })
})

describe('runImport — per-row resilience (one bad row never aborts the import)', () => {
  it('keeps importing when a single row errors; run is partial (not resumable) and counts the rest', async () => {
    // Two mapped patients, both stale → both want an update. One update throws.
    for (const id of ['ok', 'boom']) {
      store.patients.push({ id, organizationId: 'org1', firstName: 'Old', lastName: id, email: `${id}@x.com`, phone: null, userId: null, pmsBalanceCents: null })
      store.entityMaps.push({ id: `map-${id}`, organizationId: 'org1', entityType: 'patient', externalId: id === 'ok' ? 'p001' : 'p002', internalId: id, contentHash: 'STALE' })
    }
    store.failPatientUpdateId = 'boom'
    providerPatients = [
      { externalId: 'p001', firstName: 'New', lastName: 'ok', email: 'ok@x.com', phone: null },
      { externalId: 'p002', firstName: 'New', lastName: 'boom', email: 'boom@x.com', phone: null },
    ]

    const r = await runImport('org1', { softBudgetMs: 10_000 })

    // The healthy row imported; the failed row was skipped (not aborting).
    expect(store.patients.find((p) => p.id === 'ok')!.firstName).toBe('New')
    // Run reflects the failure honestly: partial, with a row-error note, NOT
    // resumable (a row error isn't a budget pause — it retries on the next sync).
    expect(r.status).toBe('partial')
    expect(r.resumeAvailable).toBe(false)
    expect(r.error).toMatch(/couldn't be imported/i)
    const counts = r.counts.patients
    expect(counts.updated).toBe(1) // only the healthy row counted
  })
})
