import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>
const state = {
  selects: {} as Record<string, Row[][]>,
  inserts: [] as { table: string; values: unknown }[],
  updates: [] as { table: string; set: Row }[],
}
function nextSelect(table: string): Row[] {
  const q = state.selects[table]
  return q && q.length ? q.shift()! : []
}
function makeDb() {
  return {
    select: () => {
      let table = ''
      const chain: Record<string, unknown> = {}
      chain.from = (t: unknown) => {
        table = String(t)
        return chain
      }
      chain.where = () => chain
      chain.orderBy = () => chain
      chain.groupBy = () => chain
      chain.limit = () => chain
      ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(nextSelect(table))
      return chain
    },
    insert: (t: unknown) => ({
      values: (v: unknown) => {
        state.inserts.push({ table: String(t), values: v })
        const ret: Record<string, unknown> = {
          onConflictDoUpdate: () => Promise.resolve(),
          onConflictDoNothing: () => Promise.resolve(),
        }
        ;(ret as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(undefined)
        return ret
      },
    }),
    update: (t: unknown) => ({
      set: (s: Row) => ({
        where: () => {
          state.updates.push({ table: String(t), set: s })
          return Promise.resolve()
        },
      }),
    }),
  }
}
vi.mock('@/lib/db', () => {
  const schema = new Proxy(
    {},
    {
      get: (_t, prop) => {
        const name = String(prop)
        return new Proxy(
          {},
          { get: (_x, p) => (p === Symbol.toPrimitive || p === 'toString' || p === 'valueOf' ? () => name : {}) },
        )
      },
    },
  )
  return { db: makeDb(), schema }
})

import { seedDemoPms } from '@/lib/services/pms/demo-seed'

function queue(table: string, ...results: Row[][]) {
  ;(state.selects[table] ??= []).push(...results)
}
function insertsFor(table: string) {
  return state.inserts.filter((i) => i.table === table)
}

beforeEach(() => {
  state.selects = {}
  state.inserts.length = 0
  state.updates.length = 0
})

describe('seedDemoPms — idempotent self-heal', () => {
  it('no-ops when a connected demo connection already exists', async () => {
    queue('pmsConnection', [{ organizationId: 'org1', provider: 'demo', status: 'connected' }])
    await seedDemoPms('org1')
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('reactivates a disconnected sandbox without re-seeding', async () => {
    queue('pmsConnection', [{ organizationId: 'org1', provider: 'demo', status: 'not_connected' }])
    await seedDemoPms('org1')
    // only the connection is upserted back to connected — no maps/runs/ops
    expect(insertsFor('pmsConnection')).toHaveLength(1)
    expect((insertsFor('pmsConnection')[0].values as Row).status).toBe('connected')
    expect(insertsFor('pmsEntityMap')).toHaveLength(0)
    expect(insertsFor('pmsSyncRun')).toHaveLength(0)
  })

  it('does nothing for a clinic with no patients (not a real demo)', async () => {
    queue('pmsConnection', []) // none
    queue('patient', []) // no patients
    await seedDemoPms('org1')
    expect(state.inserts).toHaveLength(0)
  })

  it('seeds connection + entity maps + sync runs + write-back log over existing rows', async () => {
    queue('pmsConnection', []) // none yet
    queue('patient', [[1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}` }))].flat() as Row[])
    queue('clinicProvider', [{ id: 'pr1' }, { id: 'pr2' }])
    queue('appointment', [1, 2, 3, 4, 5, 6].map((n) => ({ id: `a${n}` })))

    await seedDemoPms('org1')

    // connection upserted as a connected, two-way demo
    const conn = insertsFor('pmsConnection')[0].values as Row
    expect(conn.provider).toBe('demo')
    expect(conn.status).toBe('connected')
    expect(conn.syncDirection).toBe('two_way')

    // entity maps: 2 providers + 6 patients + 4 appts (2 reserved unmapped) = 12
    const maps = insertsFor('pmsEntityMap')[0].values as Row[]
    expect(Array.isArray(maps)).toBe(true)
    expect(maps).toHaveLength(12)
    const types = new Set(maps.map((m) => m.entityType))
    expect(types).toEqual(new Set(['provider', 'patient', 'appointment']))
    // two appointments are dreamcrm-origin (booked here then pushed)
    expect(maps.filter((m) => m.origin === 'dreamcrm')).toHaveLength(2)

    // 3 inbound sync runs
    expect((insertsFor('pmsSyncRun')[0].values as Row[]).length).toBe(3)

    // write-back log covers every state
    const ops = insertsFor('pmsWriteOp')[0].values as Row[]
    const statuses = ops.map((o) => o.status).sort()
    expect(statuses).toEqual(['error', 'pending', 'success', 'success'])

    // PMS balances on the first 5 patients + PMS recall on at least the 6th
    // (the recall loop fires Math.min(4, patients.length - 5) times — with 6
    // patients in this fixture that's 1 recall update on top of 5 balances).
    expect(state.updates.filter((u) => u.table === 'patient')).toHaveLength(6)
    expect(state.updates.some((u) => u.table === 'patient' && 'pmsRecallDueAt' in u.set)).toBe(true)
  })
})
