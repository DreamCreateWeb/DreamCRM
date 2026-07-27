import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase-2 plumbing: the generate-proposals cron route (CRON_SECRET-gated,
 * like all 18) and the Approval Inbox server actions' tenant gates.
 */

const { runGeneratorsMock } = vi.hoisted(() => ({
  runGeneratorsMock: vi.fn(async () => ({ orgsScanned: 2, filed: 3, expired: 1, errors: [] })),
}))
vi.mock('@/lib/services/proposal-generators', () => ({ runProposalGenerators: runGeneratorsMock }))

const ctx = { value: null as null | Record<string, unknown> }
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!ctx.value) throw new Error('Not authenticated')
    return ctx.value
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const proposalsSvc = vi.hoisted(() => ({
  approveProposal: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, status: 'approved' as const })),
  declineProposal: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, status: 'declined' as const })),
}))
vi.mock('@/lib/services/proposals', () => proposalsSvc)

import { GET as cronGET } from '@/app/api/cron/generate-proposals/route'
import { approveProposalAction, declineProposalAction } from '@/app/(default)/dashboard/actions'

beforeEach(() => {
  vi.clearAllMocks()
  ctx.value = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', userId: 'u1' }
  process.env.CRON_SECRET = 'shh'
})

describe('GET /api/cron/generate-proposals', () => {
  it('401s without the bearer secret', async () => {
    const res = await cronGET(new Request('https://x/api/cron/generate-proposals'))
    expect(res.status).toBe(401)
    expect(runGeneratorsMock).not.toHaveBeenCalled()
  })

  it('runs the generators with the secret', async () => {
    const res = await cronGET(
      new Request('https://x/api/cron/generate-proposals', { headers: { authorization: 'Bearer shh' } }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, filed: 3 })
  })
})

describe('the Approval Inbox actions', () => {
  it('any clinic STAFF role may approve — deciding is exactly the front desk’s job', async () => {
    const r = await approveProposalAction({ proposalId: 'p1', body: 'edited' })
    expect(r).toEqual({ ok: true })
    expect(proposalsSvc.approveProposal).toHaveBeenCalledWith('org_1', 'p1', 'u1', { body: 'edited' })
  })

  it('omitting body approves the draft as written (no accidental empty-body override)', async () => {
    await approveProposalAction({ proposalId: 'p1' })
    expect(proposalsSvc.approveProposal).toHaveBeenCalledWith('org_1', 'p1', 'u1', {})
  })

  it('decline routes through with the decider', async () => {
    await declineProposalAction({ proposalId: 'p1' })
    expect(proposalsSvc.declineProposal).toHaveBeenCalledWith('org_1', 'p1', 'u1')
  })

  it('patients and non-clinic tenants are rejected before the service', async () => {
    ctx.value = { tenantType: 'clinic', role: 'patient', organizationId: 'org_1', userId: 'u1' }
    expect((await approveProposalAction({ proposalId: 'p1' })).ok).toBe(false)
    ctx.value = { tenantType: 'platform', role: 'owner', organizationId: 'org_p', userId: 'u1' }
    expect((await declineProposalAction({ proposalId: 'p1' })).ok).toBe(false)
    expect(proposalsSvc.approveProposal).not.toHaveBeenCalled()
    expect(proposalsSvc.declineProposal).not.toHaveBeenCalled()
  })
})
