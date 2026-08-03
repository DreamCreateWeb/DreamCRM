import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * INBOUND SMS (Phase 5 limb 3, slice 3b). The legally load-bearing half of
 * two-way texting: a STOP stops every patient on the number and is
 * confirmed; an ordinary reply threads into /messages through the same
 * rails as every other channel; and nothing here ever throws, because SNS
 * retries any failure and a poison message must not redeliver forever.
 */

const store = vi.hoisted(() => ({
  configs: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  patients: [] as Array<Record<string, unknown>>,
  threads: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => {
  const col = (n: string) => ({ __col: n })
  const tables: Record<string, () => Array<Record<string, unknown>>> = {
    clinic_sms_config: () => store.configs,
    clinic_profile: () => store.profiles,
    patient: () => store.patients,
    patient_thread: () => store.threads,
    patient_message: () => store.messages,
  }
  const match = (preds: unknown[], r: Record<string, unknown>) =>
    preds.flat().filter(Boolean).every((p) => (p as (x: Record<string, unknown>) => boolean)(r))
  return {
    db: {
      select: (cols?: Record<string, unknown>) => {
        let table = ''
        const filters: unknown[] = []
        const api: Record<string, unknown> = {}
        api.from = (t: { __name: string }) => { table = t.__name; return api }
        api.where = (p: unknown) => { filters.push(p); return api }
        const rows = () => {
          const out = tables[table]().filter((r) => match(filters, r))
          return cols
            ? out.map((r) =>
                Object.fromEntries(
                  Object.entries(cols).map(([a, c]) => [a, r[(c as { __col: string }).__col]]),
                ),
              )
            : out
        }
        api.limit = async () => rows()
        api.then = (res: (v: unknown) => void) => res(rows())
        return api
      },
      update: () => {
        const filters: unknown[] = []
        let patch: Record<string, unknown> = {}
        const api: Record<string, unknown> = {}
        api.set = (p: Record<string, unknown>) => { patch = p; return api }
        api.where = (p: unknown) => {
          filters.push(p)
          for (const t of Object.values(tables)) {
            for (const r of t()) if (match(filters, r)) Object.assign(r, patch)
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
        smsPhoneNumber: col('smsPhoneNumber'),
      },
      clinicProfile: {
        __name: 'clinic_profile',
        organizationId: col('organizationId'),
        displayName: col('displayName'),
        phone: col('phone'),
      },
      patient: {
        __name: 'patient',
        id: col('id'),
        organizationId: col('organizationId'),
        phone: col('phone'),
        createdAt: col('createdAt'),
        marketingSmsOptIn: col('marketingSmsOptIn'),
        marketingSmsOptInAt: col('marketingSmsOptInAt'),
        marketingSmsOptOutAt: col('marketingSmsOptOutAt'),
        marketingOptInSource: col('marketingOptInSource'),
      },
      patientThread: {
        __name: 'patient_thread',
        organizationId: col('organizationId'),
        patientId: col('patientId'),
        lastMessageAt: col('lastMessageAt'),
      },
      patientMessage: {
        __name: 'patient_message',
        id: col('id'),
        externalId: col('externalId'),
      },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
  and: (...p: unknown[]) => p.flat().filter(Boolean),
}))

const deliverMock = vi.hoisted(() => vi.fn(async () => ({ ok: true, messageId: 'm1', segments: 1 })))
vi.mock('@/lib/sms', () => ({ deliverSms: deliverMock }))

const inboundMock = vi.hoisted(() =>
  vi.fn(async (input: Record<string, unknown>) => {
    store.messages.push({ id: 'pm_new', externalId: input.externalId })
    return { threadId: 'th_1', messageId: 'pm_new' }
  }),
)
vi.mock('@/lib/services/patient-messaging', () => ({ recordInboundMessage: inboundMock }))

// The consent service runs REAL against the mocked db — its own laws
// (opt-out by number stops the whole family) are part of what this pins.

import { parseInboundSms, handleInboundSms } from '@/lib/services/inbound-sms'

const ORG = 'org_1'
const CLINIC_NUMBER = '+14155550100'
const payload = (over: Partial<Parameters<typeof handleInboundSms>[0]> = {}) => ({
  originationNumber: '+14155550142',
  destinationNumber: CLINIC_NUMBER,
  messageBody: 'running 10 min late',
  inboundMessageId: 'in_1',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store.configs = [{ organizationId: ORG, smsPhoneNumber: CLINIC_NUMBER }]
  store.profiles = [{ organizationId: ORG, displayName: 'Bright Smiles Dental', phone: '(415) 555-0100' }]
  store.patients = [{
    id: 'pat_1', organizationId: ORG, phone: '(415) 555-0142',
    createdAt: new Date('2026-01-01'), marketingSmsOptIn: 1,
    marketingSmsOptInAt: new Date(), marketingSmsOptOutAt: null, marketingOptInSource: 'booking',
  }]
  store.threads = []
  store.messages = []
})

describe('parseInboundSms — external input, parsed defensively', () => {
  it('accepts the real shape and rejects everything else', () => {
    expect(parseInboundSms(payload())).not.toBeNull()
    expect(parseInboundSms(null)).toBeNull()
    expect(parseInboundSms({ eventType: 'TEXT_DELIVERED' })).toBeNull() // a DLR
    expect(parseInboundSms({ originationNumber: '+1', destinationNumber: '+1' })).toBeNull()
  })
})

describe('keywords — the legally load-bearing paths', () => {
  it('STOP stops EVERY patient on the number and sends the confirmation', async () => {
    store.patients.push({
      id: 'pat_2', organizationId: ORG, phone: '415-555-0142',
      createdAt: new Date('2026-02-01'), marketingSmsOptIn: 1,
      marketingSmsOptInAt: new Date(), marketingSmsOptOutAt: null, marketingOptInSource: 'booking',
    })
    const r = await handleInboundSms(payload({ messageBody: 'STOP' }))
    expect(r.outcome).toBe('stop_recorded')
    expect(store.patients[0].marketingSmsOptIn).toBe(0)
    expect(store.patients[1].marketingSmsOptIn).toBe(0)
    expect(store.patients[0].marketingSmsOptOutAt).toBeInstanceOf(Date)
    // The confirmation, from the clinic, transactional.
    const [org, input] = deliverMock.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(org).toBe(ORG)
    expect(String(input.body)).toContain('unsubscribed')
    expect(input.kind).toBe('transactional')
  })

  it('"stop please" means stop; "I need to stop by after work" threads as a message', async () => {
    await handleInboundSms(payload({ messageBody: 'stop please' }))
    expect(store.patients[0].marketingSmsOptIn).toBe(0)

    store.patients[0].marketingSmsOptIn = 1
    const r = await handleInboundSms(payload({ messageBody: 'I need to stop by after work', inboundMessageId: 'in_2' }))
    expect(r.outcome).toBe('threaded')
    expect(store.patients[0].marketingSmsOptIn).toBe(1)
  })

  it('HELP answers with the practice’s name and the way out, and does not thread', async () => {
    const r = await handleInboundSms(payload({ messageBody: 'HELP' }))
    expect(r.outcome).toBe('help_answered')
    const body = String((deliverMock.mock.calls[0] as unknown as [string, Record<string, unknown>])[1].body)
    expect(body).toContain('Bright Smiles Dental')
    expect(body).toContain('STOP')
    expect(inboundMock).not.toHaveBeenCalled()
  })

  it('START is the deliberate re-subscribe — the only path that clears a standing opt-out', async () => {
    store.patients[0].marketingSmsOptIn = 0
    store.patients[0].marketingSmsOptOutAt = new Date('2026-06-01')
    const r = await handleInboundSms(payload({ messageBody: 'START' }))
    expect(r.outcome).toBe('start_recorded')
    expect(store.patients[0].marketingSmsOptIn).toBe(1)
    expect(store.patients[0].marketingSmsOptOutAt).toBeNull()
    expect(store.patients[0].marketingOptInSource).toBe('keyword')
  })

  it('a failed confirmation reply never fails the consent write that already happened', async () => {
    deliverMock.mockRejectedValueOnce(new Error('carrier down'))
    const r = await handleInboundSms(payload({ messageBody: 'STOP' }))
    expect(r.outcome).toBe('stop_recorded')
    expect(store.patients[0].marketingSmsOptIn).toBe(0)
  })
})

describe('ordinary messages → /messages', () => {
  it('threads through the same rails as every other channel, tagged with the provider id', async () => {
    const r = await handleInboundSms(payload())
    expect(r.outcome).toBe('threaded')
    expect(r.patientId).toBe('pat_1')
    expect(inboundMock).toHaveBeenCalledWith({
      organizationId: ORG,
      patientId: 'pat_1',
      body: 'running 10 min late',
      channel: 'sms',
      externalId: 'in_1',
    })
  })

  it('DEDUPES on the provider id — SNS redelivers, a patient’s one text must not become three rows', async () => {
    store.messages = [{ id: 'pm_old', externalId: 'in_1' }]
    const r = await handleInboundSms(payload())
    expect(r.outcome).toBe('duplicate')
    expect(inboundMock).not.toHaveBeenCalled()
  })

  it('a SHARED family number goes to the liveliest existing conversation', async () => {
    store.patients.push({
      id: 'pat_2', organizationId: ORG, phone: '(415) 555-0142',
      createdAt: new Date('2026-03-01'), marketingSmsOptIn: 0,
      marketingSmsOptInAt: null, marketingSmsOptOutAt: null, marketingOptInSource: null,
    })
    store.threads = [
      { organizationId: ORG, patientId: 'pat_1', lastMessageAt: new Date('2026-07-01') },
      { organizationId: ORG, patientId: 'pat_2', lastMessageAt: new Date('2026-08-01') },
    ]
    const r = await handleInboundSms(payload())
    expect(r.patientId).toBe('pat_2')
  })

  it('a number no patient carries is logged and dropped — a bare number can’t pass the family-safe name match, so no chart is minted', async () => {
    const r = await handleInboundSms(payload({ originationNumber: '+14155559999' }))
    expect(r.outcome).toBe('unknown_sender')
    expect(inboundMock).not.toHaveBeenCalled()
  })

  it('a text to a number we don’t hold is acknowledged and dropped', async () => {
    const r = await handleInboundSms(payload({ destinationNumber: '+14155558888' }))
    expect(r.outcome).toBe('unknown_clinic')
  })

  it('NEVER throws — a poison message is acknowledged, not redelivered forever', async () => {
    inboundMock.mockRejectedValueOnce(new Error('db down'))
    const r = await handleInboundSms(payload())
    expect(r.outcome).toBe('ignored')
  })
})
