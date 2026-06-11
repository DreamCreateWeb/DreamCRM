import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * submitForm now pings org owners/admins so a fresh intake submission gets
 * reviewed before the visit. Best-effort — the submission row is the source of
 * truth and a notify failure must not break the submit.
 */

const state = {
  selectQueue: [] as unknown[][],
}

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
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'sub_1' }],
        }),
      }),
    },
  }
})

const { notifyOrgMembersMock } = vi.hoisted(() => ({ notifyOrgMembersMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyOrgMembersMock }))

import { submitForm } from '@/lib/services/forms'

beforeEach(() => {
  state.selectQueue = []
  vi.clearAllMocks()
})

describe('submitForm notifications', () => {
  it('notifies owners/admins, linking to the matched patient when the email resolves', async () => {
    // patient lookup by submitter email → a match
    state.selectQueue.push([{ id: 'pat_1', firstName: 'Jane', lastName: 'Doe' }])
    await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      data: { x: 'y' },
      submitterEmail: 'jane@example.com',
    })
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'intake_submitted',
        title: expect.stringContaining('Jane Doe'),
        linkPath: '/patients/pat_1',
      }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('falls back to the submitter name + /intake-forms when no patient matches', async () => {
    state.selectQueue.push([]) // no patient match
    await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      data: { x: 'y' },
      submitterName: 'Walk-in Guest',
      submitterEmail: 'nobody@example.com',
    })
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'intake_submitted',
        title: expect.stringContaining('Walk-in Guest'),
        linkPath: '/intake-forms',
      }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('still returns the submission row when the notify throws', async () => {
    notifyOrgMembersMock.mockRejectedValueOnce(new Error('notify boom'))
    state.selectQueue.push([])
    const row = await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      data: { x: 'y' },
    })
    expect(row.id).toBe('sub_1')
  })
})
