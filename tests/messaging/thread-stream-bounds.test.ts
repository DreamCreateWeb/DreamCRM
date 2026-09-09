import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A conversation loads a bounded window, and says so when it truncates.
 *
 * `listMessagesInThread` fetched EVERY `patient_message` on the thread and
 * EVERY `email_message` for the patient, then merged and sorted them in JS. A
 * long patient relationship made the inbox slower every year, and the AI draft
 * path pulled the whole history to write one reply.
 *
 * Both sources now take the newest N. The window must be the RECENT end of the
 * conversation (a chat scrolled to the bottom), still rendered oldest-first —
 * and `hasMore` has to be honest, or the UI shows a conversation that appears
 * to begin in the middle.
 */

const state: {
  thread: { id: string; patientId: string } | null
  patientMessages: Array<Record<string, unknown>>
  emails: Array<Record<string, unknown>>
  lastLimits: number[]
} = { thread: { id: 'thr_1', patientId: 'pat_1' }, patientMessages: [], emails: [], lastLimits: [] }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const name = (t: unknown) => (t as Record<symbol, unknown>)?.[Symbol.for('drizzle:Name')]
  return {
    schema,
    db: {
      select: () => {
        let table = ''
        const chain: Record<string, unknown> = {}
        const self = () => chain
        const rowsFor = () => {
          if (table === 'patient_message') return state.patientMessages
          if (table === 'email_message') return state.emails
          // getPatientThreadById runs first; without a row the function
          // short-circuits and never issues the two source queries.
          if (table === 'patient_thread') return state.thread ? [state.thread] : []
          return []
        }
        chain.from = (t: unknown) => {
          table = String(name(t) ?? '')
          return self()
        }
        for (const m of ['where', 'leftJoin', 'innerJoin', 'orderBy']) chain[m] = self
        chain.limit = async (n: number) => {
          state.lastLimits.push(n)
          // Newest-first, as the real query orders, then truncated by the limit.
          return rowsFor().slice(0, n)
        }
        chain.then = (resolve: (v: unknown) => void) => resolve(rowsFor())
        return chain
      },
    },
  }
})

vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn() }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'UTC') }))

import { listMessagesInThreadPage } from '@/lib/services/patient-messaging'
import { DEFAULT_THREAD_MESSAGE_LIMIT } from '@/lib/types/messaging'

/** N patient messages, newest first (the order the query returns them in). */
function messages(n: number, startIndex = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `msg_${startIndex + n - 1 - i}`,
    channel: 'in_app',
    direction: 'inbound',
    body: `body ${startIndex + n - 1 - i}`,
    sentByUserId: null,
    sentByName: null,
    // Newest first: index n-1 is the most recent.
    sentAt: new Date(Date.UTC(2026, 0, 1) + (startIndex + n - 1 - i) * 60_000),
    deliveredAt: null,
    readByPatientAt: null,
    externalId: null,
    meta: null,
  }))
}

beforeEach(() => {
  state.thread = { id: 'thr_1', patientId: 'pat_1' }
  state.patientMessages = []
  state.emails = []
  state.lastLimits = []
})

describe('listMessagesInThread — bounded window', () => {
  it('asks each source for one row beyond the cap', async () => {
    await listMessagesInThreadPage('org_1', 'thr_1', 50)
    // [0] is getPatientThreadById's own limit(1); the two sources follow.
    expect(state.lastLimits.slice(1)).toEqual([51, 51])
  })

  it('defaults to DEFAULT_THREAD_MESSAGE_LIMIT', async () => {
    await listMessagesInThreadPage('org_1', 'thr_1')
    expect(state.lastLimits.slice(1)).toEqual([
      DEFAULT_THREAD_MESSAGE_LIMIT + 1,
      DEFAULT_THREAD_MESSAGE_LIMIT + 1,
    ])
  })

  it('returns a short thread whole, with hasMore false', async () => {
    state.patientMessages = messages(3)
    const page = await listMessagesInThreadPage('org_1', 'thr_1', 10)
    expect(page.hasMore).toBe(false)
    expect(page.messages).toHaveLength(3)
  })

  it('keeps the NEWEST messages when the thread overflows', async () => {
    state.patientMessages = messages(20) // msg_19 is the most recent
    const page = await listMessagesInThreadPage('org_1', 'thr_1', 5)
    expect(page.hasMore).toBe(true)
    expect(page.messages).toHaveLength(5)
    expect(page.messages.map((m) => m.id)).toEqual(['msg_15', 'msg_16', 'msg_17', 'msg_18', 'msg_19'])
  })

  it('still renders oldest → newest inside the window', async () => {
    state.patientMessages = messages(20)
    const page = await listMessagesInThreadPage('org_1', 'thr_1', 5)
    const times = page.messages.map((m) => m.sentAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('reports hasMore when the OTHER source is the one that overflows', async () => {
    state.patientMessages = messages(1)
    state.emails = Array.from({ length: 9 }, (_, i) => ({
      id: `em_${i}`,
      folder: 'inbox',
      fromName: 'Pat',
      fromEmail: 'pat@example.test',
      subject: 'Re: visit',
      snippet: 's',
      bodyText: 'b',
      receivedAt: new Date(Date.UTC(2026, 0, 2) + i * 60_000),
      providerMessageId: null,
    }))
    const page = await listMessagesInThreadPage('org_1', 'thr_1', 5)
    expect(page.hasMore).toBe(true)
    expect(page.messages).toHaveLength(5)
  })

  it('is empty and honest for an unknown thread', async () => {
    state.thread = null
    const page = await listMessagesInThreadPage('org_1', 'nope')
    expect(page).toEqual({ messages: [], hasMore: false })
  })
})
