import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
  selectQueue: unknown[][]
  updateCalls: Array<{ set?: Record<string, unknown> }>
  gmail: {
    batchModify: Array<{ ids: string[]; add: string[]; remove: string[] }>
    trash: Array<{ id: string }>
    sent: Array<{
      from: string
      to: string[]
      subject: string
      bodyText: string
      inReplyTo?: string
      references?: string
    }>
  }
} = {
  selectQueue: [],
  updateCalls: [],
  gmail: { batchModify: [], trash: [], sent: [] },
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.groupBy = () => obj
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
    schema: {
      emailMessage: {},
      emailAccount: {},
      patient: {},
    },
  }
})

vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: async () => 'token',
  batchModifyLabels: async (_t: string, ids: string[], add: string[], remove: string[]) => {
    state.gmail.batchModify.push({ ids, add, remove })
  },
  modifyLabels: async () => {},
  trashMessage: async (_t: string, id: string) => {
    state.gmail.trash.push({ id })
  },
  getMessage: async () => ({}),
  listHistory: async () => ({}),
  listInboxMessageIds: async () => [],
  markMessageRead: async () => {},
  parseGmailMessage: () => ({}),
  resolveInlineImages: async () => null,
  sendMessage: async (_t: string, input: any) => {
    state.gmail.sent.push(input)
    return { id: 'sent-id' }
  },
  stopWatch: async () => {},
  watchMailbox: async () => ({ historyId: '0', expiresAt: new Date() }),
}))

vi.mock('@/lib/services/ai-mailbox', () => ({
  classifyBatch: async () => new Map(),
}))

beforeEach(() => {
  state.selectQueue.length = 0
  state.updateCalls.length = 0
  state.gmail.batchModify.length = 0
  state.gmail.trash.length = 0
  state.gmail.sent.length = 0
})

describe('listThreadsForOrg', () => {
  it('groups messages into one row per provider_thread_id', async () => {
    // listMessagesForOrg's underlying select returns these rows
    state.selectQueue.push([
      // thread-A: 2 messages, latest first
      {
        id: 'm-1',
        accountId: 'acct-1',
        accountEmail: 'a@b.com',
        providerMessageId: 'g-1',
        providerThreadId: 't-A',
        fromName: 'Alice',
        fromEmail: 'alice@x.com',
        subject: 'Re: Hi',
        snippet: 'newest in A',
        receivedAt: new Date('2026-05-19T10:00:00Z'),
        isRead: false,
        isStarred: false,
        folder: 'inbox',
        intent: 'follow_up',
        category: 'primary',
        patientId: null,
        patientFirstName: null,
        patientLastName: null,
      },
      {
        id: 'm-0',
        accountId: 'acct-1',
        accountEmail: 'a@b.com',
        providerMessageId: 'g-0',
        providerThreadId: 't-A',
        fromName: 'You',
        fromEmail: 'me@x.com',
        subject: 'Hi',
        snippet: 'older in A',
        receivedAt: new Date('2026-05-18T10:00:00Z'),
        isRead: true,
        isStarred: false,
        folder: 'inbox',
        intent: 'follow_up',
        category: 'primary',
        patientId: null,
        patientFirstName: null,
        patientLastName: null,
      },
      // thread-B: 1 message
      {
        id: 'm-2',
        accountId: 'acct-1',
        accountEmail: 'a@b.com',
        providerMessageId: 'g-2',
        providerThreadId: 't-B',
        fromName: 'Bob',
        fromEmail: 'bob@x.com',
        subject: 'Question',
        snippet: 'b',
        receivedAt: new Date('2026-05-19T09:00:00Z'),
        isRead: false,
        isStarred: true,
        folder: 'inbox',
        intent: null,
        category: 'primary',
        patientId: null,
        patientFirstName: null,
        patientLastName: null,
      },
    ])
    const { listThreadsForOrg } = await import('@/lib/services/mailbox')
    const threads = await listThreadsForOrg('org-1')
    expect(threads).toHaveLength(2)
    const a = threads.find((t) => t.threadId === 't-A')!
    expect(a.totalCount).toBe(2)
    expect(a.unreadCount).toBe(1)
    expect(a.isRead).toBe(false) // any unread → thread is unread
    expect(a.latestMessageId).toBe('m-1')
    expect(a.snippet).toBe('newest in A')
    const b = threads.find((t) => t.threadId === 't-B')!
    expect(b.totalCount).toBe(1)
    expect(b.isStarred).toBe(true)
  })

  it('returns an empty array when there are no messages', async () => {
    state.selectQueue.push([])
    const { listThreadsForOrg } = await import('@/lib/services/mailbox')
    expect(await listThreadsForOrg('org-1')).toEqual([])
  })
})

describe('bulkArchiveThreads', () => {
  it('expands each thread to its messages then issues one batchModify per account', async () => {
    // expandThreadsToMessages select
    state.selectQueue.push([
      { id: 'msg-a-1' },
      { id: 'msg-a-2' },
      { id: 'msg-b-1' },
    ])
    // Inside bulkArchive: fetchMessageRefs select
    state.selectQueue.push([
      { id: 'msg-a-1', accountId: 'acct-A', providerMessageId: 'g-a-1' },
      { id: 'msg-a-2', accountId: 'acct-A', providerMessageId: 'g-a-2' },
      { id: 'msg-b-1', accountId: 'acct-B', providerMessageId: 'g-b-1' },
    ])
    const { bulkArchiveThreads } = await import('@/lib/services/mailbox')
    const result = await bulkArchiveThreads(['t-A', 't-B'], 'org-1')
    expect(result.count).toBe(3)
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].set).toEqual({ folder: 'archive' })
    expect(state.gmail.batchModify).toHaveLength(2)
    const all = state.gmail.batchModify.flatMap((c) => c.remove)
    expect(all.every((r) => r === 'INBOX')).toBe(true)
  })

  it('is a no-op when given no thread ids', async () => {
    const { bulkArchiveThreads } = await import('@/lib/services/mailbox')
    const result = await bulkArchiveThreads([], 'org-1')
    expect(result.count).toBe(0)
    expect(state.updateCalls).toHaveLength(0)
  })
})

describe('sendEmail: outbound thread headers reach Gmail', () => {
  it('passes In-Reply-To + References + display-name From to the Gmail sender', async () => {
    // getAccount returns the sending account
    state.selectQueue.push([
      {
        id: 'acct-1',
        organizationId: 'org-1',
        provider: 'gmail',
        emailAddress: 'me@x.com',
        displayName: 'Me',
      },
    ])
    const { sendEmail } = await import('@/lib/services/mailbox')
    await sendEmail({
      accountId: 'acct-1',
      organizationId: 'org-1',
      to: ['alice@x.com'],
      subject: 'Re: Hi',
      bodyText: 'My reply\n\nOn Tue May 19, Alice wrote:\n> first message in thread',
      inReplyTo: '<rfc-1@mail.gmail.com>',
      references: '<rfc-0@mail.gmail.com> <rfc-1@mail.gmail.com>',
    })
    expect(state.gmail.sent).toHaveLength(1)
    const sent = state.gmail.sent[0]
    expect(sent.inReplyTo).toBe('<rfc-1@mail.gmail.com>')
    expect(sent.references).toBe('<rfc-0@mail.gmail.com> <rfc-1@mail.gmail.com>')
    expect(sent.bodyText).toContain('> first message in thread')
    expect(sent.from).toBe('Me <me@x.com>')
  })
})
