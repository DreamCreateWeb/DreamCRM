import { describe, it, expect, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  // Make sure no key leaks in from the real env during tests.
  delete process.env.ANTHROPIC_API_KEY
})

describe('ai-mailbox: graceful degradation without ANTHROPIC_API_KEY', () => {
  it('classifyIntent returns null when no API key is set', async () => {
    const { classifyIntent } = await import('@/lib/services/ai-mailbox')
    const result = await classifyIntent({
      fromEmail: 'patient@example.com',
      subject: 'Need to reschedule',
      bodyText: 'Hi, can I move my Tuesday appointment to Wednesday?',
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
      { id: 'm1', fromEmail: 'a@b.com', subject: 's', bodyText: 'body', snippet: null },
      { id: 'm2', fromEmail: 'c@d.com', subject: 's', bodyText: 'body', snippet: null },
    ])
    expect(result.size).toBe(0)
  })
})
