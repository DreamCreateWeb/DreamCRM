import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The notification-tray mutation tools: per-item dismiss, clear-all, and the
 * (now org-scoped) mark-read helpers. We capture the WHERE-clause SQL fragment
 * of each DELETE/UPDATE and assert the right scoping literals appear — so a
 * dismiss/mark can never reach another user's or another org's rows, and a
 * "clear read only" can never touch an unread row.
 */

interface CapturedWhere {
  sql: string
  kind: 'delete' | 'update'
}

const state: { wheres: CapturedWhere[] } = { wheres: [] }

function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (obj.value !== undefined) parts.push(String(obj.value))
    // Surface operator names (e.g. isNotNull) so we can assert on them.
    if (typeof obj.operator === 'string') parts.push(obj.operator)
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    db: {
      delete: () => ({
        where: async (clause: unknown) => {
          state.wheres.push({ sql: captureSql(clause), kind: 'delete' })
        },
      }),
      update: () => ({
        set: () => ({
          where: async (clause: unknown) => {
            state.wheres.push({ sql: captureSql(clause), kind: 'update' })
          },
        }),
      }),
    },
    schema,
  }
})

import {
  dismissNotifications,
  dismissAllNotifications,
  markRead,
  markAllRead,
} from '@/lib/services/notifications'

const USER = 'user_123'
const ORG_A = 'org_a_acme'
const ORG_B = 'org_b_bright'

beforeEach(() => {
  state.wheres.length = 0
})

describe('dismissNotifications', () => {
  it('deletes scoped to the user + ids + active org (never another org)', async () => {
    await dismissNotifications(USER, [1, 2, 3], ORG_A)
    expect(state.wheres).toHaveLength(1)
    const w = state.wheres[0]
    expect(w.kind).toBe('delete')
    expect(w.sql).toContain(USER)
    expect(w.sql).toContain(ORG_A)
    expect(w.sql).not.toContain(ORG_B)
  })

  it('is a no-op with no ids (never issues an unbounded delete)', async () => {
    await dismissNotifications(USER, [], ORG_A)
    expect(state.wheres).toHaveLength(0)
  })
})

describe('dismissAllNotifications', () => {
  it('clears the active org for the user', async () => {
    await dismissAllNotifications(USER, ORG_A)
    expect(state.wheres).toHaveLength(1)
    expect(state.wheres[0].kind).toBe('delete')
    expect(state.wheres[0].sql).toContain(USER)
    expect(state.wheres[0].sql).toContain(ORG_A)
  })

  it('readOnly restricts the delete to already-opened rows', async () => {
    await dismissAllNotifications(USER, ORG_A, { readOnly: true })
    // isNotNull(readAt) must be part of the WHERE so unread rows survive.
    expect(state.wheres[0].sql.toLowerCase()).toContain('not null')
  })

  it('without readOnly does NOT restrict to opened rows', async () => {
    await dismissAllNotifications(USER, ORG_A)
    expect(state.wheres[0].sql.toLowerCase()).not.toContain('not null')
  })
})

describe('markRead / markAllRead — now org-scoped', () => {
  it('markRead scopes to the active org', async () => {
    await markRead(USER, [5], ORG_A)
    expect(state.wheres[0].kind).toBe('update')
    expect(state.wheres[0].sql).toContain(ORG_A)
    expect(state.wheres[0].sql).not.toContain(ORG_B)
  })

  it('markAllRead scopes to the active org', async () => {
    await markAllRead(USER, ORG_A)
    expect(state.wheres[0].kind).toBe('update')
    expect(state.wheres[0].sql).toContain(ORG_A)
    expect(state.wheres[0].sql).not.toContain(ORG_B)
  })
})
