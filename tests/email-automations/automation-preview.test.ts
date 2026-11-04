import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `renderAutomationPreview` is the hub's preview AND the test send's body: the
 * real shell, the clinic's sender identity, sample values, a plain-text twin.
 */

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = async () => []
  return { db: chain, schema: { clinicProfile: { emailAutomations: 'x', organizationId: 'y' } } }
})
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: async () => ({
    from: '"Maple Dental" <maple@dreamcreatestudio.com>',
    replyTo: 'front@maple.test',
    name: 'Maple Dental',
    timeZone: 'America/Chicago',
    logoUrl: null,
    brandColor: '#1d6b5a',
    address: '9 Oak Ave',
    phone: '(555) 000-1111',
  }),
}))
const deliver = vi.fn(async () => {})
vi.mock('@/lib/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
  return { ...actual, deliver: (...a: unknown[]) => deliver(...(a as [])) }
})

import { renderAutomationPreview, sendAutomationTestEmail } from '@/lib/services/email-automations'
import { EMAIL_AUTOMATION_KEYS } from '@/lib/types/email-automations'

beforeEach(() => deliver.mockClear())

describe('renderAutomationPreview', () => {
  it('every registered automation renders html, a subject and a non-empty text part', async () => {
    for (const key of EMAIL_AUTOMATION_KEYS) {
      const r = await renderAutomationPreview('org-1', key)
      expect(r.subject.length, key).toBeGreaterThan(0)
      expect(r.html, key).toContain('Maple Dental')
      expect(r.text.trim().length, key).toBeGreaterThan(0)
      expect(r.text, key).not.toMatch(/<[a-z/]|\{\{/i)
      // Sample values filled; the clinic's own name, not the sample one.
      expect(r.html, key).not.toContain('{{')
    }
  })

  it('the draft wins over the saved copy, and is escaped', async () => {
    const r = await renderAutomationPreview('org-1', 'booking_confirmation', {
      subject: 'Hello {{firstName}}',
      body: 'Come in <b>soon</b> to {{clinicName}}',
    })
    expect(r.subject).toBe('Hello Jordan')
    expect(r.html).toContain('Come in &lt;b&gt;soon&lt;/b&gt; to Maple Dental')
    expect(r.text).toContain('Come in <b>soon</b> to Maple Dental')
  })

  it('adds "Hi Jordan," only when the message does not already greet', async () => {
    const bare = await renderAutomationPreview('org-1', 'contact_ack', { body: 'We got your message.' })
    expect(bare.text).toContain('Hi Jordan,')
    const greets = await renderAutomationPreview('org-1', 'contact_ack', { body: 'Hello {{firstName}}, we got it.' })
    expect(greets.text.match(/Jordan/g)).toHaveLength(1)
  })

  it('the reminder carries its confirm button as "label (url)" in the text', async () => {
    const r = await renderAutomationPreview('org-1', 'appointment_reminder')
    expect(r.text).toMatch(/Confirm my visit \(https:\/\//)
  })

  it('a test send goes through deliver() to the one address, [Test]-prefixed, with the text part', async () => {
    await sendAutomationTestEmail('org-1', 'cancellation', {}, 'me@maple.test')
    expect(deliver).toHaveBeenCalledTimes(1)
    const msg = (deliver.mock.calls[0] as unknown as [Record<string, string>])[0]
    expect(msg.to).toBe('me@maple.test')
    expect(msg.subject.startsWith('[Test] ')).toBe(true)
    expect(msg.from).toContain('Maple Dental')
    expect(msg.text.length).toBeGreaterThan(0)
    expect(msg.html).toContain('<!DOCTYPE html>')
  })
})
