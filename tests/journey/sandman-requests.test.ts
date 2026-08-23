import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PUTTING THE TEAM TO WORK (docs/ai-operations.md, D8). The contract under
 * test: a request runs an EXISTING generator and nothing else, "nothing to
 * draft" is a NORMAL outcome said in the practice's own terms, and a broken
 * generator answers with an apology rather than throwing into a chat panel.
 */

const { mockSocial, mockPlan, mockRecall, mockGap } = vi.hoisted(() => ({
  mockSocial: vi.fn(async (..._a: unknown[]) => 1),
  mockPlan: vi.fn(async (..._a: unknown[]) => 1),
  mockRecall: vi.fn(async (..._a: unknown[]) => 1),
  mockGap: vi.fn(async (..._a: unknown[]) => 1),
}))
vi.mock('@/lib/services/proposal-generators', () => ({
  generateSocialPostProposals: mockSocial,
  generateContentPlanProposals: mockPlan,
  generateOutreachCampaignProposals: mockRecall,
  generateScheduleGapProposals: mockGap,
}))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import { runSandmanRequest } from '@/lib/services/sandman-requests'

beforeEach(() => {
  for (const m of [mockSocial, mockPlan, mockRecall, mockGap]) {
    m.mockClear()
    m.mockResolvedValue(1)
  }
})

const NOW = new Date('2026-08-23T15:00:00Z')

describe('runSandmanRequest', () => {
  it('each kind runs its OWN generator and no other', async () => {
    await runSandmanRequest('org_1', 'Acme Dental', 'draft_social', NOW)
    expect(mockSocial).toHaveBeenCalledTimes(1)
    expect(mockPlan).not.toHaveBeenCalled()

    await runSandmanRequest('org_1', 'Acme Dental', 'plan_month', NOW)
    expect(mockPlan).toHaveBeenCalledTimes(1)

    await runSandmanRequest('org_1', 'Acme Dental', 'recall_campaign', NOW)
    expect(mockRecall).toHaveBeenCalledTimes(1)

    await runSandmanRequest('org_1', 'Acme Dental', 'fill_week', NOW)
    expect(mockGap).toHaveBeenCalledTimes(1)
  })

  it('passes the CLINIC’s timezone, so a generator’s day math is the practice’s day', async () => {
    await runSandmanRequest('org_1', 'Acme Dental', 'draft_social', NOW)
    expect(mockSocial).toHaveBeenCalledWith('org_1', 'Acme Dental', NOW, 'America/Chicago')
  })

  it('reports a drafted card as waiting on a yes — never as sent', async () => {
    const r = await runSandmanRequest('org_1', 'Acme Dental', 'draft_social', NOW)
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/waiting on your yes/i)
    expect(r.message).not.toMatch(/sent|posted|went out/i)
  })

  it('a generator that files nothing is a NORMAL answer, in that request’s own terms', async () => {
    mockSocial.mockResolvedValueOnce(0)
    const post = await runSandmanRequest('org_1', 'Acme Dental', 'draft_social', NOW)
    expect(post.ok).toBe(true)
    expect(post.message).toMatch(/already one waiting/i)

    mockGap.mockResolvedValueOnce(0)
    const week = await runSandmanRequest('org_1', 'Acme Dental', 'fill_week', NOW)
    expect(week.ok).toBe(true)
    // A full week is GOOD NEWS — the copy must not read as a failure.
    expect(week.message).toMatch(/well booked/i)
  })

  it('a broken generator apologises instead of throwing into the conversation', async () => {
    mockPlan.mockRejectedValueOnce(new Error('provider down'))
    const r = await runSandmanRequest('org_1', 'Acme Dental', 'plan_month', NOW)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/didn’t go through/i)
  })

  it('an unreadable timezone still runs the work, on the default zone', async () => {
    const tz = await import('@/lib/services/clinic-timezone')
    vi.mocked(tz.getClinicTimeZone).mockRejectedValueOnce(new Error('db down'))
    const r = await runSandmanRequest('org_1', 'Acme Dental', 'draft_social', NOW)
    expect(r.ok).toBe(true)
    expect(mockSocial).toHaveBeenCalledWith('org_1', 'Acme Dental', NOW, 'America/New_York')
  })
})
