import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE DREAM TEAM's SERVER GATES (docs/ai-operations.md, D8/D11).
 *
 * These actions are reachable by any signed-in user who can POST — the
 * dashboard shell's wall HIDES the page from a shut-down clinic, and a
 * hidden UI is not a gate. Both Sandman actions spend the practice's AI
 * budget or start real work, which is exactly what the crons already refuse
 * to do for a parked account.
 */

const ctx = vi.hoisted(() => ({
  value: {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    userId: 'u_1',
    isDemo: false,
  } as Record<string, unknown>,
}))
vi.mock('@/lib/auth/context', () => ({ requireTenant: vi.fn(async () => ctx.value) }))

const state = vi.hoisted(() => ({ shutDown: false, asked: 0, ran: [] as string[] }))
vi.mock('@/lib/services/billing-state', () => ({
  isClinicShutDown: vi.fn(async () => state.shutDown),
}))
vi.mock('@/lib/services/sandman', () => ({
  askSandman: vi.fn(async () => {
    state.asked += 1
    return { answer: 'Nine seated so far.', actions: [], requests: [{ kind: 'draft_social', label: 'x' }] }
  }),
}))
vi.mock('@/lib/services/sandman-requests', () => ({
  runSandmanRequest: vi.fn(async (_org: string, _name: string, kind: string) => {
    state.ran.push(kind)
    return { ok: true, message: 'Done.' }
  }),
}))

import { askSandmanAction, askTeamForWorkAction } from '@/app/(default)/dream-team/actions'

beforeEach(() => {
  ctx.value = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    userId: 'u_1',
    isDemo: false,
  }
  state.shutDown = false
  state.asked = 0
  state.ran = []
})

describe('askSandmanAction', () => {
  it('answers for clinic staff, and hands back the registry’s own labels', async () => {
    const r = await askSandmanAction({ query: 'how is the month going?' })
    expect(r.ok).toBe(true)
    expect(state.asked).toBe(1)
    expect(r.requests[0]).toEqual({ kind: 'draft_social', label: 'Draft a post for me' })
  })

  it('refuses a patient tenant outright', async () => {
    ctx.value = { ...ctx.value, tenantType: 'patient' }
    const r = await askSandmanAction({ query: 'anything' })
    expect(r.ok).toBe(false)
    expect(state.asked).toBe(0)
  })

  it('a SHUT-DOWN clinic never reaches the model — the wall is a gate, not a hidden page', async () => {
    state.shutDown = true
    const r = await askSandmanAction({ query: 'how is the month going?' })
    expect(r.ok).toBe(false)
    expect(r.answer).toMatch(/paused while the account is on hold/i)
    expect(state.asked).toBe(0)
  })

  it('an empty question costs nothing', async () => {
    const r = await askSandmanAction({ query: '   ' })
    expect(r.ok).toBe(false)
    expect(state.asked).toBe(0)
  })
})

describe('askTeamForWorkAction', () => {
  it('runs the named generator for a clinic', async () => {
    const r = await askTeamForWorkAction({ kind: 'plan_month' })
    expect(r.ok).toBe(true)
    expect(state.ran).toEqual(['plan_month'])
  })

  it('refuses a kind that is not in the closed registry', async () => {
    const r = await askTeamForWorkAction({ kind: 'email_everyone' })
    expect(r.ok).toBe(false)
    expect(state.ran).toEqual([])
  })

  it('refuses a patient, who has no team to put to work', async () => {
    ctx.value = { ...ctx.value, tenantType: 'clinic', role: 'patient' }
    const r = await askTeamForWorkAction({ kind: 'draft_social' })
    expect(r.ok).toBe(false)
    expect(state.ran).toEqual([])
  })

  it('a SHUT-DOWN clinic starts no work — its engine is meant to be parked', async () => {
    state.shutDown = true
    const r = await askTeamForWorkAction({ kind: 'draft_social' })
    expect(r.ok).toBe(false)
    expect(state.ran).toEqual([])
  })
})
