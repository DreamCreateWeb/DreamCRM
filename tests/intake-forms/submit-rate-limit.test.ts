import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `submitIntakeForm` IS RATE-LIMITED (DREAMCRM-58).
 *
 * It was the last public clinic-site action without one — written up rather
 * than fixed alongside the card scanner (DREAMCRM-32) because it spends
 * nothing, so it is not the scanner's defect. What it does do is WRITE, without
 * auth: every call inserts a `form_submission` row and fires an
 * `intake_submitted` notification to the org's owners and admins, so a script
 * could bury a clinic's submissions list and their inbox together, for free.
 *
 * What these pin:
 *
 *  1. the limit refuses, with a sentence written FOR the patient — not the
 *     generic "we couldn't send that" that `publicFormFailure` produces for an
 *     internal failure, because this one tells them what to do about it;
 *  2. it runs FIRST — a refused submission never reaches `getFormTemplate` and
 *     never reaches `submitForm`, so a flood costs a counter, not a query;
 *  3. the CAP ITSELF, which is the decision in this fix rather than an
 *     implementation detail. A waiting-room iPad is one egress IP for a whole
 *     practice, and a packet is N submissions rather than one, so a cap that
 *     was merely consistent with the other public actions (3–8 per 5–10 min)
 *     would turn away real patients at the front desk. That number is
 *     asserted here so shrinking it has to be an argued change.
 */

const rateLimit = vi.fn(async (_name: string, _opts?: unknown) => true)
vi.mock('@/lib/services/rate-limit', () => ({
  rateLimitPublicAction: (name: string, opts?: unknown) => rateLimit(name, opts),
}))

const getFormTemplate = vi.fn(async (_orgId: string, _id: string) => ({
  id: 'tpl_1',
  archivedAt: null,
  schema: { fields: [] },
}))
const submitForm = vi.fn(async (_input: unknown) => ({ id: 'sub_1' }))
vi.mock('@/lib/services/forms', () => ({
  getFormTemplate: (orgId: string, id: string) => getFormTemplate(orgId, id),
  submitForm: (input: unknown) => submitForm(input),
}))

vi.mock('@/lib/services/insurance-ocr', () => ({ readInsuranceCard: vi.fn() }))
vi.mock('@/lib/attachment-hosts', () => ({ isAllowedAttachmentUrl: () => true }))
vi.mock('@/lib/services/clinic-site', () => ({ resolveClinicOrgIdBySlug: vi.fn() }))

import { submitIntakeForm } from '@/app/site/[slug]/intake/[formSlug]/actions'
import { PUBLIC_FORM_UNAVAILABLE_MESSAGE } from '@/lib/services/public-form-error'

const INPUT = {
  orgId: 'org_dream',
  templateId: 'tpl_1',
  data: {},
  submitterName: 'Ada',
  submitterEmail: 'ada@x.com',
  submitterPhone: null,
}

beforeEach(() => {
  rateLimit.mockClear()
  rateLimit.mockResolvedValue(true)
  getFormTemplate.mockClear()
  submitForm.mockClear()
})

describe('submitIntakeForm — the public write is capped', () => {
  it('rate-limits at all, under its own counter name', async () => {
    await submitIntakeForm(INPUT)

    expect(rateLimit).toHaveBeenCalledTimes(1)
    expect(rateLimit.mock.calls[0]![0]).toBe('intake_submit')
  })

  it('runs the limit BEFORE the template lookup, so a flood costs a counter not a query', async () => {
    rateLimit.mockResolvedValue(false)

    await submitIntakeForm(INPUT)

    expect(getFormTemplate).not.toHaveBeenCalled()
    expect(submitForm).not.toHaveBeenCalled()
  })

  it('refuses with a sentence the patient can act on, not the generic failure', async () => {
    rateLimit.mockResolvedValue(false)

    const res = await submitIntakeForm(INPUT)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('unreachable')
    // The generic line is for failures the patient can do nothing about. This
    // one has an action in it — wait, then send the same answers again.
    expect(res.error).not.toBe(PUBLIC_FORM_UNAVAILABLE_MESSAGE)
    expect(res.error).toMatch(/wait a minute/i)
    expect(res.error).toMatch(/answers are still here/i)
  })

  it('is sized for a waiting room and a multi-form packet, not for parity with the other actions', async () => {
    // A packet has no cap on `formIds` and submits each form independently, so
    // one patient is routinely 6–10 calls and a parent doing two children is
    // 20 — all from the practice's single egress IP. 40 per 10 minutes fits
    // three people through a ten-form packet at once; the 3–8 per 5–10 the
    // other public actions use would not.
    await submitIntakeForm(INPUT)

    expect(rateLimit.mock.calls[0]![1]).toEqual({ limit: 40, windowMs: 10 * 60 * 1000 })
  })

  it('still submits normally when under the cap', async () => {
    const res = await submitIntakeForm(INPUT)

    expect(res.ok).toBe(true)
    expect(submitForm).toHaveBeenCalledTimes(1)
  })
})
