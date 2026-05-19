import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
  selectQueue: unknown[][]
  updateCalls: Array<{ set?: Record<string, unknown> }>
  classifyBatchCalls: Array<unknown[]>
  classifyResults: Map<string, { category: string; intent: string }>
} = {
  selectQueue: [],
  updateCalls: [],
  classifyBatchCalls: [],
  classifyResults: new Map(),
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
    obj.where = () => {
      const w: any = Promise.resolve()
      w.returning = () => Promise.resolve([])
      return w
    }
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
  getAccessToken: async () => 'token',
  batchModifyLabels: async () => {},
  modifyLabels: async () => {},
  trashMessage: async () => {},
  getMessage: async () => ({}),
  listHistory: async () => ({}),
  listInboxMessageIds: async () => [],
  markMessageRead: async () => {},
  parseGmailMessage: () => ({}),
  resolveInlineImages: async () => null,
  sendMessage: async () => ({ id: 'fake' }),
  stopWatch: async () => {},
  watchMailbox: async () => ({ historyId: '0', expiresAt: new Date() }),
}))

vi.mock('@/lib/services/ai-mailbox', () => ({
  classifyBatch: async (rows: unknown[]) => {
    state.classifyBatchCalls.push(rows)
    return state.classifyResults
  },
}))

beforeEach(() => {
  state.selectQueue.length = 0
  state.updateCalls.length = 0
  state.classifyBatchCalls.length = 0
  state.classifyResults = new Map()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('classifyPendingIntents: heuristics + LLM split', () => {
  it('inherits the thread category from a user-locked sibling and skips the LLM', async () => {
    // Pending row in thread t-1
    state.selectQueue.push([
      {
        id: 'msg-1',
        fromEmail: 'a@b.com',
        fromName: 'A',
        subject: 'Re: hello',
        bodyText: 'reply',
        bodyHtml: null,
        snippet: null,
        providerThreadId: 't-1',
        patientId: null,
      },
    ])
    // Sibling with a user-locked category in same thread
    state.selectQueue.push([
      {
        providerThreadId: 't-1',
        category: 'primary',
        intent: 'follow_up',
        categorySource: 'user',
      },
    ])
    const { classifyPendingIntents } = await import('@/lib/services/mailbox')
    const result = await classifyPendingIntents('org-1')
    expect(result.viaHeuristic).toBe(1)
    expect(state.classifyBatchCalls).toHaveLength(0)
    expect(state.updateCalls[0].set).toEqual({
      category: 'primary',
      intent: 'follow_up',
      categorySource: 'inherit',
    })
  })

  it('treats a known patient sender as primary without calling the LLM', async () => {
    state.selectQueue.push([
      {
        id: 'msg-1',
        fromEmail: 'patient@example.com',
        fromName: 'P',
        subject: 'Question',
        bodyText: 'hey',
        bodyHtml: null,
        snippet: null,
        providerThreadId: 't-1',
        patientId: 'pat-1',
      },
    ])
    state.selectQueue.push([]) // no thread siblings
    const { classifyPendingIntents } = await import('@/lib/services/mailbox')
    const result = await classifyPendingIntents('org-1')
    expect(result.viaHeuristic).toBe(1)
    expect(state.classifyBatchCalls).toHaveLength(0)
    expect(state.updateCalls[0].set).toEqual({
      category: 'primary',
      intent: 'follow_up',
      categorySource: 'auto',
    })
  })

  it('falls back to the LLM for unknown senders with no thread context', async () => {
    state.selectQueue.push([
      {
        id: 'msg-1',
        fromEmail: 'stranger@example.com',
        fromName: 'S',
        subject: 'Sale!',
        bodyText: 'buy stuff',
        bodyHtml: null,
        snippet: null,
        providerThreadId: 't-1',
        patientId: null,
      },
    ])
    state.selectQueue.push([]) // no thread siblings
    state.classifyResults.set('msg-1', { category: 'promotions', intent: 'marketing' })
    const { classifyPendingIntents } = await import('@/lib/services/mailbox')
    const result = await classifyPendingIntents('org-1')
    expect(result.viaHeuristic).toBe(0)
    expect(state.classifyBatchCalls).toHaveLength(1)
    expect(state.classifyBatchCalls[0]).toHaveLength(1)
    expect(state.updateCalls[0].set).toEqual({
      category: 'promotions',
      intent: 'marketing',
      categorySource: 'auto',
    })
  })

  it('runs heuristics only when no API key is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY
    state.selectQueue.push([
      {
        id: 'msg-1',
        fromEmail: 'a@b.com',
        fromName: null,
        subject: null,
        bodyText: null,
        bodyHtml: null,
        snippet: null,
        providerThreadId: 't-1',
        patientId: 'pat-1', // known sender → heuristic kicks in
      },
      {
        id: 'msg-2',
        fromEmail: 'b@c.com',
        fromName: null,
        subject: null,
        bodyText: null,
        bodyHtml: null,
        snippet: null,
        providerThreadId: 't-2',
        patientId: null,
      },
    ])
    state.selectQueue.push([]) // no thread siblings
    const { classifyPendingIntents } = await import('@/lib/services/mailbox')
    const result = await classifyPendingIntents('org-1')
    expect(result.viaHeuristic).toBe(1) // known sender
    expect(result.pending).toBe(1) // stranger left unclassified
    expect(state.classifyBatchCalls).toHaveLength(0)
  })
})

describe('classifyPendingIntents: extra heuristics', () => {
  it('routes Gmail-PERSONAL-labeled mail to primary without calling the LLM', async () => {
    state.selectQueue.push([
      {
        id: 'msg-1',
        fromEmail: 'someone@unknown-domain.example',
        fromName: 'Someone',
        subject: 'Hello',
        bodyText: 'a test body',
        bodyHtml: null,
        snippet: null,
        providerThreadId: 't-1',
        patientId: null,
        labels: ['INBOX', 'CATEGORY_PERSONAL'],
      },
    ])
    state.selectQueue.push([]) // no thread siblings
    const { classifyPendingIntents } = await import('@/lib/services/mailbox')
    const result = await classifyPendingIntents('org-1')
    expect(result.viaHeuristic).toBe(1)
    expect(state.classifyBatchCalls).toHaveLength(0)
    expect(state.updateCalls[0].set).toEqual({
      category: 'primary',
      intent: 'follow_up',
      categorySource: 'gmail',
    })
  })

  it('routes consumer-domain senders (gmail.com / yahoo.com / etc) to primary without the LLM', async () => {
    state.selectQueue.push([
      {
        id: 'msg-1',
        fromEmail: 'random@gmail.com',
        fromName: 'Random Person',
        subject: 'Quick question',
        bodyText: 'wondering about something',
        bodyHtml: null,
        snippet: null,
        providerThreadId: 't-1',
        patientId: null,
        labels: ['INBOX'],
      },
    ])
    state.selectQueue.push([]) // no thread siblings
    const { classifyPendingIntents } = await import('@/lib/services/mailbox')
    const result = await classifyPendingIntents('org-1')
    expect(result.viaHeuristic).toBe(1)
    expect(state.classifyBatchCalls).toHaveLength(0)
    expect(state.updateCalls[0].set).toEqual({
      category: 'primary',
      intent: 'follow_up',
      categorySource: 'auto',
    })
  })

  it('falls back to the LLM for business-domain senders without other signals', async () => {
    state.selectQueue.push([
      {
        id: 'msg-1',
        fromEmail: 'sales@some-vendor.com',
        fromName: 'Vendor Sales',
        subject: 'Pitch',
        bodyText: 'pitch content',
        bodyHtml: null,
        snippet: null,
        providerThreadId: 't-1',
        patientId: null,
        labels: ['INBOX'],
      },
    ])
    state.selectQueue.push([]) // no thread siblings
    state.classifyResults.set('msg-1', { category: 'primary', intent: 'follow_up' })
    const { classifyPendingIntents } = await import('@/lib/services/mailbox')
    const result = await classifyPendingIntents('org-1')
    expect(result.viaHeuristic).toBe(0)
    expect(state.classifyBatchCalls).toHaveLength(1)
  })
})

describe('setMessageCategory', () => {
  it('updates every message in the thread and flips the source to user', async () => {
    // Lookup of the message returns the thread id
    state.selectQueue.push([{ providerThreadId: 't-1' }])
    const { setMessageCategory } = await import('@/lib/services/mailbox')
    const result = await setMessageCategory('msg-1', 'org-1', 'primary')
    // returning() yields [] in our mock so updated is 0; the contract
    // we care about here is what `set` was given.
    expect(result.updated).toBe(0)
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].set).toEqual({
      category: 'primary',
      categorySource: 'user',
    })
  })

  it('is a no-op when the message id does not belong to the org', async () => {
    state.selectQueue.push([]) // lookup returns no row
    const { setMessageCategory } = await import('@/lib/services/mailbox')
    const result = await setMessageCategory('msg-x', 'org-1', 'primary')
    expect(result.updated).toBe(0)
    expect(state.updateCalls).toHaveLength(0)
  })
})
