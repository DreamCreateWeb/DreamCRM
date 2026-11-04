import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `sendTestEmailAction`: owner/admin only, ONLY to the signed-in user's own
 * address, 5 an hour per user, never a free-form recipient.
 */

const ctx = { tenantType: 'clinic', role: 'owner', organizationId: 'org-1', userId: 'u-1', userEmail: 'me@clinic.test' }
vi.mock('@/lib/auth/context', () => ({ requireTenant: async () => ctx }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
const sendTest = vi.fn(async () => {})
const render = vi.fn(async () => ({ subject: 's', html: '<p>h</p>', text: 'h' }))
vi.mock('@/lib/services/email-automations', () => ({
  saveEmailAutomationOverride: vi.fn(),
  renderAutomationPreview: (...a: unknown[]) => render(...(a as [])),
  sendAutomationTestEmail: (...a: unknown[]) => sendTest(...(a as [])),
}))
vi.mock('@/lib/services/reminder-automation', () => ({ updateReminderSettings: vi.fn() }))
const checkRateLimit = vi.fn(async (_k: string, _l: number, _w: number) => ({ allowed: true, count: 1 }))
vi.mock('@/lib/services/rate-limit', () => ({
  checkRateLimit: (k: string, l: number, w: number) => checkRateLimit(k, l, w),
}))

import { sendTestEmailAction, previewEmailAutomationAction } from '@/app/(default)/settings/automations/emails/actions'

beforeEach(() => {
  sendTest.mockClear()
  checkRateLimit.mockClear()
  ctx.role = 'owner'
  ctx.tenantType = 'clinic'
})

describe('sendTestEmailAction', () => {
  it('sends to the signed-in user only and rate-limits 5/hour/user', async () => {
    const r = await sendTestEmailAction('cancellation', { body: 'x' })
    expect(r).toEqual({ ok: true, to: 'me@clinic.test' })
    expect(sendTest).toHaveBeenCalledWith('org-1', 'cancellation', { body: 'x' }, 'me@clinic.test')
    expect(checkRateLimit).toHaveBeenCalledWith('email-test:u-1', 5, 3_600_000)
  })

  it('refuses past the limit with a plain message and sends nothing', async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, count: 6 })
    const r = await sendTestEmailAction('cancellation', {})
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/5 test emails in the last hour/)
    expect(sendTest).not.toHaveBeenCalled()
  })

  it('refuses a member, an unknown key and a non-clinic', async () => {
    ctx.role = 'member'
    expect((await sendTestEmailAction('cancellation', {})).ok).toBe(false)
    ctx.role = 'owner'
    expect((await sendTestEmailAction('nope', {})).ok).toBe(false)
    ctx.tenantType = 'platform'
    expect((await sendTestEmailAction('cancellation', {})).ok).toBe(false)
    expect(sendTest).not.toHaveBeenCalled()
  })

  it('the preview action is open to any clinic member and sends nothing', async () => {
    ctx.role = 'member'
    const r = await previewEmailAutomationAction('cancellation', {})
    expect(r.ok).toBe(true)
    expect(sendTest).not.toHaveBeenCalled()
  })
})
