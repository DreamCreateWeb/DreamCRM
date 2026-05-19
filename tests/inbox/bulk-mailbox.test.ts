import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tracks calls into our mocked db + gmail layer so each test can assert
// against them. The select chain pulls one row set from `selectQueue` per
// query; updates capture their where + set into `updateCalls`.
const state: {
  selectQueue: unknown[][]
  updateCalls: Array<{ set?: Record<string, unknown> }>
  gmail: {
    accessTokens: string[]
    batchModify: Array<{ accessToken: string; ids: string[]; add: string[]; remove: string[] }>
    trash: Array<{ accessToken: string; id: string }>
    failBatchModify?: boolean
  }
} = {
  selectQueue: [],
  updateCalls: [],
  gmail: { accessTokens: [], batchModify: [], trash: [] },
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  const updateChain = () => {
    const obj: any = {}
    const call: { set?: Record<string, unknown> } = {}
    state.updateCalls.push(call)
    obj.set = (s: Record<string, unknown>) => {
      call.set = s
      return obj
    }
    obj.where = () => Promise.resolve()
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      update: () => updateChain(),
    },
    schema: { emailMessage: {} },
  }
})

vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: async (accountId: string) => {
    state.gmail.accessTokens.push(accountId)
    return `token-for-${accountId}`
  },
  batchModifyLabels: async (
    accessToken: string,
    ids: string[],
    add: string[],
    remove: string[],
  ) => {
    if (state.gmail.failBatchModify) throw new Error('gmail down')
    state.gmail.batchModify.push({ accessToken, ids, add, remove })
  },
  trashMessage: async (accessToken: string, id: string) => {
    state.gmail.trash.push({ accessToken, id })
  },
  // Stubs for the other imports mailbox.ts pulls in but doesn't use here.
  getMessage: async () => ({}),
  listHistory: async () => ({}),
  listInboxMessageIds: async () => [],
  markMessageRead: async () => {},
  modifyLabels: async () => {},
  parseGmailMessage: () => ({}),
  resolveInlineImages: async () => null,
  sendMessage: async () => ({ id: 'fake' }),
  stopWatch: async () => {},
  watchMailbox: async () => ({ historyId: '0', expiresAt: new Date() }),
}))

vi.mock('@/lib/services/ai-mailbox', () => ({
  classifyBatch: async () => new Map(),
}))

beforeEach(() => {
  state.selectQueue.length = 0
  state.updateCalls.length = 0
  state.gmail.accessTokens.length = 0
  state.gmail.batchModify.length = 0
  state.gmail.trash.length = 0
  state.gmail.failBatchModify = false
})

