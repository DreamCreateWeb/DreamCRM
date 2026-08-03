import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * SMS REGISTRATION (Phase 5 limb 3), service half.
 *
 * Pins the machine's hands against a modelled provider:
 *  - DARK BUILD: with SMS_DRIVER unset nothing networks and nothing writes;
 *  - the ONE form: validation, the demo refusal, the missing-address pointer,
 *    and the deterministic ClientToken that makes a retry resume the SAME
 *    brand instead of minting a second one;
 *  - the poll: advance on COMPLETE at each step, hold on unknown statuses,
 *    stamp the state clock only on real change (the stall clock measures
 *    time-IN-state), stalls surfaced to the PLATFORM heartbeat and never a
 *    clinic ledger, demo orgs excluded, one org's failure never stops the
 *    sweep.
 */

const aws = vi.hoisted(() => ({
  sent: [] as Array<{ type: string; input: Record<string, unknown> }>,
  /** Provider status per registration id. */
  statuses: new Map<string, string>(),
  /** Phone number rows by id. */
  numbers: new Map<string, { Status: string; PhoneNumber: string }>(),
  failOn: null as string | null,
  nextRegistrationId: 'reg_1',
}))

vi.mock('@aws-sdk/client-pinpoint-sms-voice-v2', () => {
  const cmd = (type: string) =>
    class {
      readonly __type = type
      constructor(public input: Record<string, unknown>) {}
    }
  class PinpointSMSVoiceV2Client {
    async send(command: { __type: string; input: Record<string, unknown> }) {
      if (aws.failOn === command.__type) throw new Error(`${command.__type} exploded`)
      aws.sent.push({ type: command.__type, input: command.input })
      switch (command.__type) {
        case 'CreateRegistration':
          return { RegistrationId: aws.nextRegistrationId }
        case 'DescribeRegistrations':
          return {
            Registrations: [
              { RegistrationStatus: aws.statuses.get((command.input.RegistrationIds as string[])[0]) ?? '' },
            ],
          }
        case 'RequestPhoneNumber':
          return { PhoneNumberId: 'pn_1', PhoneNumber: '+14155550142' }
        case 'DescribePhoneNumbers': {
          const id = (command.input.PhoneNumberIds as string[])[0]
          return { PhoneNumbers: [aws.numbers.get(id) ?? { Status: 'PENDING', PhoneNumber: '+14155550142' }] }
        }
        default:
          return {}
      }
    }
  }
  return {
    PinpointSMSVoiceV2Client,
    CreateRegistrationCommand: cmd('CreateRegistration'),
    PutRegistrationFieldValueCommand: cmd('PutRegistrationFieldValue'),
    SubmitRegistrationVersionCommand: cmd('SubmitRegistrationVersion'),
    CreateRegistrationAssociationCommand: cmd('CreateRegistrationAssociation'),
    DescribeRegistrationsCommand: cmd('DescribeRegistrations'),
    RequestPhoneNumberCommand: cmd('RequestPhoneNumber'),
    DescribePhoneNumbersCommand: cmd('DescribePhoneNumbers'),
  }
})

const heartbeats = vi.hoisted(() => ({ writes: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/platform-config', () => ({
  writePlatformConfig: vi.fn(async (patch: Record<string, unknown>) => {
    heartbeats.writes.push(patch)
  }),
}))

