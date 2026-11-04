import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: Array<Record<string, unknown>> = []
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async (m: Record<string, unknown>) => { sent.push(m); return { data: { id: 'e1' }, error: null } } }
  },
}))

import { isAutomatedInbound, normalizeInboundHeaders, normalizeInboundEmail } from '@/lib/inbound-email'
import { sendPatientMessageEmail } from '@/lib/email'
import { afterHoursReplyDelivery, INBOUND_EMAIL_AUTO_REPLY_DEDUP_MS } from '@/lib/services/patient-messaging'

describe('isAutomatedInbound — the loop guard matrix', () => {
  const cases: Array<[string, Record<string, string>, boolean]> = [
    ['no automation headers', { subject: 'x' }, false],
    ['Auto-Submitted: auto-replied', { 'Auto-Submitted': 'auto-replied' }, true],
    ['Auto-Submitted: auto-generated', { 'auto-submitted': 'auto-generated' }, true],
    ['Auto-Submitted: no (a human)', { 'Auto-Submitted': 'no' }, false],
    ['Precedence: bulk', { Precedence: 'bulk' }, true],
    ['Precedence: auto_reply', { precedence: 'Auto_Reply' }, true],
    ['Precedence: list', { Precedence: 'list' }, true],
    ['Precedence: first-class', { Precedence: 'first-class' }, false],
    ['X-Autoreply', { 'X-Autoreply': 'yes' }, true],
    ['X-Autorespond', { 'X-Autorespond': '1' }, true],
    ['X-Auto-Response-Suppress', { 'X-Auto-Response-Suppress': 'All' }, true],
  ]
  for (const [name, headers, expected] of cases) {
    it(`${name} → ${expected}`, () => {
      expect(isAutomatedInbound(headers)).toBe(expected)
    })
  }
  it('robot-named senders are automated; a person is not', () => {
    expect(isAutomatedInbound({}, 'mailer-daemon@x.com')).toBe(true)
    expect(isAutomatedInbound({}, 'no-reply@x.com')).toBe(true)
    expect(isAutomatedInbound({}, 'mia@x.com')).toBe(false)
  })
  it('null/undefined headers are not automated', () => {
    expect(isAutomatedInbound(null)).toBe(false)
    expect(isAutomatedInbound(undefined)).toBe(false)
  })
  it('reads both header shapes the provider might send', () => {
    expect(normalizeInboundHeaders([{ name: 'Auto-Submitted', value: 'auto-replied' }])).toEqual({ 'auto-submitted': 'auto-replied' })
    expect(normalizeInboundHeaders({ Precedence: 'bulk', n: 3 })).toEqual({ precedence: 'bulk' })
    const n = normalizeInboundEmail({ from: 'a@b.com', to: ['c@d.com'], text: 'hi', headers: { 'X-Autoreply': 'yes' } })
    expect(isAutomatedInbound(n!.headers, n!.fromEmail)).toBe(true)
  })
})

describe('the inbound-email rail', () => {
  it('an emailed reply earns the ack by email; robots never reach this source', () => {
    expect(afterHoursReplyDelivery({ channel: 'email', source: 'inbound_email' })).toBe('email')
    expect(afterHoursReplyDelivery({ channel: 'email' })).toBeNull()
  })
  it('once per thread per day', () => {
    expect(INBOUND_EMAIL_AUTO_REPLY_DEDUP_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('our auto-reply carries Auto-Submitted', () => {
  beforeEach(() => {
    sent.length = 0
    process.env.RESEND_API_KEY = 're_test'
  })
  it('sends Auto-Submitted: auto-replied in the branded shell, escaped', async () => {
    await sendPatientMessageEmail({
      to: 'mia@patient.com',
      patientFirstName: 'Mia <b>',
      clinicName: 'Acme Dental',
      body: 'We are closed <script>',
      from: 'Acme Dental <acme@dreamcreatestudio.com>',
      autoReply: { sender: { from: 'x', replyTo: null, name: 'Acme Dental', timeZone: 'America/New_York' } },
    })
    const m = sent[0] as { headers: Record<string, string>; html: string }
    expect(m.headers['Auto-Submitted']).toBe('auto-replied')
    expect(m.html).toContain('data-patient-header')
    expect(m.html).not.toContain('<script>')
  })
  it('a normal staff message carries no Auto-Submitted header', async () => {
    await sendPatientMessageEmail({ to: 'mia@patient.com', patientFirstName: 'Mia', clinicName: 'Acme', body: 'Hi' })
    expect((sent[0] as { headers?: unknown }).headers).toBeUndefined()
  })
})
