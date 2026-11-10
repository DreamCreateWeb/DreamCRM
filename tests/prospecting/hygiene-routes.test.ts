import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * AN EMAIL'S BAKED-IN ID FOLLOWS THE MERGE (P-03 fix pass). Every unsub
 * token, tracking pixel, click link and Resend tag carries the id of the
 * row the email was SENT to. After that row folds into its survivor, the
 * recipient's unsubscribe / open / click / bounce must land on the
 * survivor — the row that holds the live drip and the engagement clock —
 * and must never flip the merged row back to a status readers serve.
 */

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown>; where: unknown }>,
}))

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const nameOf = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const selectChain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'orderBy', 'limit']) obj[m] = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(h.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    schema,
    db: {
      select: () => selectChain(),
      insert: (t: unknown) => ({
        values: (v: Record<string, unknown>) => {
          h.inserts.push({ table: nameOf(t), values: v })
          const p = Promise.resolve(undefined) as Promise<undefined> & { onConflictDoNothing: () => Promise<undefined> }
          p.onConflictDoNothing = () => Promise.resolve(undefined)
          return p
        },
      }),
      update: (t: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async (where: unknown) => {
            h.updates.push({ table: nameOf(t), values, where })
          },
        }),
      }),
    },
  }
})
vi.mock('@/lib/utils', () => ({ newId: (p: string) => `${p}_1` }))
// The token is its own payload here; signing is the token module's concern.
vi.mock('@/lib/marketing/tokens', () => ({ decodeToken: (t: string) => JSON.parse(Buffer.from(t, 'base64url').toString('utf8')) }))
vi.mock('svix', () => ({
  Webhook: class {
    verify(raw: string) {
      return JSON.parse(raw)
    }
  },
}))
vi.mock('@/lib/services/inbound-reply', () => ({ handleInboundReply: vi.fn() }))
process.env.RESEND_WEBHOOK_SECRET = 'whsec_test'

import { GET as unsub } from '@/app/api/unsub/[token]/route'
import { GET as click } from '@/app/api/track/click/[token]/route'
import { GET as open } from '@/app/api/track/open/[token]/route'
import { POST as resend } from '@/app/api/webhooks/resend/route'

const dialect = new PgDialect()
const render = (q: unknown) => dialect.sqlToQuery(q as never)
const token = (payload: Record<string, unknown>) => Buffer.from(JSON.stringify(payload)).toString('base64url')
const params = (t: string) => ({ params: Promise.resolve({ token: t }) })
/** pros_l merged into pros_s (one hop), then pros_s is live. */
const mergedThenLive = () => h.selectQueue.push([{ status: 'merged', mergedInto: 'pros_s' }], [{ status: 'contacted', mergedInto: null }])

beforeEach(() => {
  h.selectQueue = []
  h.inserts.length = 0
  h.updates.length = 0
})

describe('unsubscribe', () => {
  it('suppresses, stops and marks the SURVIVOR; the event lands there; the merged row is never flipped', async () => {
    mergedThenLive()
    const res = await unsub(new NextRequest('http://localhost/api/unsub/x'), params(token({ p: 'u', pr: 'pros_l', tl: 'otch_1', e: 'doc@smile.com' })))
    expect(res.status).toBe(200)
    expect(h.inserts.find((i) => i.table === 'prospectSuppression')!.values).toMatchObject({ prospectId: 'pros_s', email: 'doc@smile.com' })
    expect(h.inserts.find((i) => i.table === 'outreachEvent')!.values).toMatchObject({ prospectId: 'pros_s', type: 'unsub' })
    const stop = h.updates.find((u) => u.table === 'outreachEnrollment')!
    expect(stop.values).toMatchObject({ status: 'stopped_unsub' })
    expect(render(stop.where).params).toContain('pros_s')
    const mark = h.updates.find((u) => u.table === 'prospect')!
    expect(mark.values).toMatchObject({ status: 'suppressed', suppressedReason: 'unsub' })
    const { sql, params: p } = render(mark.where)
    expect(p).toEqual(['pros_s', 'merged'])
    expect(sql).toMatch(/"prospect"\."status" <> \$2/)
  })

  it('an unmerged row is itself', async () => {
    h.selectQueue.push([{ status: 'contacted', mergedInto: null }])
    await unsub(new NextRequest('http://localhost/api/unsub/x'), params(token({ p: 'u', pr: 'pros_1', e: 'doc@smile.com' })))
    expect(h.updates.find((u) => u.table === 'prospect')!.where).toBeTruthy()
    expect(render(h.updates.find((u) => u.table === 'prospect')!.where).params[0]).toBe('pros_1')
  })
})

describe('open + click', () => {
  it('record the engagement on the survivor, so the rollup, the drawer and the decay clock see it', async () => {
    mergedThenLive()
    await open(new NextRequest('http://localhost/api/track/open/x'), params(token({ p: 'o', pr: 'pros_l', tl: 'otch_1', e: 'doc@smile.com' })))
    expect(h.inserts[0]).toMatchObject({ table: 'outreachEvent', values: { prospectId: 'pros_s', type: 'open', touchLogId: 'otch_1' } })
    h.inserts.length = 0
    mergedThenLive()
    const res = await click(
      new NextRequest('http://localhost/api/track/click/x'),
      params(token({ p: 'k', pr: 'pros_l', tl: 'otch_1', e: 'doc@smile.com', u: 'https://example.com/demo' })),
    )
    expect(res.status).toBe(302)
    expect(h.inserts[0]).toMatchObject({ table: 'outreachEvent', values: { prospectId: 'pros_s', type: 'click' } })
  })
})

describe('Resend bounce / complaint', () => {
  function envelope(type: string, tags: Record<string, string>, extra: Record<string, unknown> = {}) {
    const body = JSON.stringify({ type, data: { email_id: 'em_1', to: ['Doc@Smile.com'], tags, ...extra } })
    return new NextRequest('http://localhost/api/webhooks/resend', {
      method: 'POST',
      body,
      headers: { 'svix-id': 'id', 'svix-timestamp': '0', 'svix-signature': 'sig' },
    })
  }

  it('a hard bounce to a merged row suppresses the survivor and stops ITS drip; the merged row stays merged', async () => {
    mergedThenLive()
    const res = await resend(envelope('email.bounced', { prospectId: 'pros_l', touchLogId: 'tl_1' }, { bounce: { type: 'hard' } }))
    expect(res.status).toBe(200)
    expect(h.inserts.find((i) => i.table === 'outreachEvent')!.values).toMatchObject({ prospectId: 'pros_s', type: 'bounce' })
    expect(h.inserts.find((i) => i.table === 'prospectSuppression')!.values).toMatchObject({ prospectId: 'pros_s', reason: 'bounce' })
    expect(render(h.updates.find((u) => u.table === 'outreachEnrollment')!.where).params).toContain('pros_s')
    const mark = h.updates.find((u) => u.table === 'prospect')!
    expect(mark.values).toMatchObject({ status: 'suppressed', suppressedReason: 'bounce' })
    expect(render(mark.where).params).toEqual(['pros_s', 'merged'])
  })
})
