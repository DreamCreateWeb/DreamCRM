import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Insurance-card OCR service. Verifies the config/allowance/no-image guards, the
 * host allowlist, the happy path (cleans + returns fields, bumps usage), and
 * that a vision failure or malformed result degrades to { ok: false } without
 * throwing.
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

/** The bucket the storage driver mints URLs on (lib/blob-s3.ts publicBase()). */
const BUCKET = 'dreamcrm-uploads'
const OURS = `https://${BUCKET}.s3.us-east-1.amazonaws.com`
const envBefore = { ...process.env }

beforeEach(() => {
  runClaudeVisionJson.mockReset()
  aiConfigured.mockReturnValue(true)
  selectResult = []
  inserts.length = 0
  process.env.S3_BUCKET = BUCKET
  process.env.S3_REGION = 'us-east-1'
  delete process.env.S3_PUBLIC_BASE_URL
  delete process.env.ATTACHMENT_HOST_ALLOWLIST
})

afterEach(() => {
  process.env = { ...envBefore }
})

const input = { organizationId: 'org_1', imageUrls: [`${OURS}/front.jpg`, `${OURS}/back.jpg`] }

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

  // ── The hole this guard closes ────────────────────────────────────────────
  // The filter used to be `/^https?:\/\//` alone, so ANY url on the internet
  // was fetched and billed to the clinic's scanning allowance. A card image
  // only ever comes from our own upload route.
  it('refuses an image url on a host we do not serve (no vision call, no spend)', async () => {
    selectResult = [{ count: 0 }]
    expect(
      await readInsuranceCard({ organizationId: 'org_1', imageUrls: ['https://attacker.example/huge.png'] }),
    ).toEqual({ ok: false, reason: 'no_images' })
    expect(runClaudeVisionJson).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
  })

  it('refuses a bucket-name lookalike host (the old substring match let this through)', async () => {
    selectResult = [{ count: 0 }]
    expect(
      await readInsuranceCard({ organizationId: 'org_1', imageUrls: [`https://${BUCKET}.attacker.example/x.png`] }),
    ).toEqual({ ok: false, reason: 'no_images' })
    expect(runClaudeVisionJson).not.toHaveBeenCalled()
  })

  it('refuses somebody else’s S3 bucket (the old amazonaws.com fallback let this through)', async () => {
    selectResult = [{ count: 0 }]
    expect(
      await readInsuranceCard({
        organizationId: 'org_1',
        imageUrls: ['https://not-ours.s3.us-east-1.amazonaws.com/x.png'],
      }),
    ).toEqual({ ok: false, reason: 'no_images' })
    expect(runClaudeVisionJson).not.toHaveBeenCalled()
  })

  it('drops only the foreign url and still reads the real card', async () => {
    selectResult = [{ count: 0 }]
    runClaudeVisionJson.mockResolvedValue({ provider: 'Cigna' })
    const res = await readInsuranceCard({
      organizationId: 'org_1',
      imageUrls: ['https://attacker.example/pixel.png', `${OURS}/front.jpg`],
    })
    expect(res.ok).toBe(true)
    const arg = runClaudeVisionJson.mock.calls[0][0] as { imageUrls: string[] }
    expect(arg.imageUrls).toEqual([`${OURS}/front.jpg`])
  })

  it('accepts the Vercel Blob per-store subdomain the driver also mints', async () => {
    selectResult = [{ count: 0 }]
    runClaudeVisionJson.mockResolvedValue({ provider: 'MetLife' })
    const res = await readInsuranceCard({
      organizationId: 'org_1',
      imageUrls: ['https://abc123.public.blob.vercel-storage.com/front.jpg'],
    })
    expect(res.ok).toBe(true)
  })

  it('accepts a CloudFront origin named in ATTACHMENT_HOST_ALLOWLIST', async () => {
    process.env.ATTACHMENT_HOST_ALLOWLIST = 'cdn.brightsmiles.com'
    selectResult = [{ count: 0 }]
    runClaudeVisionJson.mockResolvedValue({ provider: 'Delta Dental' })
    const res = await readInsuranceCard({
      organizationId: 'org_1',
      imageUrls: ['https://cdn.brightsmiles.com/front.jpg'],
    })
    expect(res.ok).toBe(true)
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
    await readInsuranceCard({ organizationId: 'org_1', imageUrls: [`${OURS}/1`, `${OURS}/2`, `${OURS}/3`] })
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
