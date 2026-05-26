import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: Array<{ input: Record<string, any> }> = []

vi.mock('@aws-sdk/client-sesv2', () => {
  class SESv2Client {
    constructor(public cfg: unknown) {}
    async send(cmd: { input: Record<string, unknown> }) {
      sent.push(cmd as { input: Record<string, any> })
      return { MessageId: 'msg-123' }
    }
  }
  class SendEmailCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  return { SESv2Client, SendEmailCommand }
})

import { sendEmailViaSes } from '@/lib/ses'

beforeEach(() => {
  sent.length = 0
  delete process.env.SES_CONFIGURATION_SET
})

describe('sendEmailViaSes', () => {
  it('maps a simple html email to SES v2 SendEmail input', async () => {
    const res = await sendEmailViaSes({
      from: 'A <a@x.com>',
      to: 'b@y.com',
      subject: 'Hi',
      html: '<p>hello</p>',
    })
    expect(res.messageId).toBe('msg-123')
    const input = sent[0].input
    expect(input.FromEmailAddress).toBe('A <a@x.com>')
    expect(input.Destination.ToAddresses).toEqual(['b@y.com'])
    expect(input.Content.Simple.Subject.Data).toBe('Hi')
    expect(input.Content.Simple.Body.Html.Data).toBe('<p>hello</p>')
    expect(input.Content.Simple.Body.Html.Charset).toBe('UTF-8')
  })

  it('accepts arrays for to/replyTo and maps headers + tags', async () => {
    await sendEmailViaSes({
      from: 'f@x.com',
      to: ['a@x.com', 'b@x.com'],
      replyTo: 'r@x.com',
      subject: 's',
      html: 'h',
      headers: { 'List-Unsubscribe': '<https://u>' },
      tags: { campaign: 'c1' },
    })
    const input = sent[0].input
    expect(input.Destination.ToAddresses).toEqual(['a@x.com', 'b@x.com'])
    expect(input.ReplyToAddresses).toEqual(['r@x.com'])
    expect(input.Content.Simple.Headers).toEqual([
      { Name: 'List-Unsubscribe', Value: '<https://u>' },
    ])
    expect(input.EmailTags).toEqual([{ Name: 'campaign', Value: 'c1' }])
  })

  it('falls back to SES_CONFIGURATION_SET when no explicit set is passed', async () => {
    process.env.SES_CONFIGURATION_SET = 'cfg-1'
    await sendEmailViaSes({ from: 'f@x.com', to: 'a@x.com', subject: 's', html: 'h' })
    expect(sent[0].input.ConfigurationSetName).toBe('cfg-1')
  })

  it('omits optional fields when not provided', async () => {
    await sendEmailViaSes({ from: 'f@x.com', to: 'a@x.com', subject: 's', html: 'h' })
    const input = sent[0].input
    expect(input.ReplyToAddresses).toBeUndefined()
    expect(input.EmailTags).toBeUndefined()
    expect(input.Content.Simple.Headers).toBeUndefined()
  })
})