describe('bulkSetRead', () => {
  it('is a no-op when no ids are passed', async () => {
    const { bulkSetRead } = await import('@/lib/services/mailbox')
    const result = await bulkSetRead([], 'org-1', true)
    expect(result).toEqual({ count: 0 })
    expect(state.updateCalls).toHaveLength(0)
    expect(state.gmail.batchModify).toHaveLength(0)
  })

  it('returns zero and skips Gmail when no rows match the org scope', async () => {
    state.selectQueue.push([]) // ref lookup returns nothing
    const { bulkSetRead } = await import('@/lib/services/mailbox')
    const result = await bulkSetRead(['m1', 'm2'], 'org-1', true)
    expect(result).toEqual({ count: 0 })
    expect(state.gmail.batchModify).toHaveLength(0)
  })

  it('issues one batchModify per distinct accountId', async () => {
    state.selectQueue.push([
      { id: 'm1', accountId: 'acct-A', providerMessageId: 'gmail-1' },
      { id: 'm2', accountId: 'acct-A', providerMessageId: 'gmail-2' },
      { id: 'm3', accountId: 'acct-B', providerMessageId: 'gmail-3' },
    ])
    const { bulkSetRead } = await import('@/lib/services/mailbox')
    const result = await bulkSetRead(['m1', 'm2', 'm3'], 'org-1', true)
    expect(result.count).toBe(3)
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].set).toEqual({ isRead: true })
    expect(state.gmail.batchModify).toHaveLength(2)
    const callA = state.gmail.batchModify.find((c) => c.ids.includes('gmail-1'))
    const callB = state.gmail.batchModify.find((c) => c.ids.includes('gmail-3'))
    expect(callA?.ids).toEqual(['gmail-1', 'gmail-2'])
    expect(callA?.remove).toEqual(['UNREAD'])
    expect(callB?.ids).toEqual(['gmail-3'])
  })

  it('adds UNREAD when marking unread', async () => {
    state.selectQueue.push([{ id: 'm1', accountId: 'acct-A', providerMessageId: 'gmail-1' }])
    const { bulkSetRead } = await import('@/lib/services/mailbox')
    await bulkSetRead(['m1'], 'org-1', false)
    expect(state.gmail.batchModify[0].add).toEqual(['UNREAD'])
    expect(state.gmail.batchModify[0].remove).toEqual([])
  })

  it('swallows Gmail mirror failures and still reports success locally', async () => {
    state.gmail.failBatchModify = true
    state.selectQueue.push([{ id: 'm1', accountId: 'acct-A', providerMessageId: 'gmail-1' }])
    const { bulkSetRead } = await import('@/lib/services/mailbox')
    const result = await bulkSetRead(['m1'], 'org-1', true)
    expect(result.count).toBe(1)
    expect(state.updateCalls).toHaveLength(1)
  })
})

describe('bulkSetStarred', () => {
  it('adds STARRED when starring', async () => {
    state.selectQueue.push([{ id: 'm1', accountId: 'acct-A', providerMessageId: 'gmail-1' }])
    const { bulkSetStarred } = await import('@/lib/services/mailbox')
    await bulkSetStarred(['m1'], 'org-1', true)
    expect(state.gmail.batchModify[0].add).toEqual(['STARRED'])
    expect(state.gmail.batchModify[0].remove).toEqual([])
    expect(state.updateCalls[0].set).toEqual({ isStarred: true })
  })

  it('removes STARRED when unstarring', async () => {
    state.selectQueue.push([{ id: 'm1', accountId: 'acct-A', providerMessageId: 'gmail-1' }])
    const { bulkSetStarred } = await import('@/lib/services/mailbox')
    await bulkSetStarred(['m1'], 'org-1', false)
    expect(state.gmail.batchModify[0].add).toEqual([])
    expect(state.gmail.batchModify[0].remove).toEqual(['STARRED'])
  })
})

describe('bulkArchive', () => {
  it('sets folder=archive and removes INBOX label on Gmail', async () => {
    state.selectQueue.push([
      { id: 'm1', accountId: 'acct-A', providerMessageId: 'gmail-1' },
      { id: 'm2', accountId: 'acct-A', providerMessageId: 'gmail-2' },
    ])
    const { bulkArchive } = await import('@/lib/services/mailbox')
    const result = await bulkArchive(['m1', 'm2'], 'org-1')
    expect(result.count).toBe(2)
    expect(state.updateCalls[0].set).toEqual({ folder: 'archive' })
    expect(state.gmail.batchModify[0].add).toEqual([])
    expect(state.gmail.batchModify[0].remove).toEqual(['INBOX'])
  })
})

describe('bulkTrash', () => {
  it('sets folder=trash and calls Gmail trash per message', async () => {
    state.selectQueue.push([
      { id: 'm1', accountId: 'acct-A', providerMessageId: 'gmail-1' },
      { id: 'm2', accountId: 'acct-B', providerMessageId: 'gmail-2' },
    ])
    const { bulkTrash } = await import('@/lib/services/mailbox')
    const result = await bulkTrash(['m1', 'm2'], 'org-1')
    expect(result.count).toBe(2)
    expect(state.updateCalls[0].set).toEqual({ folder: 'trash' })
    expect(state.gmail.batchModify).toHaveLength(0)
    expect(state.gmail.trash.map((c) => c.id).sort()).toEqual(['gmail-1', 'gmail-2'])
  })
})
