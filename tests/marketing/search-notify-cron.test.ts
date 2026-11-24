import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/cron/search-notify — the hourly route in front of the IndexNow pass
 * (lib/services/indexnow.ts, held by tests/marketing/indexnow-pass.test.ts).
 *
 * Two things live at the route and nowhere else: the bearer gate, and what
 * the schedule is told about the pass. A pass that could not READ answers
 * 500, so the schedule's own failure metric sees it; a pass the engines
 * refused answers 200, because it ran, recorded the refusal where the owner
 * reads it and will try again in an hour.
 */

const svc = vi.hoisted(() => ({
  result: { status: 'nothing_to_send', changed: 0, removed: 0 } as Record<string, unknown>,
  throws: false,
}))
vi.mock('@/lib/services/indexnow', () => ({
  reconcileIndexNow: vi.fn(async () => {
    if (svc.throws) throw new Error('pass exploded')
    return svc.result
  }),
}))

import { GET, POST } from '@/app/api/cron/search-notify/route'
import { reconcileIndexNow } from '@/lib/services/indexnow'

const req = (auth?: string, method = 'GET') =>
  new Request('https://www.dreamcreatestudio.com/api/cron/search-notify', {
    method,
    headers: auth ? { authorization: auth } : {},
  })

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret'
  svc.result = { status: 'nothing_to_send', changed: 0, removed: 0 }
  svc.throws = false
  vi.mocked(reconcileIndexNow).mockClear()
})

describe('the bearer gate', () => {
  it('refuses no authorization, a wrong secret and an unset secret — and never runs the pass', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer undefined'))).status).toBe(401)
    expect(vi.mocked(reconcileIndexNow)).not.toHaveBeenCalled()
  })

  it('runs for the right secret, by GET or by POST (EventBridge posts)', async () => {
    expect((await GET(req('Bearer s3cret'))).status).toBe(200)
    expect((await POST(req('Bearer s3cret', 'POST'))).status).toBe(200)
    expect(vi.mocked(reconcileIndexNow)).toHaveBeenCalledTimes(2)
  })
})

describe('what the schedule is told', () => {
  it.each(['inert', 'nothing_to_send', 'held', 'delivered', 'refused'])(
    'a pass that ended "%s" ran: 200, ok, and the result itself',
    async (status) => {
      svc.result = { status, changed: 3, removed: 1 }
      const res = await GET(req('Bearer s3cret'))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, status, changed: 3, removed: 1 })
    },
  )

  it('a pass that could not read is NOT a success: 500, ok false, and the reason', async () => {
    svc.result = { status: 'aborted', changed: 0, removed: 0, reason: 'posts unreachable' }
    const res = await GET(req('Bearer s3cret'))
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, status: 'aborted', reason: 'posts unreachable' })
  })

  it('a throw is a 500 with the message, not an unhandled rejection', async () => {
    svc.throws = true
    const res = await GET(req('Bearer s3cret'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'pass exploded' })
  })
})
