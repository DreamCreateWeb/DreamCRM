import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the editable message-templates service
 * (`lib/services/message-templates.ts`), backed by the email_snippet table.
 */

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  inserts: [] as unknown[],
  updates: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/db', () => {
  const term = () => Promise.resolve(h.selectQueue.shift() ?? [])
  function chain() {
    const o: Record<string, unknown> = {}
    for (const m of ['from', 'where']) o[m] = () => o
    o.orderBy = () => term()
    o.limit = () => term()
    o.set = (v: Record<string, unknown>) => { h.updates.push(v); return o }
    o.values = (v: unknown) => { h.inserts.push(v); return o }
    o.onConflictDoNothing = () => Promise.resolve(undefined)
    o.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => term().then(res, rej)
    return o
  }
  return {
    db: {
      select: () => chain(),
      insert: () => chain(),
      update: () => chain(),
      delete: () => chain(),
      transaction: async (fn: (tx: unknown) => unknown) => fn({ update: () => chain() }),
    },
    schema: { emailSnippet: { id: 'id', organizationId: 'organizationId', name: 'name', sortOrder: 'sortOrder' } },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  asc: (x: unknown) => x,
  sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }),
}))

import {
  seedDefaultMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  DEFAULT_MESSAGE_TEMPLATES,
  MAX_TEMPLATES_PER_ORG,
} from '@/lib/services/message-templates'

beforeEach(() => {
  h.selectQueue = []
  h.inserts = []
  h.updates = []
})

describe('seedDefaultMessageTemplates', () => {
  it('inserts the starter set on a fresh org', async () => {
    h.selectQueue = [[]] // guard read → none exist
    await seedDefaultMessageTemplates('org_1', 'user_1')
    expect(h.inserts).toHaveLength(1)
    expect((h.inserts[0] as unknown[]).length).toBe(DEFAULT_MESSAGE_TEMPLATES.length)
  })

  it('is a no-op when the org already has templates', async () => {
    h.selectQueue = [[{ id: 'snip_1' }]] // guard read → one exists
    await seedDefaultMessageTemplates('org_1')
    expect(h.inserts).toHaveLength(0)
  })
})

describe('createMessageTemplate', () => {
  it('cleans the name + appends after the max sortOrder', async () => {
    h.selectQueue = [[{ count: 5 }], [{ maxOrder: 2 }]]
    const t = await createMessageTemplate('org_1', { name: '  Quick   hello ', body: 'Hi {{firstName}}!' }, 'user_1')
    expect(t.name).toBe('Quick hello')
    expect(t.sortOrder).toBe(3) // maxOrder(2) + 1
    const ins = h.inserts[0] as { name: string; sortOrder: number }
    expect(ins.sortOrder).toBe(3)
  })

  it('keeps only the first character of a shortcut', async () => {
    h.selectQueue = [[{ count: 0 }], [{ maxOrder: -1 }]]
    const t = await createMessageTemplate('org_1', { name: 'X', body: 'body text here', shortcut: 'abc' }, null)
    expect(t.shortcut).toBe('a')
  })

  it('rejects an empty name or body before touching the db', async () => {
    await expect(createMessageTemplate('org_1', { name: '  ', body: 'x' }, null)).rejects.toThrow(/name/i)
    await expect(createMessageTemplate('org_1', { name: 'x', body: '   ' }, null)).rejects.toThrow(/message/i)
    expect(h.inserts).toHaveLength(0)
  })

  it('rejects when the per-org cap is reached', async () => {
    h.selectQueue = [[{ count: MAX_TEMPLATES_PER_ORG }]]
    await expect(createMessageTemplate('org_1', { name: 'X', body: 'body text here' }, null)).rejects.toThrow(/up to/i)
    expect(h.inserts).toHaveLength(0)
  })
})

describe('updateMessageTemplate', () => {
  it('writes only the provided fields + cleans them', async () => {
    await updateMessageTemplate('org_1', 'snip_1', { name: '  Renamed  ' })
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0].name).toBe('Renamed')
    expect(h.updates[0].body).toBeUndefined()
  })

  it('rejects an empty name/body when explicitly provided', async () => {
    await expect(updateMessageTemplate('org_1', 'snip_1', { name: '   ' })).rejects.toThrow(/name/i)
    await expect(updateMessageTemplate('org_1', 'snip_1', { body: '   ' })).rejects.toThrow(/message/i)
  })
})
