import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * WHOSE SCANNING ALLOWANCE? (`readInsuranceCardAction`, DREAMCRM-32)
 *
 * Every card scan spends from the clinic's 400-a-month cap. The action used to
 * take the organization id straight from the browser with nothing checking it
 * against the page it was served from, and — alone among the public-site
 * actions — it had no rate limit. So anyone who could upload an image could
 * point an ARBITRARY clinic's cap at it and drain it, one request at a time,
 * as fast as they liked.
 *
 * What these pin, in the order the action runs them:
 *
 *  1. the rate limit comes FIRST, before any lookup;
 *  2. the org comes from the PUBLIC SLUG, never from a caller-supplied id;
 *  3. the form template is re-validated against THAT org, so the caller has to
 *     name a real, unarchived form of the clinic whose page they claim to be
 *     on — an archived one is not a door into the allowance either.
 */

const rateLimit = vi.fn(async (_name: string, _opts?: unknown) => true)
vi.mock('@/lib/services/rate-limit', () => ({
  rateLimitPublicAction: (name: string, opts?: unknown) => rateLimit(name, opts),
}))

// 'dream-dental' is the only clinic with a public site here.
vi.mock('@/lib/services/clinic-site', () => ({
  resolveClinicOrgIdBySlug: async (slug?: string) => (slug === 'dream-dental' ? 'org_dream' : null),
}))

const templates: Record<string, { id: string; archivedAt: Date | null } | null> = {}
const getFormTemplate = vi.fn(async (orgId: string, id: string) => templates[`${orgId}:${id}`] ?? null)
vi.mock('@/lib/services/forms', () => ({
  getFormTemplate: (orgId: string, id: string) => getFormTemplate(orgId, id),
  submitForm: vi.fn(),
}))

const readInsuranceCard = vi.fn(async (_input: { organizationId: string; imageUrls: string[] }) => ({
  ok: true as const,
  fields: {
    provider: 'Delta Dental',
    memberId: 'M123',
    groupNumber: null,
    planName: null,
    subscriberName: null,
  },
}))
vi.mock('@/lib/services/insurance-ocr', () => ({
  readInsuranceCard: (input: { organizationId: string; imageUrls: string[] }) =>
    readInsuranceCard(input),
}))

// The storage-host gate has its own tests; here it only has to let ours through.
vi.mock('@/lib/attachment-hosts', () => ({
  isAllowedAttachmentUrl: (u: string) => u.startsWith('https://dreamcrm-uploads-prod.s3.'),
}))

import { readInsuranceCardAction } from '@/app/site/[slug]/intake/[formSlug]/actions'

const OURS = 'https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/card-front.jpg'
const SCOPE = { siteSlug: 'dream-dental', templateId: 'tpl_1' }

beforeEach(() => {
  for (const k of Object.keys(templates)) delete templates[k]
  templates['org_dream:tpl_1'] = { id: 'tpl_1', archivedAt: null }
  rateLimit.mockClear()
  rateLimit.mockResolvedValue(true)
  getFormTemplate.mockClear()
  readInsuranceCard.mockClear()
})

describe('readInsuranceCardAction — whose allowance', () => {
  it('scans for the clinic whose public page served the form', async () => {
    const res = await readInsuranceCardAction(SCOPE, [OURS])
    expect(res.ok).toBe(true)
    expect(readInsuranceCard).toHaveBeenCalledWith({
      organizationId: 'org_dream',
      imageUrls: [OURS],
    })
  })

  it('rate-limits BEFORE it touches the database', async () => {
    rateLimit.mockResolvedValue(false)
    const res = await readInsuranceCardAction(SCOPE, [OURS])
    expect(res).toMatchObject({ ok: false })
    // Nothing was looked up and nothing was billed — the point of putting the
    // limit first is that a flood costs us a counter, not a query.
    expect(getFormTemplate).not.toHaveBeenCalled()
    expect(readInsuranceCard).not.toHaveBeenCalled()
  })

  it('is rate-limited under its own name, not shared with another action', async () => {
    await readInsuranceCardAction(SCOPE, [OURS])
    expect(rateLimit.mock.calls[0][0]).toBe('insurance_ocr')
  })

  it('spends nothing when the slug names no clinic', async () => {
    const res = await readInsuranceCardAction({ siteSlug: 'not-a-clinic', templateId: 'tpl_1' }, [OURS])
    expect(res).toMatchObject({ ok: false })
    expect(readInsuranceCard).not.toHaveBeenCalled()
  })

  it('spends nothing when the form belongs to a DIFFERENT clinic', async () => {
    // The caller names the real form id of another practice. Before, the org
    // came from the caller too, so this scanned on that practice's allowance.
    templates['org_other:tpl_other'] = { id: 'tpl_other', archivedAt: null }
    const res = await readInsuranceCardAction(
      { siteSlug: 'dream-dental', templateId: 'tpl_other' },
      [OURS],
    )
    expect(res).toMatchObject({ ok: false })
    expect(getFormTemplate).toHaveBeenCalledWith('org_dream', 'tpl_other')
    expect(readInsuranceCard).not.toHaveBeenCalled()
  })

  it('spends nothing on an archived form', async () => {
    templates['org_dream:tpl_1'] = { id: 'tpl_1', archivedAt: new Date('2026-01-01') }
    const res = await readInsuranceCardAction(SCOPE, [OURS])
    expect(res).toMatchObject({ ok: false })
    expect(readInsuranceCard).not.toHaveBeenCalled()
  })

  it('spends nothing on an empty or malformed scope', async () => {
    for (const scope of [
      { siteSlug: '', templateId: 'tpl_1' },
      { siteSlug: 'dream-dental', templateId: '' },
      undefined as never,
    ]) {
      const res = await readInsuranceCardAction(scope, [OURS])
      expect(res).toMatchObject({ ok: false })
    }
    expect(readInsuranceCard).not.toHaveBeenCalled()
  })

  it('still drops images that are not on our own storage', async () => {
    const res = await readInsuranceCardAction(SCOPE, ['https://attacker.example/huge.png'])
    expect(res).toMatchObject({ ok: false })
    expect(readInsuranceCard).not.toHaveBeenCalled()
  })
})
