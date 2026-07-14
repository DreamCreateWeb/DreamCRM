import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  inboundReplyAddress,
  inboundReplyDomain,
  parseInboundRecipientSlug,
  extractAddress,
  stripQuotedReply,
  htmlToPlainText,
  normalizeInboundEmail,
} from '@/lib/inbound-email'

const ENV_KEY = 'INBOUND_REPLY_DOMAIN'
let saved: string | undefined

beforeEach(() => {
  saved = process.env[ENV_KEY]
  delete process.env[ENV_KEY]
})
afterEach(() => {
  if (saved === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = saved
})

describe('inboundReplyDomain / inboundReplyAddress (the dark-ship switch)', () => {
  it('is null when the env is unset — the feature ships dark', () => {
    expect(inboundReplyDomain()).toBeNull()
    expect(inboundReplyAddress('acme-dental')).toBeNull()
  })

  it('builds {slug}@{domain}, lowercased, when configured', () => {
    process.env[ENV_KEY] = 'In.DreamCreateStudio.com'
    expect(inboundReplyAddress('Acme-Dental')).toBe('acme-dental@in.dreamcreatestudio.com')
  })

  it('null slug never mints an address', () => {
    process.env[ENV_KEY] = 'in.dreamcreatestudio.com'
    expect(inboundReplyAddress(null)).toBeNull()
    expect(inboundReplyAddress('  ')).toBeNull()
  })
})

describe('parseInboundRecipientSlug', () => {
  const D = 'in.dreamcreatestudio.com'

  it('finds the slug among mixed recipients (name-bracket form + case)', () => {
    expect(
      parseInboundRecipientSlug(
        ['someone@else.com', '"Acme Dental" <Acme-Dental@In.DreamCreateStudio.com>'],
        D,
      ),
    ).toBe('acme-dental')
  })

  it('strips a plus-tag from the local part', () => {
    expect(parseInboundRecipientSlug(['acme-dental+r42@in.dreamcreatestudio.com'], D)).toBe('acme-dental')
  })

  it('rejects lookalike domains (suffix match is not enough)', () => {
    expect(parseInboundRecipientSlug(['acme@evil-in.dreamcreatestudio.com.attacker.io'], D)).toBeNull()
    expect(parseInboundRecipientSlug(['acme@notin.dreamcreatestudio.com'], D)).toBeNull()
  })

  it('null when no recipient is on our domain', () => {
    expect(parseInboundRecipientSlug(['a@b.com', 'c@d.com'], D)).toBeNull()
  })
})

describe('extractAddress', () => {
  it('unwraps "Name <addr>" and lowercases', () => {
    expect(extractAddress('"Mia Torres" <Mia.Torres@Example.com>')).toBe('mia.torres@example.com')
    expect(extractAddress('plain@example.com')).toBe('plain@example.com')
  })
})

describe('stripQuotedReply', () => {
  it('cuts a Gmail attribution line + everything after', () => {
    const text = 'Yes, 3pm works!\n\nOn Tue, Jul 14, 2026 at 9:02 AM Dream Dental wrote:\n> Hi Mia,\n> Your visit…'
    expect(stripQuotedReply(text)).toBe('Yes, 3pm works!')
  })

  it('cuts an Outlook original-message divider', () => {
    const text = 'Please reschedule me.\n-----Original Message-----\nFrom: office@x.com'
    expect(stripQuotedReply(text)).toBe('Please reschedule me.')
  })

  it('cuts a run of >-quoted lines', () => {
    const text = 'Sounds good.\n> earlier\n> quoted history'
    expect(stripQuotedReply(text)).toBe('Sounds good.')
  })

  it('falls back to the full text when stripping would leave nothing', () => {
    const text = 'On Tue, Jul 14, 2026 at 9:02 AM Dream Dental wrote:\n> only quoted'
    expect(stripQuotedReply(text)).toBe(text.trim())
  })
})

describe('htmlToPlainText', () => {
  it('turns paragraph/br structure into newlines and drops tags', () => {
    expect(htmlToPlainText('<div><p>Hi there</p><p>Second &amp; third</p></div>')).toBe(
      'Hi there\nSecond & third',
    )
  })
})

describe('normalizeInboundEmail (defensive payload parse)', () => {
  it('parses the string-form from + string recipients', () => {
    const n = normalizeInboundEmail({
      from: '"Mia Torres" <mia@example.com>',
      to: ['acme-dental@in.dreamcreatestudio.com'],
      subject: 'Re: your visit',
      text: 'Works for me!\n\nOn Tue wrote:\n> old',
    })
    expect(n).toMatchObject({
      fromEmail: 'mia@example.com',
      fromName: 'Mia Torres',
      subject: 'Re: your visit',
      body: 'Works for me!',
    })
  })

  it('parses object-form from/to and falls back to html when no text part', () => {
    const n = normalizeInboundEmail({
      from: { email: 'Mia@Example.com', name: 'Mia' },
      to: [{ email: 'acme-dental@in.dreamcreatestudio.com' }],
      html: '<p>See you then</p>',
    })
    expect(n?.fromEmail).toBe('mia@example.com')
    expect(n?.to).toEqual(['acme-dental@in.dreamcreatestudio.com'])
    expect(n?.body).toBe('See you then')
  })

  it('null on junk (no sender / no recipients / non-object)', () => {
    expect(normalizeInboundEmail(null)).toBeNull()
    expect(normalizeInboundEmail({ to: ['x@y.com'] })).toBeNull()
    expect(normalizeInboundEmail({ from: 'a@b.com' })).toBeNull()
  })
})
