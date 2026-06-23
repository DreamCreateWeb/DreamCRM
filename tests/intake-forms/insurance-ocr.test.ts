import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Insurance-card OCR service. Verifies the config/allowance/no-image guards, the
 * happy path (cleans + returns fields, bumps usage), and that a vision failure
 * or malformed result degrades to { ok: false } without throwing.
 */

const runClaudeVisionJson = vi.fn()
const aiConfigured = vi.fn(() => true)
vi.mock('@/lib/ai', () => ({
  runClaudeVisionJson: (...a: unknown[]) => runClaudeVisionJson(...a),
  aiConfigured: () => aiConfigured(),
}))

let selectResult: Array<{ count: number }> = []
const inserts: unknown[] = []
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult }) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async (c: unknown) => { inserts.push(c) } }) }),
  },
}))

import { readInsuranceCard } from '@/lib/services/insurance-ocr'

beforeEach(() => {
  runClaudeVisionJson.mockReset()
  aiConfigured.mockReturnValue(true)
  selectResult = []
  inserts.length = 0
})

const input = { organizationId: 'org_1', imageUrls: ['https://cdn/front.jpg', 'https://cdn/back.jpg'] }

describe('readInsuranceCard', () => {
  it('returns not_configured when AI is off (no vision call)', async () => {
    aiConfigured.mockReturnValue(false)
    expect(await readInsuranceCard(input)).toEqual({ ok: false, reason: 'not_configured' })
    expect(runClaudeVisionJson).not.toHaveBeenCalled()
  })

  it('returns no_images when no valid http url is provided', async () => {
    expect(await readInsuranceCard({ organizationId: 'org_1', imageUrls: ['ftp://x', ''] })).toEqual({
      ok: false,
      reason: 'no_images',
    })
  })

  it('returns no_allowance when the monthly cap is reached', async () => {
    selectResult = [{ count: 400 }]
    expect(await readInsuranceCard(input)).toEqual({ ok: false, reason: 'no_allowance' })
    expect(runClaudeVisionJson).not.toHaveBeenCalled()
  })

  it('reads + cleans the fields and bumps usage on success', async () => {
    selectResult = [{ count: 0 }]
    runClaudeVisionJson.mockResolvedValue({
      provider: ' Delta Dental ',
      memberId: 'XYZ-123',
      groupNumber: '  ',
      planName: 'PPO',
      subscriberName: null,
    })
    const res = await readInsuranceCard(input)
    expect(res).toEqual({
      ok: true,
      fields: { provider: 'Delta Dental', memberId: 'XYZ-123', groupNumber: null, planName: 'PPO', subscriberName: null },
    })
    expect(inserts).toHaveLength(1) // usage bumped
  })

  it('caps the vision call to at most 2 images', async () => {
    selectResult = [{ count: 0 }]
    runClaudeVisionJson.mockResolvedValue({ provider: 'Cigna' })
    await readInsuranceCard({ organizationId: 'org_1', imageUrls: ['https://a/1', 'https://a/2', 'https://a/3'] })
    const arg = runClaudeVisionJson.mock.calls[0][0] as { imageUrls: string[] }
    expect(arg.imageUrls).toHaveLength(2)
  })

  it('degrades to failed when the vision call throws (no usage bump)', async () => {
    selectResult = [{ count: 0 }]
    runClaudeVisionJson.mockRejectedValue(new Error('boom'))
    expect(await readInsuranceCard(input)).toEqual({ ok: false, reason: 'failed' })
    expect(inserts).toHaveLength(0)
  })

  it('degrades to failed on a malformed result', async () => {
    selectResult = [{ count: 0 }]
    runClaudeVisionJson.mockResolvedValue({ provider: 123 })
    expect(await readInsuranceCard(input)).toEqual({ ok: false, reason: 'failed' })
    expect(inserts).toHaveLength(0)
  })
})
