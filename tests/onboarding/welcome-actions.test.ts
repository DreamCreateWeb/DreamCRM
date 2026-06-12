import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /welcome server actions — the owner/admin gate + the draft lifecycle wiring.
 * Every action must:
 *   • refuse a non-clinic tenant and a clinic 'member' (only owner/admin builds
 *     the site)
 *   • forward to the service with the caller's OWN org id (never trust a client
 *     org id)
 *   • on a successful draft, ALSO complete the interview (clear draft + stamp)
 *   • be best-effort on save/skip (a hiccup returns ok:false, never throws)
 */

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  organizationId: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

const draftSiteFromInterview = vi.fn()
vi.mock('@/lib/services/ai-onboarding', () => ({
  draftSiteFromInterview: (...a: unknown[]) => draftSiteFromInterview(...a),
}))

const saveInterviewDraft = vi.fn()
const completeInterview = vi.fn()
vi.mock('@/lib/services/onboarding-draft', () => ({
  saveInterviewDraft: (...a: unknown[]) => saveInterviewDraft(...a),
  completeInterview: (...a: unknown[]) => completeInterview(...a),
}))

import {
  saveInterviewDraftAction,
  runOnboardingDraft,
  skipInterviewAction,
} from '@/app/(onboarding)/welcome/actions'

beforeEach(() => {
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1' }
  draftSiteFromInterview.mockReset()
  saveInterviewDraft.mockReset()
  completeInterview.mockReset()
})

describe('owner/admin gate', () => {
  it('runOnboardingDraft refuses a platform tenant', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'plat' }
    const res = await runOnboardingDraft({}, [])
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/clinic account/i) })
    expect(draftSiteFromInterview).not.toHaveBeenCalled()
  })

  it('runOnboardingDraft refuses a clinic member (not owner/admin)', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1' }
    const res = await runOnboardingDraft({}, [])
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/owner or an admin/i) })
    expect(draftSiteFromInterview).not.toHaveBeenCalled()
  })

  it('saveInterviewDraftAction returns ok:false for a member', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1' }
    const res = await saveInterviewDraftAction({ answers: {}, serviceSlugs: [], step: 0 })
    expect(res).toEqual({ ok: false })
    expect(saveInterviewDraft).not.toHaveBeenCalled()
  })

  it('skipInterviewAction returns ok:false for a platform tenant', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'plat' }
    const res = await skipInterviewAction()
    expect(res).toEqual({ ok: false })
    expect(completeInterview).not.toHaveBeenCalled()
  })

  it('admin is allowed through', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'admin', organizationId: 'org_a' }
    draftSiteFromInterview.mockResolvedValue({ ok: true, draftedServices: 1, skippedFields: [] })
    const res = await runOnboardingDraft({ a: 'x' }, ['cleanings'])
    expect(res.ok).toBe(true)
    expect(draftSiteFromInterview).toHaveBeenCalledWith('org_a', { a: 'x' }, ['cleanings'])
  })
})

describe('runOnboardingDraft — completion wiring', () => {
  it('completes the interview after a successful draft', async () => {
    draftSiteFromInterview.mockResolvedValue({ ok: true, draftedServices: 2, skippedFields: [] })
    const res = await runOnboardingDraft({ a: 'x' }, ['cleanings', 'whitening'])
    expect(res.ok).toBe(true)
    expect(completeInterview).toHaveBeenCalledWith('org_1')
  })

  it('does NOT complete the interview when the draft fails (floor stays, retry offered)', async () => {
    draftSiteFromInterview.mockResolvedValue({ ok: false, error: 'AI request failed — please try again' })
    const res = await runOnboardingDraft({ a: 'x' }, ['cleanings'])
    expect(res.ok).toBe(false)
    expect(completeInterview).not.toHaveBeenCalled()
  })

  it('still returns ok:true when the completion stamp throws (non-fatal)', async () => {
    draftSiteFromInterview.mockResolvedValue({ ok: true, draftedServices: 1, skippedFields: [] })
    completeInterview.mockRejectedValue(new Error('db blip'))
    const res = await runOnboardingDraft({ a: 'x' }, ['cleanings'])
    expect(res.ok).toBe(true)
  })
})

describe('saveInterviewDraftAction — best-effort', () => {
  it('forwards to the service with the caller org id', async () => {
    saveInterviewDraft.mockResolvedValue(undefined)
    const res = await saveInterviewDraftAction({
      answers: { a: 'x' },
      serviceSlugs: ['cleanings'],
      step: 2,
    })
    expect(res).toEqual({ ok: true })
    expect(saveInterviewDraft).toHaveBeenCalledWith('org_1', {
      answers: { a: 'x' },
      serviceSlugs: ['cleanings'],
      step: 2,
    })
  })

  it('returns ok:false (no throw) when the save errors', async () => {
    saveInterviewDraft.mockRejectedValue(new Error('db down'))
    const res = await saveInterviewDraftAction({ answers: {}, serviceSlugs: [], step: 0 })
    expect(res).toEqual({ ok: false })
  })
})

describe('skipInterviewAction', () => {
  it('completes the interview for an owner (the day-0 floor is a finished site)', async () => {
    completeInterview.mockResolvedValue(undefined)
    const res = await skipInterviewAction()
    expect(res).toEqual({ ok: true })
    expect(completeInterview).toHaveBeenCalledWith('org_1')
  })

  it('returns ok:false (no throw) when completion errors', async () => {
    completeInterview.mockRejectedValue(new Error('db down'))
    const res = await skipInterviewAction()
    expect(res).toEqual({ ok: false })
  })
})
