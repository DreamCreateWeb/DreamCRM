import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE CHAIR READ, step one (ML-27, G3-6): the pre-visit summary runs on
 * submit — best-effort, last, never failing the submit. AI off is the
 * service's own `not_configured` short-circuit (tests/intake-forms/
 * intake-summary.test.ts); here the contract is that submitForm CALLS it
 * with the new row and survives it throwing.
 */

const state = { selectQueue: [] as unknown[][] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: () => ({ returning: async () => [{ id: 'sub_new' }] }) }),
    },
  }
})
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn(async () => undefined) }))

const { summarizeSubmission } = vi.hoisted(() => ({
  summarizeSubmission: vi.fn(async () => ({ ok: true, summary: { summary: 's', alerts: [] } })),
}))
vi.mock('@/lib/services/intake-summary', () => ({ summarizeSubmission }))

import { submitForm } from '@/lib/services/forms'

beforeEach(() => {
  state.selectQueue = []
  summarizeSubmission.mockClear()
})

describe('submitForm → the pre-visit summary', () => {
  it('summarizes the new submission on submit, scoped to the org', async () => {
    state.selectQueue.push([]) // no patient match
    const row = await submitForm({ organizationId: 'org_1', formTemplateId: 'tmpl_1', data: { meds: 'warfarin' }, submitterEmail: 'x@y.com' })
    expect(row.id).toBe('sub_new')
    expect(summarizeSubmission).toHaveBeenCalledTimes(1)
    expect(summarizeSubmission).toHaveBeenCalledWith({ organizationId: 'org_1', submissionId: 'sub_new' })
  })

  it('a throwing summary never fails the submit — the row is the source of truth', async () => {
    summarizeSubmission.mockRejectedValueOnce(new Error('model down'))
    state.selectQueue.push([])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const row = await submitForm({ organizationId: 'org_1', formTemplateId: 'tmpl_1', data: { x: 'y' } })
      expect(row.id).toBe('sub_new')
    } finally {
      warn.mockRestore()
    }
  })
})
