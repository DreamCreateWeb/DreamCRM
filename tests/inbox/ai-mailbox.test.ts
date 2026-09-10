import { describe, it, expect, beforeEach } from 'vitest'
import { prewarm } from '../prewarm'

// Load the module(s) under test during COLLECTION, so no single test is
// billed for the cold module graph (see tests/prewarm.ts).
prewarm(() => import('@/lib/services/ai-mailbox'))

beforeEach(() => {
  // Make sure no key leaks in from the real env during tests.
  delete process.env.ANTHROPIC_API_KEY
})

describe('ai-mailbox: graceful degradation without ANTHROPIC_API_KEY', () => {
  it('classifyMessage returns null when no API key is set', async () => {
    const { classifyMessage } = await import('@/lib/services/ai-mailbox')
    const result = await classifyMessage({
      fromEmail: 'patient@example.com',
      fromName: 'Lisa Mabray',
      subject: 'Need to reschedule',
      bodyText: 'Hi, can I move my Tuesday appointment to Wednesday?',
      bodyHtml: null,
      snippet: null,
    })
    expect(result).toBeNull()
  })

  it('draftReply returns null when no API key is set', async () => {
    const { draftReply } = await import('@/lib/services/ai-mailbox')
    const result = await draftReply({
      patientContext: null,
      originalSubject: 'Question',
      originalBody: 'When is my appointment?',
      fromName: 'Lisa',
      fromEmail: 'lisa@example.com',
    })
    expect(result).toBeNull()
  })

  it('classifyBatch resolves to an empty map when no API key is set', async () => {
    const { classifyBatch } = await import('@/lib/services/ai-mailbox')
    const result = await classifyBatch([
      {
        id: 'm1',
        fromEmail: 'a@b.com',
        fromName: null,
        subject: 's',
        bodyText: 'body',
        bodyHtml: null,
        snippet: null,
      },
      {
        id: 'm2',
        fromEmail: 'c@d.com',
        fromName: null,
        subject: 's',
        bodyText: 'body',
        bodyHtml: null,
        snippet: null,
      },
    ])
    expect(result.size).toBe(0)
  })
})
