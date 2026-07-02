import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * AI reply-draft service. Verifies the allowance gate (per-tier cap, fail-safe
 * when spent), the not-configured / no-messages guards, the happy path (drafts
 * + increments usage + reports remaining), and that a model failure or a
 * malformed tool result degrades to { ok: false } instead of throwing.
 */

vi.mock('@/lib/services/service-library-ai', () => ({ CORE_VOICE_RULES: 'VOICE RULES' }))

const runClaudeJson = vi.fn()
const aiConfigured = vi.fn(() => true)
vi.mock('@/lib/ai', () => ({
  runClaudeJson: (...a: unknown[]) => runClaudeJson(...a),
  aiConfigured: () => aiConfigured(),
}))

const threadById = vi.fn()
const listMessages = vi.fn()
const patientContext = vi.fn()
vi.mock('@/lib/services/patient-messaging', () => ({
  getPatientThreadById: (...a: unknown[]) => threadById(...a),
  listMessagesInThread: (...a: unknown[]) => listMessages(...a),
  getThreadPatientContext: (...a: unknown[]) => patientContext(...a),
}))

let selectResult: Array<{ count: number }> = []
const insertCalls: unknown[] = []
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult }) }) }),
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: async (c: unknown) => {
          insertCalls.push({ v, c })
        },
      }),
    }),
  },
}))

import {
  draftPatientReply,
  messageDraftAllowance,
  getMessageDraftUsage,
  translateMessage,
} from '@/lib/services/message-ai'

beforeEach(() => {
  runClaudeJson.mockReset()
  aiConfigured.mockReturnValue(true)
  selectResult = []
  insertCalls.length = 0
  threadById.mockResolvedValue({ id: 'thr_1', patientId: 'pat_1', patientFirstName: 'Mia', patientLastName: 'Nguyen' })
  listMessages.mockResolvedValue([
    { id: 'm1', direction: 'inbound', body: 'Can I move my Thursday cleaning?' },
  ])
  patientContext.mockResolvedValue(null)
})

const input = { organizationId: 'org_1', threadId: 'thr_1', planTier: 'premium' as const }

describe('messageDraftAllowance', () => {
  it('caps per tier (premium > pro > basic/unknown)', () => {
    expect(messageDraftAllowance('premium')).toBe(600)
    expect(messageDraftAllowance('pro')).toBe(250)
    expect(messageDraftAllowance('basic')).toBe(40)
    expect(messageDraftAllowance(null)).toBe(40)
    expect(messageDraftAllowance('PREMIUM')).toBe(600) // case-insensitive
  })
})

describe('getMessageDraftUsage', () => {
  it('computes remaining from the stored count + tier limit', async () => {
    selectResult = [{ count: 10 }]
    expect(await getMessageDraftUsage('org_1', 'pro')).toMatchObject({ used: 10, limit: 250, remaining: 240 })
  })
  it('clamps remaining at zero when over-limit', async () => {
    selectResult = [{ count: 999 }]
    expect((await getMessageDraftUsage('org_1', 'basic')).remaining).toBe(0)
  })
})

