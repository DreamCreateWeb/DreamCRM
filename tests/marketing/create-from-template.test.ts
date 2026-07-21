import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * "Start from" a template (campaigns phase 1, 2026-07-21): creating a
 * campaign with a templateId seeds subject/preview/body from the template
 * and stamps templateId on the row for provenance + won-back attribution
 * bucketing. Foreign ids resolve to null via the org-scoped getTemplate
 * and are dropped — never a cross-org copy leak.
 */

const inserts: Record<string, unknown>[] = []
const getTemplate = vi.fn()

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    db: {
      insert: () => ({
        values: (vals: Record<string, unknown>) => ({
          returning: async () => {
            inserts.push(vals)
            return [{ id: 77, ...vals }]
          },
        }),
      }),
    },
    schema,
  }
})
vi.mock('@/lib/services/marketing-templates', () => ({
  getTemplate: (...args: unknown[]) => getTemplate(...args),
}))

import { createMarketingCampaign } from '@/lib/services/marketing-campaigns'

const TPL = {
  id: 9,
  subject: 'Has it been a minute?',
  previewText: 'A friendly nudge.',
  bodyHtml: '<p>Hi {{firstName}},</p>',
  bodyJson: null,
}

beforeEach(() => {
  inserts.length = 0
  getTemplate.mockReset()
})

describe('createMarketingCampaign — start from template', () => {
  it('seeds subject/preview/body from the template and stamps templateId', async () => {
    getTemplate.mockResolvedValue(TPL)
    await createMarketingCampaign('org_a', { name: 'Recall push', sendChannel: 'resend', templateId: 9 }, 'user_1')
    expect(getTemplate).toHaveBeenCalledWith('org_a', 9)
    expect(inserts[0]).toMatchObject({
      organizationId: 'org_a',
      subject: TPL.subject,
      previewText: TPL.previewText,
      bodyHtml: TPL.bodyHtml,
      templateId: 9,
      status: 'draft',
    })
  })

  it('explicit content in the input wins over the template', async () => {
    getTemplate.mockResolvedValue(TPL)
    await createMarketingCampaign(
      'org_a',
      { name: 'X', sendChannel: 'resend', templateId: 9, subject: 'My own subject' },
      'user_1',
    )
    expect(inserts[0].subject).toBe('My own subject')
    expect(inserts[0].bodyHtml).toBe(TPL.bodyHtml)
  })

  it('drops a template that does not resolve for this org (no seed, no stamp)', async () => {
    getTemplate.mockResolvedValue(null)
    await createMarketingCampaign('org_b', { name: 'X', sendChannel: 'resend', templateId: 999 }, 'user_1')
    expect(inserts[0]).toMatchObject({ subject: null, bodyHtml: null, templateId: null })
  })

  it('never fetches a template when none was picked (blank)', async () => {
    await createMarketingCampaign('org_a', { name: 'Blank one', sendChannel: 'resend' }, 'user_1')
    expect(getTemplate).not.toHaveBeenCalled()
    expect(inserts[0]).toMatchObject({ templateId: null })
  })
})
