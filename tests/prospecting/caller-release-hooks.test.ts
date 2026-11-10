import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * THE RELEASE HOOK RIDES EVERY UNSERVABLE FLIP (P-02 fix pass, C2 / S2).
 *
 * A caller's row leaves their reach by hands that know nothing about
 * callers: the email engine classifies a reply, the owner suppresses, a
 * signup converts, the verify pass disqualifies, a call outcome parks the
 * number. Each of those writers calls `releaseIfUnservable(prospectId)`
 * right after its own write. Here the hook is a spy and each writer is
 * driven for real; the hook's own statement is rendered in
 * caller-claim-sql.test.ts.
 */
const releaseSpy = vi.fn(async (_id: string) => true)
vi.mock('@/lib/services/prospect-caller-release', () => ({
  releaseIfUnservable: (...a: unknown[]) => releaseSpy(...(a as [string])),
}))

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.groupBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  const nameOf = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return '?'
  }
  return {
    db: {
      select: () => selectChain(),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            state.updates.push({ table: nameOf(table), values })
            const p: any = Promise.resolve([])
            p.returning = async () => []
            return p
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          state.inserts.push({ table: nameOf(table), values })
          const p: any = Promise.resolve(undefined)
          p.onConflictDoNothing = () => Promise.resolve(undefined)
          return p
        },
      }),
    },
    schema,
  }
})
vi.mock('@/lib/services/gsc', () => ({ getPlatformOrgId: async () => 'org_platform' }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn(async () => {}) }))
vi.mock('@/lib/services/demo-brief', () => ({ generateDemoBrief: vi.fn(async () => null) }))
vi.mock('@/lib/services/prospect-meetings', () => ({ getOrCreateBookingLink: vi.fn(async () => null) }))

import { logCallOutcome, markConverted, suppressProspect } from '@/lib/services/prospecting'
import { promoteProspectByEmail } from '@/lib/services/prospect-intent'

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  state.inserts = []
  releaseSpy.mockClear()
})

describe('the writers call releaseIfUnservable after their own flip', () => {
  it('markConverted — a signed practice is nobody’s cold call', async () => {
    await markConverted('p1', 'org_1')
    expect(state.updates.find((u) => u.table === 'prospect')?.values).toMatchObject({ status: 'converted' })
    expect(releaseSpy).toHaveBeenCalledWith('p1')
  })

  it('suppressProspect — an unsubscribe / a manual suppression', async () => {
    state.selectQueue.push([{ email: 'doc@smile.com' }])
    await suppressProspect('p1', 'manual')
    expect(state.updates.find((u) => u.table === 'prospect')?.values).toMatchObject({ status: 'suppressed' })
    expect(releaseSpy).toHaveBeenCalledWith('p1')
  })

  it('logCallOutcome — a no, a closed practice, a dead number: whoever logged it', async () => {
    for (const outcome of ['not_interested', 'closed', 'disconnected', 'wrong_number']) {
      releaseSpy.mockClear()
      state.selectQueue.push([]) // applyCallerFeedback's read (no row → no rescoring)
      await logCallOutcome({ prospectId: 'p1', outcome, calledByUserId: 'u_owner' })
      expect(releaseSpy, outcome).toHaveBeenCalledWith('p1')
    }
  })

  it('logCallOutcome — a voicemail, a no-answer, a callback, a booked demo change nothing about who holds it', async () => {
    for (const outcome of ['voicemail', 'no_answer', 'callback', 'gatekeeper', 'demo_booked']) {
      releaseSpy.mockClear()
      state.selectQueue.push([])
      await logCallOutcome({ prospectId: 'p1', outcome })
      expect(releaseSpy, outcome).not.toHaveBeenCalled()
    }
  })

  it('promoteProspectByEmail — a hand went up (demo request / grader run): the practice is the owner’s now', async () => {
    state.selectQueue.push([{ id: 'p1', name: 'Smile Dental', phone: '4045551212', status: 'contacted' }])
    expect(await promoteProspectByEmail('doc@smile.com', 'demo_request')).toBe(true)
    expect(state.updates.find((u) => u.table === 'prospect')?.values).toMatchObject({ status: 'call_list', intentSignal: 'demo_request' })
    expect(releaseSpy).toHaveBeenCalledWith('p1')
  })
})

describe('the hook sits on every classification branch and on the verify pass (by source — those paths need a mailbox or a Places call to drive)', () => {
  const root = resolve(__dirname, '../..')
  const src = (p: string) => readFileSync(resolve(root, p), 'utf8')

  it('prospect-intent: interested / question (a hand-raiser), not interested / unsubscribe, wrong person, the external promote', () => {
    const intent = src('lib/services/prospect-intent.ts')
    const hooks = intent.match(/await releaseCallerSlot\(prospect\.id\)/g) ?? []
    expect(hooks.length).toBeGreaterThanOrEqual(4)
    expect(intent).toContain("const { releaseIfUnservable } = await import('./prospect-caller-release')")
  })

  it('prospect-verify: writePatch frees the slot on a disqualification or a bad number', () => {
    const verify = src('lib/services/prospect-verify.ts')
    const body = verify.slice(verify.indexOf('async function writePatch('), verify.indexOf('export async function verifyProspect('))
    expect(body).toContain("patch.status === 'disqualified'")
    expect(body).toContain('BAD_PHONE_STATUSES')
    expect(body).toContain('await releaseIfUnservable(prospectId)')
  })

  it('the tick runs the straggler sweep before the 7-day sweep', () => {
    const callers = src('lib/services/prospect-callers.ts')
    const tick = callers.slice(callers.indexOf('export async function fillCallerQueues('), callers.indexOf('export async function releaseStaleAssignments('))
    expect(tick.indexOf('releaseUnservableAssignments(now)')).toBeGreaterThan(0)
    expect(tick.indexOf('releaseUnservableAssignments(now)')).toBeLessThan(tick.indexOf('releaseStaleAssignments(now)'))
  })
})