describe('draftPatientReply', () => {
  it('returns not_configured when the AI key is absent (no model call)', async () => {
    aiConfigured.mockReturnValue(false)
    const res = await draftPatientReply(input)
    expect(res).toEqual({ ok: false, reason: 'not_configured' })
    expect(runClaudeJson).not.toHaveBeenCalled()
  })

  it('returns no_allowance when the monthly cap is spent (no model call)', async () => {
    selectResult = [{ count: 600 }] // premium limit
    const res = await draftPatientReply(input)
    expect(res).toEqual({ ok: false, reason: 'no_allowance' })
    expect(runClaudeJson).not.toHaveBeenCalled()
  })

  it('returns no_messages when the thread does not resolve', async () => {
    threadById.mockResolvedValue(null)
    expect(await draftPatientReply(input)).toEqual({ ok: false, reason: 'no_messages' })
    expect(runClaudeJson).not.toHaveBeenCalled()
  })

  it('returns no_messages when the thread has no messages', async () => {
    listMessages.mockResolvedValue([])
    expect(await draftPatientReply(input)).toEqual({ ok: false, reason: 'no_messages' })
    expect(runClaudeJson).not.toHaveBeenCalled()
  })

  it('drafts a reply, increments usage, and reports remaining on success', async () => {
    selectResult = [{ count: 0 }]
    runClaudeJson.mockResolvedValue({ reply: 'Of course, Mia — what day works better for you?' })
    const res = await draftPatientReply(input)
    expect(res).toEqual({ ok: true, draft: 'Of course, Mia — what day works better for you?', remaining: 600 })
    expect(insertCalls).toHaveLength(1) // usage incremented exactly once
  })

  it('feeds the transcript + first name into the prompt', async () => {
    runClaudeJson.mockResolvedValue({ reply: 'Sure thing.' })
    await draftPatientReply(input)
    const arg = runClaudeJson.mock.calls[0][0] as { messages: Array<{ content: string }>; system: string }
    expect(arg.messages[0].content).toContain('Mia')
    expect(arg.messages[0].content).toContain('Can I move my Thursday cleaning?')
    expect(arg.system).toContain('VOICE RULES')
  })

  it('degrades to failed when the model call throws (no usage burned)', async () => {
    runClaudeJson.mockRejectedValue(new Error('boom'))
    expect(await draftPatientReply(input)).toEqual({ ok: false, reason: 'failed' })
    expect(insertCalls).toHaveLength(0)
  })

  it('degrades to failed when the tool result is malformed', async () => {
    runClaudeJson.mockResolvedValue({ notReply: 123 })
    expect(await draftPatientReply(input)).toEqual({ ok: false, reason: 'failed' })
    expect(insertCalls).toHaveLength(0)
  })
})

describe('translateMessage (preferred-language sending)', () => {
  it('translates + meters against the shared allowance pool', async () => {
    runClaudeJson.mockResolvedValue({ translated: 'Hola María — su cita es el jueves a las 2:00 PM.' })
    const r = await translateMessage({
      organizationId: 'org_1',
      text: 'Hi Maria — your visit is Thursday at 2:00 PM.',
      target: 'es',
      planTier: 'premium',
    })
    expect(r).toMatchObject({ ok: true, translated: expect.stringContaining('Hola María') })
    expect(insertCalls).toHaveLength(1) // shares the message_draft meter
    const arg = runClaudeJson.mock.calls[0][0] as { system: string }
    expect(arg.system).toContain('Spanish')
  })

  it('guards: empty text, over-cap, unconfigured — never throws', async () => {
    expect(await translateMessage({ organizationId: 'o', text: '  ', target: 'es', planTier: 'pro' }))
      .toEqual({ ok: false, reason: 'empty' })
    selectResult = [{ count: 600 }] // premium cap spent
    expect(await translateMessage({ organizationId: 'o', text: 'Hi', target: 'es', planTier: 'premium' }))
      .toEqual({ ok: false, reason: 'no_allowance' })
    selectResult = []
    aiConfigured.mockReturnValue(false)
    expect(await translateMessage({ organizationId: 'o', text: 'Hi', target: 'es', planTier: 'pro' }))
      .toEqual({ ok: false, reason: 'not_configured' })
    expect(runClaudeJson).not.toHaveBeenCalled()
  })

  it('degrades to failed on a model error (no usage burned)', async () => {
    runClaudeJson.mockRejectedValue(new Error('boom'))
    expect(await translateMessage({ organizationId: 'o', text: 'Hi', target: 'es', planTier: 'pro' }))
      .toEqual({ ok: false, reason: 'failed' })
    expect(insertCalls).toHaveLength(0)
  })
})
