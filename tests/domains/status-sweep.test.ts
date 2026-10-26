import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The custom-domains cron (2026-10-26) — the plumbing around the sweep:
 *
 *  - the route is CRON_SECRET-gated like its 22 siblings and reports the
 *    sweep's counts, 500 on a throw (the cron log is the only place a dead
 *    sweep is visible);
 *  - the EventBridge rule exists at 15 minutes (the deploy re-runs the JOBS
 *    script, so a route without an entry ships un-fired — the drift that
 *    once left five jobs silently dead);
 *  - the card's copy tells the truth now: "you can leave this page" and
 *    "we keep checking" are promises the sweep keeps;
 *  - the failure vocabulary and the capability are registered, so a break
 *    reaches the Guardian under a label rather than a raw key.
 *
 * The sweep's own behaviour (filters, order, cap, isolation, the stamps, the
 * day-old alert) is in tests/custom-domain/sweep.test.ts.
 */

const svc = vi.hoisted(() => ({
  result: {
    pending: 3,
    checked: 3,
    activated: 1,
    notified: 0,
    shutDown: 1,
    errors: [] as string[],
    completed: true,
  },
  throws: false,
  sweep: vi.fn(async () => {
    if (svc.throws) throw new Error('database unreachable')
    return svc.result
  }),
}))
vi.mock('@/lib/services/custom-domain', () => ({
  sweepPendingCustomDomains: svc.sweep,
}))
vi.mock('@/lib/db', () => ({ db: {} }))

import { GET, POST, maxDuration } from '@/app/api/cron/custom-domains/route'
import { AUTOMATION_FAILURE } from '@/lib/services/engine-failures'
import { getCapability, isGrantable } from '@/lib/autonomy'
import { isUrgentType } from '@/lib/types/notifications'

const req = (auth?: string) =>
  new Request('https://www.dreamcreatestudio.com/api/cron/custom-domains', {
    headers: auth ? { authorization: auth } : {},
  })

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret'
  svc.throws = false
  svc.sweep.mockClear()
})

describe('/api/cron/custom-domains — the bearer gate', () => {
  it('refuses a request with no authorization, and never runs the sweep', async () => {
    expect((await GET(req())).status).toBe(401)
    expect(svc.sweep).not.toHaveBeenCalled()
  })

  it('refuses a wrong secret', async () => {
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    expect(svc.sweep).not.toHaveBeenCalled()
  })

  it('runs the sweep for the right secret and reports its counts (GET and POST)', async () => {
    const res = await GET(req('Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ...svc.result })
    expect((await POST(req('Bearer s3cret'))).status).toBe(200)
    expect(svc.sweep).toHaveBeenCalledTimes(2)
  })

  it('500s when the sweep itself throws — a dead sweep must be visible in the cron log', async () => {
    svc.throws = true
    const res = await GET(req('Bearer s3cret'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'database unreachable' })
  })

  it('leaves the sweep its 240s budget plus one slow row', () => {
    // CUSTOM_DOMAIN_SWEEP_BUDGET_MS is 240_000; the budget bounds when a row
    // STARTS, so the route must hold the budget AND the slowest row.
    expect(maxDuration).toBe(300)
  })
})

describe('the EventBridge schedule', () => {
  it('is a JOBS entry at 15 minutes — the deploy self-heals the rule from it', () => {
    const script = readFileSync(join(process.cwd(), 'scripts/setup-cron-schedules.sh'), 'utf8')
    expect(script).toContain('"custom-domains|custom-domains|rate(15 minutes)"')
  })
})

describe('the card’s copy tells the truth now', () => {
  const card = readFileSync(
    join(process.cwd(), 'app/(default)/website/domain/custom-domain-card.tsx'),
    'utf8',
  )

  it('keeps the promise the sweep now makes true', () => {
    expect(card).toContain('you can leave this page')
    expect(card).toContain('it’ll go live on its own')
    // The honest cadence: the page's own poll while open, the sweep when not.
    expect(card).toMatch(/every 15 minutes/)
  })

  it('shows "Checked <time> · we keep checking" at the practice’s wall-clock', () => {
    expect(card).toContain('we keep checking')
    expect(card).toContain('formatClinicDayTime(new Date(status.lastCheckedAt), timeZone)')
    // The old browser-zone render is gone — the server runs in UTC and a
    // bare toLocaleString would not be the clinic's clock anyway.
    expect(card).not.toContain('toLocaleString()')
    expect(card).not.toContain('Last checked')
  })

  it('does NOT wrap its awaits here — ML-24 owns that sweep (no runAction yet)', () => {
    // A guard against this slice drifting into the other one's file; the
    // runAction wrap lands with ML-24 and this assertion is deleted then.
    expect(card).not.toContain('runAction')
  })
})

describe('the registry entries', () => {
  it('a break files under a REGISTERED, auto, non-grantable capability', () => {
    expect(AUTOMATION_FAILURE.custom_domain).toEqual({
      capability: 'custom_domain',
      summary: expect.stringMatching(/^Couldn’t check on your web address/),
    })
    const cap = getCapability('custom_domain')
    expect(cap?.defaultTrust).toBe('auto')
    expect(isGrantable('custom_domain')).toBe(false)
  })

  it('the day-old alert rides the EXISTING urgent key', () => {
    // No second key for "a domain needs a hand" — the buy-a-domain path and
    // the sweep raise the same one, so the registry's urgency applies to both.
    expect(isUrgentType('domain_attach_manual')).toBe(true)
  })
})

describe('the runbook knows about the sweep', () => {
  it('docs/custom-domains.md names the cron and its cadence', () => {
    const doc = readFileSync(join(process.cwd(), 'docs/custom-domains.md'), 'utf8')
    expect(doc).toContain('/api/cron/custom-domains')
    expect(doc).toContain('every 15 minutes')
    expect(doc).toContain('sweepPendingCustomDomains')
  })
})
