/**
 * The Action Ledger service — the fire-and-forget contract. The one law that
 * makes it safe to sprinkle recordAction into every automation: bookkeeping
 * can NEVER break the action it describes. A reminder that already went out
 * must not throw because the ledger insert hiccuped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({ values: (...a: unknown[]) => insertMock(...a) }),
    select: () => {
      throw new Error('not used in these tests')
    },
  },
}))

import { recordAction } from '@/lib/services/action-ledger'

beforeEach(() => {
  insertMock.mockReset()
})

describe('recordAction', () => {
  it('writes the row and resolves true', async () => {
    insertMock.mockResolvedValueOnce(undefined)
    const ok = await recordAction({
      organizationId: 'org_1',
      capability: 'appointment_reminder',
      patientId: 'pat_1',
      summary: 'Reminded Maria about Tue, Jul 28, 2:00 PM',
      detail: { channel: 'email' },
    })
    expect(ok).toBe(true)
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>
    expect(row.organizationId).toBe('org_1')
    expect(row.capability).toBe('appointment_reminder')
    expect(row.patientId).toBe('pat_1')
    expect(String(row.id)).toMatch(/^act_/)
  })

  it('NEVER throws when the insert fails — the action it describes already happened', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertMock.mockRejectedValueOnce(new Error('db down'))
    const ok = await recordAction({
      organizationId: 'org_1',
      capability: 'review_request',
      summary: 'Asked Rob for a Google review after their visit',
    })
    expect(ok).toBe(false)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('omits patientId/detail cleanly when not provided', async () => {
    insertMock.mockResolvedValueOnce(undefined)
    await recordAction({
      organizationId: 'org_1',
      capability: 'campaign_send',
      summary: 'Sent “Spring recall” to 41 people',
    })
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>
    expect(row.patientId).toBeNull()
    expect(row.detail).toBeNull()
  })
})
