import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state — selectQueue feeds .select() chains in order, inserts/updates
// just record their input arguments so we can assert on dispatch behaviour.
const state: {
  selectQueue: unknown[][]
  inserts: Array<{ table: unknown; values: unknown }>
  emails: Array<unknown>
} = { selectQueue: [], inserts: [], emails: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (table: unknown) => ({
        values: async (values: unknown) => {
          state.inserts.push({ table, values })
          return undefined
        },
      }),
    },
    schema: {
      notifications: { id: 'notifications' },
      notificationPrefs: {
        userId: 'user_id',
        comments: 'comments',
        candidates: 'candidates',
        offers: 'offers',
        pushEverything: 'pushEverything',
        pushEmail: 'pushEmail',
        pushNothing: 'pushNothing',
      },
      user: { email: 'email', name: 'name' },
      member: { userId: 'member_user_id', organizationId: 'member_org_id', role: 'role' },
    },
  }
})

vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(async (input: unknown) => {
    state.emails.push(input)
  }),
}))

import { notify } from '@/lib/services/notifications'

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.emails.length = 0
})

describe('notify()', () => {
  const baseInput = {
    userId: 'u1',
    organizationId: 'o1',
    bucket: 'comments' as const,
    type: 'inbox_message',
    title: 'New message',
    body: 'From Alice',
    linkPath: '/inbox',
  }

  it('inserts a notification when the bucket is enabled and emails when pushEmail is on', async () => {
    // First select: prefs row
    state.selectQueue.push([
      {
        comments: true,
        candidates: true,
        offers: true,
        pushEverything: false,
        pushEmail: true,
        pushNothing: false,
      },
    ])
    // Second select: user row (for email)
    state.selectQueue.push([{ email: 'alice@example.com', name: 'Alice' }])

    await notify(baseInput)

    expect(state.inserts).toHaveLength(1)
    expect(state.emails).toHaveLength(1)
    expect((state.emails[0] as { to: string }).to).toBe('alice@example.com')
  })

  it('skips both insert and email when pushNothing is set', async () => {
    state.selectQueue.push([
      {
        comments: true,
        candidates: true,
        offers: true,
        pushEverything: false,
        pushEmail: true,
        pushNothing: true,
      },
    ])

    await notify(baseInput)

    expect(state.inserts).toHaveLength(0)
    expect(state.emails).toHaveLength(0)
  })

  it('skips when the relevant bucket is disabled', async () => {
    state.selectQueue.push([
      {
        comments: false, // ← muted
        candidates: true,
        offers: true,
        pushEverything: false,
        pushEmail: true,
        pushNothing: false,
      },
    ])

    await notify(baseInput)

    expect(state.inserts).toHaveLength(0)
    expect(state.emails).toHaveLength(0)
  })

  it('inserts but skips email when pushEmail is off', async () => {
    state.selectQueue.push([
      {
        comments: true,
        candidates: true,
        offers: true,
        pushEverything: false,
        pushEmail: false,
        pushNothing: false,
      },
    ])

    await notify(baseInput)

    expect(state.inserts).toHaveLength(1)
    expect(state.emails).toHaveLength(0)
  })

  it('falls back to default prefs when no row exists yet for the user', async () => {
    // Empty prefs result → defaults apply (comments=on, pushEmail=on)
    state.selectQueue.push([])
    // user row for the email send
    state.selectQueue.push([{ email: 'alice@example.com', name: 'Alice' }])

    await notify(baseInput)

    expect(state.inserts).toHaveLength(1)
    expect(state.emails).toHaveLength(1)
  })

  it('honours forceEmail even when bucket is disabled and pushEmail is off', async () => {
    state.selectQueue.push([
      {
        comments: false,
        candidates: false,
        offers: false,
        pushEverything: false,
        pushEmail: false,
        pushNothing: true,
      },
    ])
    state.selectQueue.push([{ email: 'alice@example.com', name: 'Alice' }])

    await notify({ ...baseInput, forceEmail: true })

    expect(state.inserts).toHaveLength(1)
    expect(state.emails).toHaveLength(1)
  })

  it('writes title, body, linkPath, bucket, and type into the inserted row', async () => {
    state.selectQueue.push([
      {
        comments: true,
        candidates: true,
        offers: true,
        pushEverything: false,
        pushEmail: false,
        pushNothing: false,
      },
    ])

    await notify(baseInput)

    const row = state.inserts[0].values as Record<string, unknown>
    expect(row.userId).toBe('u1')
    expect(row.organizationId).toBe('o1')
    expect(row.bucket).toBe('comments')
    expect(row.type).toBe('inbox_message')
    expect(row.title).toBe('New message')
    expect(row.body).toBe('From Alice')
    expect(row.linkPath).toBe('/inbox')
  })

  it('passes a custom linkLabel through to the email (but does NOT persist it on the row)', async () => {
    state.selectQueue.push([
      {
        comments: true,
        candidates: true,
        offers: true,
        pushEverything: false,
        pushEmail: true,
        pushNothing: false,
      },
    ])
    state.selectQueue.push([{ email: 'alice@example.com', name: 'Alice' }])

    await notify({ ...baseInput, linkPath: '/patients/p1', linkLabel: 'View Alice’s record →' })

    // Reaches the email as the button label …
    expect((state.emails[0] as { linkLabel?: string }).linkLabel).toBe('View Alice’s record →')
    // … but it's email-only presentation, never written to the stored row.
    expect(state.inserts[0].values as Record<string, unknown>).not.toHaveProperty('linkLabel')
  })
})