const store = vi.hoisted(() => ({
  orgs: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  configs: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => {
  const col = (n: string) => ({ __col: n })
  const tables: Record<string, () => Array<Record<string, unknown>>> = {
    organization: () => store.orgs,
    clinic_profile: () => store.profiles,
    clinic_sms_config: () => store.configs,
  }
  const match = (preds: unknown[], r: Record<string, unknown>) =>
    preds.flat().filter(Boolean).every((p) => (p as (x: Record<string, unknown>) => boolean)(r))
  function select(cols?: Record<string, unknown>) {
    let table = ''
    let joined = ''
    const filters: unknown[] = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.innerJoin = (t: { __name: string }) => { joined = t.__name; return api }
    api.where = (p: unknown) => { filters.push(p); return api }
    const rows = () => {
      let out = tables[table]().filter((r) => match(filters, r))
      if (cols) {
        out = out.map((r) => {
          const shaped: Record<string, unknown> = {}
          for (const [alias, c] of Object.entries(cols)) {
            const marker = c as { __col?: string; __name?: string }
            if (marker.__name) {
              // A whole-table select (the poll's { config: table } shape).
              shaped[alias] = r
            } else if (marker.__col) {
              if (joined && !(marker.__col in r)) {
                const other = tables[joined]().find((o) => o.id === r.organizationId)
                shaped[alias] = other?.[marker.__col]
              } else {
                shaped[alias] = r[marker.__col]
              }
            }
          }
          return shaped
        })
      }
      return out
    }
    api.limit = async () => rows()
    api.then = (res: (v: unknown) => void, rej: (e: unknown) => void) => {
      try { res(rows()) } catch (e) { rej(e) }
    }
    return api
  }
  function insert(t: { __name: string }) {
    return {
      values: (vals: Record<string, unknown>) => ({
        onConflictDoUpdate: async (opts: { set: Record<string, unknown> }) => {
          const rows = tables[t.__name]()
          const existing = rows.find((r) => r.organizationId === vals.organizationId)
          if (existing) Object.assign(existing, opts.set)
          else rows.push({ ...vals })
        },
      }),
    }
  }
  function update(t: { __name: string }) {
    const filters: unknown[] = []
    let patch: Record<string, unknown> = {}
    const api: Record<string, unknown> = {}
    api.set = (p: Record<string, unknown>) => { patch = p; return api }
    api.where = (p: unknown) => {
      filters.push(p)
      const done = Promise.resolve().then(() => {
        for (const r of tables[t.__name]()) if (match(filters, r)) Object.assign(r, patch)
      })
      return Object.assign(done, { catch: done.catch.bind(done) })
    }
    return api
  }
  const t = (name: string, ...cs: string[]) =>
    Object.assign({ __name: name }, Object.fromEntries(cs.map((c) => [c, col(c)])))
  return {
    db: { select, insert, update },
    schema: {
      organization: t('organization', 'id', 'slug', 'isDemo'),
      clinicProfile: t(
        'clinic_profile', 'organizationId', 'legalName', 'displayName', 'addressLine1',
        'city', 'state', 'postalCode', 'phone', 'websiteDomain',
      ),
      clinicSmsConfig: t(
        'clinic_sms_config', 'organizationId', 'smsPhoneNumber', 'providerPhoneNumberId',
        'brandRegistrationId', 'campaignRegistrationId', 'a2pStatus', 'a2pStatusUpdatedAt',
        'ein', 'entityType', 'brandContactName', 'brandContactEmail', 'lastErrorMeta', 'updatedAt',
      ),
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
  and: (...p: unknown[]) => p.flat().filter(Boolean),
}))

import {
  smsDriver,
  startSmsRegistration,
  pollSmsRegistrations,
  getSmsRegistration,
} from '@/lib/services/sms-registration'

const ORG = 'org_1'
const NOW = new Date('2026-08-02T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const goodInput = {
  ein: '12-3456789',
  entityType: 'llc',
  brandContactName: 'Dr. Ada Reyes',
  brandContactEmail: 'ada@brightsmiles.com',
}

const config = (over: Record<string, unknown> = {}) => ({
  organizationId: ORG,
  smsPhoneNumber: null,
  providerPhoneNumberId: null,
  brandRegistrationId: 'reg_brand',
  campaignRegistrationId: null,
  a2pStatus: 'brand_pending',
  a2pStatusUpdatedAt: new Date(NOW.getTime() - DAY),
  ein: '123456789',
  entityType: 'llc',
  brandContactName: 'Dr. Ada Reyes',
  brandContactEmail: 'ada@brightsmiles.com',
  lastErrorMeta: null,
  updatedAt: new Date(NOW.getTime() - DAY),
  ...over,
})

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.SMS_DRIVER = 'aws'
  aws.sent = []
  aws.statuses = new Map()
  aws.numbers = new Map()
  aws.failOn = null
  aws.nextRegistrationId = 'reg_1'
  heartbeats.writes = []
  store.orgs = [{ id: ORG, slug: 'bright-smiles', isDemo: false }]
  store.profiles = [{
    organizationId: ORG,
    legalName: 'Bright Smiles Dental LLC',
    displayName: 'Bright Smiles Dental',
    addressLine1: '12 Main St',
    city: 'Springfield',
    state: 'IL',
    postalCode: '62704',
    phone: '(415) 555-0142',
    websiteDomain: null,
  }]
  store.configs = []
})

afterEach(() => {
  delete process.env.SMS_DRIVER
})

describe('the dark build', () => {
  it('driver off: nothing networks, nothing writes, and the answer is honest', async () => {
    delete process.env.SMS_DRIVER
    expect(smsDriver()).toBe('none')
    const r = await startSmsRegistration(ORG, goodInput)
    expect(r.ok).toBe(false)
    expect(store.configs).toHaveLength(0)
    expect(aws.sent).toHaveLength(0)

    const poll = await pollSmsRegistrations(NOW)
    expect(poll.skipped).toBe('driver_off')
    expect(aws.sent).toHaveLength(0)
  })
})

describe('startSmsRegistration — the one form', () => {
  it('happy path: saves, registers the brand, submits — state brand_pending', async () => {
    const r = await startSmsRegistration(ORG, goodInput)
    expect(r.ok).toBe(true)
    const row = store.configs[0]
    expect(row.a2pStatus).toBe('brand_pending')
    expect(row.brandRegistrationId).toBe('reg_1')
    expect(row.ein).toBe('123456789')

    const create = aws.sent.find((s) => s.type === 'CreateRegistration')
    expect(create?.input.RegistrationType).toBe('US_TEN_DLC_BRAND_REGISTRATION')
    // DETERMINISTIC token: a retry resumes the SAME brand, never a second.
    expect(create?.input.ClientToken).toBe(`dcrm-brand-${ORG}`)

    const fields = aws.sent.filter((s) => s.type === 'PutRegistrationFieldValue')
    const byPath = Object.fromEntries(fields.map((f) => [f.input.FieldPath, f.input.TextValue]))
    expect(byPath['companyInfo.legalCompanyName']).toBe('Bright Smiles Dental LLC')
    expect(byPath['companyInfo.taxIdEin']).toBe('123456789')
    expect(byPath['companyInfo.vertical']).toBe('HEALTHCARE')
    // No custom domain → the clinic's real platform subdomain, a resolving URL.
    expect(byPath['companyInfo.website']).toBe('https://bright-smiles.dreamcreatestudio.com')
    expect(aws.sent.some((s) => s.type === 'SubmitRegistrationVersion')).toBe(true)
  })

  it('surfaces every validation issue without touching the row or the provider', async () => {
    const r = await startSmsRegistration(ORG, { ...goodInput, ein: 'nope', brandContactEmail: 'bad' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues?.length).toBeGreaterThan(1)
    expect(store.configs).toHaveLength(0)
    expect(aws.sent).toHaveLength(0)
  })

  it('REFUSES the demo org — the demo never networks', async () => {
    store.orgs = [{ id: ORG, slug: 'acme-dental-demo', isDemo: true }]
    const r = await startSmsRegistration(ORG, goodInput)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(String(r.error)).toContain('demo')
    expect(aws.sent).toHaveLength(0)
  })

  it('points at the Business profile when the legal identity is missing, instead of submitting a half-blank form', async () => {
    store.profiles[0].addressLine1 = null
    const r = await startSmsRegistration(ORG, goodInput)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(String(r.error)).toContain('Business profile')
    expect(aws.sent).toHaveLength(0)
  })

  it('a provider failure keeps the details SAVED at collecting with honest diagnostics — nobody retypes anything', async () => {
    aws.failOn = 'SubmitRegistrationVersion'
    const r = await startSmsRegistration(ORG, goodInput)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(String(r.error)).toContain('saved')
    const row = store.configs[0]
    expect(row.a2pStatus).toBe('collecting')
    expect(row.ein).toBe('123456789')
    expect((row.lastErrorMeta as { message: string }).message).toContain('exploded')
  })
})

describe('pollSmsRegistrations — the machine advances itself', () => {
  it('brand COMPLETE → registers OUR campaign and moves to campaign_pending', async () => {
    store.configs = [config()]
    aws.statuses.set('reg_brand', 'COMPLETE')
    aws.nextRegistrationId = 'reg_campaign'
    const r = await pollSmsRegistrations(NOW)
    expect(r.advanced).toBe(1)
    expect(store.configs[0].a2pStatus).toBe('campaign_pending')
    expect(store.configs[0].campaignRegistrationId).toBe('reg_campaign')
    const create = aws.sent.find((s) => s.type === 'CreateRegistration')
    expect(create?.input.RegistrationType).toBe('US_TEN_DLC_CAMPAIGN_REGISTRATION')
    expect(create?.input.ClientToken).toBe(`dcrm-campaign-${ORG}`)
  })

  it('REQUIRES_AUTHENTICATION → brand_action_needed, the clinic’s move', async () => {
    store.configs = [config()]
    aws.statuses.set('reg_brand', 'REQUIRES_AUTHENTICATION')
    await pollSmsRegistrations(NOW)
    expect(store.configs[0].a2pStatus).toBe('brand_action_needed')
    expect(store.configs[0].a2pStatusUpdatedAt).toEqual(NOW)
  })

  it('an unchanged review HOLDS the state clock — the stall clock measures time-IN-state', async () => {
    const before = new Date(NOW.getTime() - DAY)
    store.configs = [config({ a2pStatusUpdatedAt: before })]
    aws.statuses.set('reg_brand', 'REVIEWING')
    const r = await pollSmsRegistrations(NOW)
    expect(r.advanced).toBe(0)
    expect(store.configs[0].a2pStatus).toBe('brand_pending')
    expect(store.configs[0].a2pStatusUpdatedAt).toEqual(before)
  })

  it('an UNKNOWN provider status never invents progress', async () => {
    store.configs = [config()]
    aws.statuses.set('reg_brand', 'SOME_FUTURE_STATUS')
    await pollSmsRegistrations(NOW)
    expect(store.configs[0].a2pStatus).toBe('brand_pending')
  })

  it('campaign COMPLETE → buys the clinic its own 10DLC number, associated at purchase', async () => {
    store.configs = [config({ a2pStatus: 'campaign_pending', campaignRegistrationId: 'reg_campaign' })]
    aws.statuses.set('reg_campaign', 'COMPLETE')
    const r = await pollSmsRegistrations(NOW)
    expect(r.advanced).toBe(1)
    const row = store.configs[0]
    expect(row.a2pStatus).toBe('number_pending')
    expect(row.providerPhoneNumberId).toBe('pn_1')
    expect(row.smsPhoneNumber).toBe('+14155550142')
    const req = aws.sent.find((s) => s.type === 'RequestPhoneNumber')
    expect(req?.input.NumberType).toBe('TEN_DLC')
    expect(req?.input.RegistrationId).toBe('reg_campaign')
    // A clinic's number is its identity with patients — never casually deletable.
    expect(req?.input.DeletionProtectionEnabled).toBe(true)
  })

  it('number ACTIVE → approved, the one state the send path will ever unlock on', async () => {
    store.configs = [config({ a2pStatus: 'number_pending', providerPhoneNumberId: 'pn_1' })]
    aws.numbers.set('pn_1', { Status: 'ACTIVE', PhoneNumber: '+14155550142' })
    const r = await pollSmsRegistrations(NOW)
    expect(r.advanced).toBe(1)
    expect(store.configs[0].a2pStatus).toBe('approved')
    expect(store.configs[0].smsPhoneNumber).toBe('+14155550142')
  })

  it('a number still PENDING holds', async () => {
    store.configs = [config({ a2pStatus: 'number_pending', providerPhoneNumberId: 'pn_1' })]
    aws.numbers.set('pn_1', { Status: 'PENDING', PhoneNumber: '+14155550142' })
    const r = await pollSmsRegistrations(NOW)
    expect(r.advanced).toBe(0)
    expect(store.configs[0].a2pStatus).toBe('number_pending')
  })

  it('EXCLUDES the demo org from the sweep', async () => {
    store.orgs = [{ id: ORG, slug: 'acme-dental-demo', isDemo: true }]
    store.configs = [config()]
    const r = await pollSmsRegistrations(NOW)
    expect(r.polled).toBe(0)
    expect(aws.sent).toHaveLength(0)
  })

  it('a STALL goes to the platform heartbeat, never a clinic ledger', async () => {
    // brand_pending for 10 days — past the 7-day threshold.
    store.configs = [config({ a2pStatusUpdatedAt: new Date(NOW.getTime() - 10 * DAY) })]
    aws.statuses.set('reg_brand', 'REVIEWING')
    const r = await pollSmsRegistrations(NOW)
    expect(r.stalled).toEqual([{ organizationId: ORG, state: 'brand_pending' }])
    // The heartbeat: own key, passed whole, stalls inside it.
    expect(heartbeats.writes).toHaveLength(1)
    const hb = heartbeats.writes[0].smsRegistration as Record<string, unknown>
    expect(hb.ranAt).toBe(NOW.toISOString())
    expect(hb.stalled).toEqual([{ organizationId: ORG, state: 'brand_pending' }])
  })

  it('one org’s provider failure never stops the sweep, and lands in its own diagnostics', async () => {
    const org2 = config()
    org2.organizationId = 'org_2'
    org2.brandRegistrationId = 'reg_brand_2'
    store.orgs.push({ id: 'org_2', slug: 'second', isDemo: false })
    store.configs = [config(), org2]
    aws.statuses.set('reg_brand_2', 'COMPLETE')
    aws.failOn = 'DescribeRegistrations'
    // Both fail on describe this run — but the loop must visit both.
    const r = await pollSmsRegistrations(NOW)
    expect(r.polled).toBe(2)
    expect(r.errors).toHaveLength(2)
    expect((store.configs[0].lastErrorMeta as { message: string }).message).toContain('exploded')
  })
})

describe('getSmsRegistration — what the page reads', () => {
  it('missing row reads as state none with the quiet sentence', async () => {
    const v = await getSmsRegistration(ORG)
    expect(v.state).toBe('none')
    expect(v.phoneNumber).toBeNull()
  })

  it('the provider’s words reach the clinic ONLY on their own states', async () => {
    store.configs = [config({ a2pStatus: 'brand_action_needed', lastErrorMeta: { message: 'Verify the email we sent' } })]
    const theirs = await getSmsRegistration(ORG)
    expect(theirs.notice).toBe('Verify the email we sent')

    store.configs = [config({ a2pStatus: 'suspended', lastErrorMeta: { message: 'AWS: InternalServiceError xyz' } })]
    const ours = await getSmsRegistration(ORG)
    // A suspended clinic gets "we're on it", never a vendor error code.
    expect(ours.notice).toBeNull()
    expect(ours.audience).toBe('platform')
  })
})
