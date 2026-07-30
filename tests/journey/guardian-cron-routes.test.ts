import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE TWO CRON ROUTES this phase added (Phase 4). Both shipped with no test
 * at all — including the CRON_SECRET bearer gate, which is the only thing
 * standing between a public URL and a job that emails the platform owner
 * about every clinic (guardian) or rewrites the send hour every clinic's
 * automations aim at (learn-defaults).
 *
 * Also pinned: `ok` must reflect what actually happened. A blind Guardian
 * sweep and a failed learning pass are not successes, and the cron log is
 * the only place either is visible.
 */

const svc = vi.hoisted(() => ({
  sweep: { scanned: 0, flagged: 0, blind: false, errors: [] } as Record<string, unknown>,
  sweepThrows: false,
  learn: { ok: true, finding: { hour: 10 } } as Record<string, unknown>,
}))
vi.mock('@/lib/services/guardian-alerts', () => ({
  runGuardianSweep: vi.fn(async () => {
    if (svc.sweepThrows) throw new Error('sweep exploded')
    return svc.sweep
  }),
}))
vi.mock('@/lib/services/shared-brain', () => ({
  runSharedBrainLearning: vi.fn(async () => svc.learn),
}))

import { GET as guardianGet, POST as guardianPost } from '@/app/api/cron/guardian/route'
import { GET as learnGet } from '@/app/api/cron/learn-defaults/route'

const req = (auth?: string) =>
  new Request('https://www.dreamcreatestudio.com/api/cron/guardian', {
    headers: auth ? { authorization: auth } : {},
  })

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret'
  svc.sweep = { scanned: 2, flagged: 1, blind: false, errors: [] }
  svc.sweepThrows = false
})

describe('/api/cron/guardian — the bearer gate', () => {
  it('refuses a request with no authorization', async () => {
    expect((await guardianGet(req())).status).toBe(401)
  })

  it('refuses a wrong secret, and never runs the sweep', async () => {
    const { runGuardianSweep } = await import('@/lib/services/guardian-alerts')
    vi.mocked(runGuardianSweep).mockClear()
    expect((await guardianGet(req('Bearer nope'))).status).toBe(401)
    expect(vi.mocked(runGuardianSweep)).not.toHaveBeenCalled()
  })

  it('refuses everything when CRON_SECRET is UNSET — an absent secret is not an open door', async () => {
    delete process.env.CRON_SECRET
    expect((await guardianGet(req())).status).toBe(401)
    expect((await guardianGet(req('Bearer undefined'))).status).toBe(401)
  })

  it('runs on the right secret, by GET or POST', async () => {
    expect((await guardianGet(req('Bearer s3cret'))).status).toBe(200)
    expect((await guardianPost(req('Bearer s3cret'))).status).toBe(200)
  })
})

describe('/api/cron/guardian — ok reflects what happened', () => {
  it('a BLIND sweep is not a success', async () => {
    svc.sweep = { scanned: 0, flagged: 0, blind: true, errors: [] }
    const body = await (await guardianGet(req('Bearer s3cret'))).json()
    expect(body.ok).toBe(false)
    expect(body.blind).toBe(true)
  })

  it('a normal sweep is', async () => {
    const body = await (await guardianGet(req('Bearer s3cret'))).json()
    expect(body.ok).toBe(true)
    expect(body.scanned).toBe(2)
  })

  it('a thrown sweep is a 500 carrying the reason, not a quiet 200', async () => {
    svc.sweepThrows = true
    const res = await guardianGet(req('Bearer s3cret'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('sweep exploded')
  })
})


describe('/api/cron/learn-defaults', () => {
  const lreq = (auth?: string) =>
    new Request('https://www.dreamcreatestudio.com/api/cron/learn-defaults', {
      headers: auth ? { authorization: auth } : {},
    })

  it('is bearer-gated too — it rewrites the hour every clinic’s automations aim at', async () => {
    process.env.CRON_SECRET = 's3cret'
    expect((await learnGet(lreq())).status).toBe(401)
    expect((await learnGet(lreq('Bearer nope'))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await learnGet(lreq('Bearer undefined'))).status).toBe(401)
  })

  it('a pass that RAN AND COULDN’T is not a 200 (round-16 audit)', async () => {
    // It returned 200 regardless of `ok`, so the only external signal that
    // the weekly pass is broken looked identical to a healthy one.
    process.env.CRON_SECRET = 's3cret'
    svc.learn = { ok: false, error: 'aggregate timed out', finding: { hour: 10 } }
    const res = await learnGet(lreq('Bearer s3cret'))
    expect(res.status).toBe(500)

    svc.learn = { ok: true, finding: { hour: 10 } }
    expect((await learnGet(lreq('Bearer s3cret'))).status).toBe(200)
  })
})
