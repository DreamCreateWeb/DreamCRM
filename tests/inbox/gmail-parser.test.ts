import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.EMAIL_ENCRYPTION_KEY = 'test-key'
})

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}

describe('parseGmailMessage', () => {
  it('extracts headers, snippet, and plain-text body from a simple message', async () => {
    const { parseGmailMessage } = await import('@/lib/services/gmail')
    const parsed = parseGmailMessage({
      id: 'msg_a',
      threadId: 'thr_a',
      labelIds: ['INBOX'],
      snippet: 'Hey just checking in',
      internalDate: '1735660800000', // Jan 1 2025 UTC
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: 'Alice <alice@example.com>' },
          { name: 'To', value: 'me@dreamcreateweb.com' },
          { name: 'Subject', value: 'Welcome aboard' },
          { name: 'Date', value: 'Wed, 1 Jan 2025 00:00:00 +0000' },
        ],
        body: { data: b64url('Hey just checking in.\n\nBest,\nAlice') },
      },
    })
    expect(parsed.fromName).toBe('Alice')
    expect(parsed.fromEmail).toBe('alice@example.com')
    expect(parsed.toEmails).toEqual(['me@dreamcreateweb.com'])
    expect(parsed.subject).toBe('Welcome aboard')
    expect(parsed.snippet).toBe('Hey just checking in')
    expect(parsed.bodyText).toContain('Best,')
    expect(parsed.isRead).toBe(true) // no UNREAD label
    expect(parsed.providerMessageId).toBe('msg_a')
    expect(parsed.providerThreadId).toBe('thr_a')
  })

  it('marks isRead = false when UNREAD label is present', async () => {
    const { parseGmailMessage } = await import('@/lib/services/gmail')
    const parsed = parseGmailMessage({
      id: 'm', threadId: 't', labelIds: ['INBOX', 'UNREAD'],
      payload: { headers: [{ name: 'From', value: 'x@y.com' }] },
    })
    expect(parsed.isRead).toBe(false)
  })

  it('parses multiple To and Cc addresses', async () => {
    const { parseGmailMessage } = await import('@/lib/services/gmail')
    const parsed = parseGmailMessage({
      id: 'm', threadId: 't',
      payload: {
        headers: [
          { name: 'From', value: 'a@x.com' },
          { name: 'To', value: '"Bob" <b@x.com>, c@x.com' },
          { name: 'Cc', value: 'd@x.com, "Eve, Ms" <e@x.com>' },
        ],
      },
    })
    expect(parsed.toEmails).toEqual(['b@x.com', 'c@x.com'])
    expect(parsed.ccEmails).toEqual(['d@x.com', 'e@x.com'])
  })

  it('prefers text/plain part over the top-level body when both exist', async () => {
    const { parseGmailMessage } = await import('@/lib/services/gmail')
    const parsed = parseGmailMessage({
      id: 'm', threadId: 't',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [{ name: 'From', value: 'a@x.com' }],
        parts: [
          { mimeType: 'text/plain', body: { data: b64url('plain copy') } },
          { mimeType: 'text/html', body: { data: b64url('<b>html copy</b>') } },
        ],
      },
    })
    expect(parsed.bodyText).toBe('plain copy')
    expect(parsed.bodyHtml).toBe('<b>html copy</b>')
  })

  it("parses a bare email From header (no display name)", async () => {
    const { parseGmailMessage } = await import('@/lib/services/gmail')
    const parsed = parseGmailMessage({
      id: 'm', threadId: 't',
      payload: { headers: [{ name: 'From', value: 'noreply@stripe.com' }] },
    })
    expect(parsed.fromName).toBeNull()
    expect(parsed.fromEmail).toBe('noreply@stripe.com')
  })

  it('falls back to Date header when internalDate is missing', async () => {
    const { parseGmailMessage } = await import('@/lib/services/gmail')
    const parsed = parseGmailMessage({
      id: 'm', threadId: 't',
      payload: {
        headers: [
          { name: 'From', value: 'a@x.com' },
          { name: 'Date', value: 'Wed, 1 Jan 2025 12:00:00 +0000' },
        ],
      },
    })
    expect(parsed.receivedAt.toISOString()).toBe('2025-01-01T12:00:00.000Z')
  })
})
