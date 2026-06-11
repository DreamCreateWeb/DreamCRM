import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * reorderTask — kanban drag renumber. The whole renumber batch (position
 * UPDATEs + the cross-column status flip) runs inside db.transaction() so a
 * partial apply can't leave a column with duplicate / gapped positions
 * (restored now the DB is node-postgres). The mock's `transaction(cb)` invokes
 * the callback with the SAME methods object (the `tx`), so reads + writes routed
 * through `tx` land in the shared capture — proving they run inside the tx.
 */

const state = {
  // ordered ids per status column, keyed by status value
  columns: {} as Record<string, number[]>,
  movedStatus: null as string | null,
  movedTaskId: 5,
  updates: [] as Array<{ where: string; set: Record<string, unknown> }>,
  txCalls: 0,
  txRollbacks: 0,
  failNextUpdate: false,
}

// Track which status column a `select ... from tasks where status=X` should
// return. We stash the requested status on the chain via the eq() mock.
let lastEqStatus: string | null = null
let movedLookupDone = false

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => {
      // First select in reorderTask is the moved-task lookup (id + status).
      if (!movedLookupDone) {
        movedLookupDone = true
        return state.movedStatus ? [{ id: state.movedTaskId, status: state.movedStatus }] : []
      }
      return []
    }
    // orderedIds awaits the orderBy() chain directly (no .limit()).
    obj.then = (resolve: (v: unknown) => void) => {
      const status = lastEqStatus
      const ids = (status && state.columns[status]) || []
      resolve(ids.map((id) => ({ id })))
    }
    return obj
  }
  const methods: any = {
    select: () => chain(),
    update: () => ({
      set: (s: Record<string, unknown>) => ({
        where: async () => {
          if (state.failNextUpdate) {
            state.failNextUpdate = false
            throw new Error('position update blew up')
          }
          state.updates.push({ where: 'tasks', set: s })
        },
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      state.txCalls += 1
      try {
        return await cb(methods)
      } catch (err) {
        state.txRollbacks += 1
        throw err
      }
    },
  }
  return {
    db: methods,
    schema: { tasks: { id: 'id', status: 'status', organizationId: 'organizationId', position: 'position', createdAt: 'createdAt' } },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...a) => ({ _kind: 'and', a })),
  eq: vi.fn((col: unknown, val: unknown) => {
    // Capture status-column targeting so the mock select can return the right
    // column's ordered ids.
    if (col === 'status') lastEqStatus = String(val)
    return { _kind: 'eq', col, val }
  }),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _kind: 'gte' })),
  lte: vi.fn(() => ({ _kind: 'lte' })),
  inArray: vi.fn(() => ({ _kind: 'inArray' })),
  or: vi.fn(() => ({ _kind: 'or' })),
  isNull: vi.fn(() => ({ _kind: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _kind: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('@/lib/types/tasks', () => ({
  TASK_PRIORITIES: ['low', 'medium', 'high'],
  TASK_STATUSES: ['todo', 'in_progress', 'completed'],
  TASK_STATUS_LABEL: {},
}))

import { reorderTask } from '@/lib/services/tasks'

beforeEach(() => {
  state.columns = {}
  state.movedStatus = null
  state.updates = []
  state.txCalls = 0
  state.txRollbacks = 0
  state.failNextUpdate = false
  lastEqStatus = null
  movedLookupDone = false
})

describe('reorderTask — transactional renumber', () => {
  it('within-column reorder runs all position writes inside one transaction', async () => {
    state.movedTaskId = 5
    state.movedStatus = 'todo'
    state.columns = { todo: [5, 6, 7] }

    await reorderTask(5, 'todo', 2, 'org_1')

    // Renumber happened inside the transaction.
    expect(state.txCalls).toBe(1)
    expect(state.txRollbacks).toBe(0)
    // Destination column rewritten end-to-end (3 position updates, no status flip).
    expect(state.updates.length).toBe(3)
    expect(state.updates.every((u) => 'position' in u.set)).toBe(true)
  })

  it('throws (outside any tx) when the task is not found', async () => {
    state.movedStatus = null // moved lookup returns []
    await expect(reorderTask(99, 'todo', 0, 'org_1')).rejects.toThrow(/not found/i)
    expect(state.txCalls).toBe(0)
  })

  it('rolls the whole renumber back when a position update fails', async () => {
    state.movedTaskId = 5
    state.movedStatus = 'todo'
    state.columns = { todo: [5, 6, 7] }
    state.failNextUpdate = true

    await expect(reorderTask(5, 'todo', 0, 'org_1')).rejects.toThrow(/blew up/)
    expect(state.txCalls).toBe(1)
    expect(state.txRollbacks).toBe(1)
    // The failing update threw before pushing — no partial writes captured.
    expect(state.updates).toHaveLength(0)
  })
})
