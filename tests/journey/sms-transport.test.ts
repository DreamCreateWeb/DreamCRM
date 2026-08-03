import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE SMS TRANSPORT (Phase 5 limb 3, slice 3) — deliverSms and the identity
 * rule everything hangs on: there is NO platform fallback. An unapproved
 * clinic doesn't degrade to a shared number (that is the carrier-prohibited
 * shared-originator traffic); it simply cannot send, and the refusal is a
 * typed, normal state.
 */

const aws = vi.hoisted(() => ({
  sent: [] as Array<Record<string, unknown>>,
  failWith: null as string | null,
}))

vi.mock('@aws-sdk/client-pinpoint-sms-voice-v2', () => ({
  PinpointSMSVoiceV2Client: class {
    async send(cmd: { input: Record<string, unknown> }) {
      if (aws.failWith) {
        const err = new Error('provider said no')
        err.name = aws.failWith
        throw err
      }
      aws.sent.push(cmd.input)
      return { MessageId: 'msg_1' }
    }
  },
  SendTextMessageCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}))

const store = vi.hoisted(() => ({
  configs: [] as Array<Record<string, unknown>>,
  failCounter: false,
}))

vi.mock('@/lib/db', () => {
  const col = (n: string) => ({ __col: n })
  const match = (preds: unknown[], r: Record<string, unknown>) =>
    preds.flat().filter(Boolean).every((p) => (p as (x: Record<string, unknown>) => boolean)(r))
  return {
    db: {
      select: (cols?: Record<string, unknown>) => {
        const filters: unknown[] = []
        const api: Record<string, unknown> = {}
        api.from = () => api
        api.where = (p: unknown) => { filters.push(p); return api }
        api.limit = async () => {
          const out = store.configs.filter((r) => match(filters, r))
          return cols
            ? out.map((r) =>
                Object.fromEntries(
                  Object.entries(cols).map(([a, c]) => [a, r[(c as { __col: string }).__col]]),
                ),
              )
            : out
        }
        return api
      },
      update: () => {
        const filters: unknown[] = []
        let patch: Record<string, unknown> = {}
        const api: Record<string, unknown> = {}
        api.set = (p: Record<string, unknown>) => { patch = p; return api }
        api.where = (p: unknown) => {
          filters.push(p)
          if (store.failCounter) return Promise.reject(new Error('db down'))
          for (const r of store.configs) {
            if (match(filters, r)) {
              for (const [k, v] of Object.entries(patch)) {
                // Model drizzle's sql`col + n` increment: our marker object.
                r[k] = v && typeof v === 'object' && '__inc' in (v as object)
                  ? (r[k] as number) + (v as { __inc: number }).__inc
                  : v
              }
            }
          }
          return Promise.resolve(undefined)
        }
        return api
      },
    },
    schema: {
      clinicSmsConfig: {
        __name: 'clinic_sms_config',
        organizationId: col('organizationId'),
        a2pStatus: col('a2pStatus'),
        smsPhoneNumber: col('smsPhoneNumber'),
        monthlySendCount: col('monthlySendCount'),
        monthlySendCountResetAt: col('monthlySendCountResetAt'),
        updatedAt: col('updatedAt'),
      },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
  and: (...p: unknown[]) => p.flat().filter(Boolean),
  // The SQL-side increment renders as our marker so the mock can apply it.
  sql: (_strings: TemplateStringsArray, _col: unknown, n: number) => ({ __inc: n }),
}))

import { deliverSms, getClinicSmsIdentity } from '@/lib/sms'

const ORG = 'org_1'
const config = (over: Record<string, unknown> = {}) => ({
  organizationId: ORG,
  a2pStatus: 'approved',
  smsPhoneNumber: '+14155550100',
  monthlySendCount: 0,
  monthlySendCountResetAt: new Date(),
  ...over,
})

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.SMS_DRIVER = 'aws'
  aws.sent = []
  aws.failWith = null
  store.configs = [config()]
  store.failCounter = false
})

afterEach(() => {
  delete process.env.SMS_DRIVER
})

describe('the identity rule', () => {
  it('unlocks on approved EXACTLY — number_pending has a number, and still cannot send', async () => {
    store.configs = [config({ a2pStatus: 'number_pending' })]
    const id = await getClinicSmsIdentity(ORG)
    expect(id.ok).toBe(false)
    if (!id.ok) expect(id.reason).toBe('not_approved')
  })

  it('no row at all is not_approved, not a crash', async () => {
    store.configs = []
    const id = await getClinicSmsIdentity(ORG)
    expect(id.ok).toBe(false)
  })

  it('driver off refuses before touching the database', async () => {
    delete process.env.SMS_DRIVER
    const id = await getClinicSmsIdentity(ORG)
    expect(id.ok).toBe(false)
    if (!id.ok) expect(id.reason).toBe('driver_off')
  })
})

describe('deliverSms', () => {
  it('sends from the clinic’s OWN number, typed by traffic kind', async () => {
    const r = await deliverSms(ORG, { to: '(415) 555-0142', body: 'See you Tuesday.', kind: 'transactional' })
    expect(r.ok).toBe(true)
    expect(aws.sent[0]).toMatchObject({
      DestinationPhoneNumber: '+14155550142',
      OriginationIdentity: '+14155550100',
      MessageType: 'TRANSACTIONAL',
    })
  })

  it('marketing traffic is labelled PROMOTIONAL — miscategorising it is the small lie carriers punish', async () => {
    await deliverSms(ORG, { to: '4155550142', body: 'We’ve got room Thursday.', kind: 'marketing' })
    expect(aws.sent[0].MessageType).toBe('PROMOTIONAL')
  })

  it('an unparseable number NEVER reaches the carrier', async () => {
    const r = await deliverSms(ORG, { to: '0000000000', body: 'Hi.', kind: 'transactional' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bad_number')
    expect(aws.sent).toHaveLength(0)
  })

  it('an unapproved clinic gets the typed refusal, and the carrier is never called', async () => {
    store.configs = [config({ a2pStatus: 'brand_pending' })]
    const r = await deliverSms(ORG, { to: '4155550142', body: 'Hi.', kind: 'transactional' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not_approved')
    expect(aws.sent).toHaveLength(0)
  })

  it('counts SEGMENTS into the monthly counter, not messages', async () => {
    // 161 GSM-7 chars = 2 segments.
    const r = await deliverSms(ORG, { to: '4155550142', body: 'a'.repeat(161), kind: 'transactional' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.segments).toBe(2)
    expect(store.configs[0].monthlySendCount).toBe(2)
  })

  it('ROLLS the 30-day window instead of counting forever', async () => {
    store.configs = [config({
      monthlySendCount: 500,
      monthlySendCountResetAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    })]
    await deliverSms(ORG, { to: '4155550142', body: 'Hi.', kind: 'transactional' })
    expect(store.configs[0].monthlySendCount).toBe(1) // fresh window, not 501
  })

  it('a counter failure never fails a send that already happened', async () => {
    store.failCounter = true
    const r = await deliverSms(ORG, { to: '4155550142', body: 'Hi.', kind: 'transactional' })
    // The message went out; the bookkeeping hiccup is logged, not surfaced.
    expect(r.ok).toBe(true)
    expect(aws.sent).toHaveLength(1)
  })

  it('provider errors answer in the voice — raw AWS text never reaches staff', async () => {
    aws.failWith = 'ThrottlingException'
    const r = await deliverSms(ORG, { to: '4155550142', body: 'Hi.', kind: 'transactional' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('rate-limiting')
      expect(r.error).not.toContain('ThrottlingException')
    }
  })
})
