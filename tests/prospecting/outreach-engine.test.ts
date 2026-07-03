import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The cold-outreach drip engine — the compliance-critical suite:
 *  - warm-up cap math (pure)
 *  - prospect-tz business-hours + weekend gating (pure + engine)
 *  - dry-run NEVER touches a send transport, logs channel='dry_run'
 *  - send-time suppression / known-contact guards fail closed
 *  - the touch-log unique claim prevents double-sends
 *  - live Resend sends carry RFC-8058 headers + prospect tags + postal footer
 *  - extended tokens roundtrip (pr/tl payloads)
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  claimRejects: false,
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          const name = (table as { _n: string })._n
          state.inserts.push({ table: name, values })
          const p: any = Promise.resolve(undefined)
          p.onConflictDoNothing = () => {
            const q: any = Promise.resolve(undefined)
            q.returning = async () =>
              name === 'outreach_touch_log' && state.claimRejects ? [] : [{ id: values.id }]
            return q
          }
          return p
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: (table as { _n: string })._n, values })
          },
        }),
      }),
    },
    schema: {
      prospect: { _n: 'prospect', id: 'id', status: 'status' },
      outreachSequence: { _n: 'outreach_sequence', id: 'id', status: 'status', createdAt: 'c' },
      outreachTouchTemplate: {
        _n: 'outreach_touch_template', id: 'id', sequenceId: 'sid',
        stepNumber: 'step', dayOffset: 'off',
      },
      outreachEnrollment: {
        _n: 'outreach_enrollment', id: 'id', prospectId: 'pid', sequenceId: 'sid',
        status: 'status', currentStep: 'cur', nextSendAt: 'next',
      },
      outreachTouchLog: { _n: 'outreach_touch_log', id: 'id', enrollmentId: 'eid', stepNumber: 'step' },
      emailAccount: { _n: 'email_account', id: 'id', emailAddress: 'addr' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}))

const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn(async () => ({ data: { id: 're_1' }, error: null })),
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock }
  },
}))

const { configMock, updateConfigMock, counterMock, bumpMock, knownMock, aiMock } = vi.hoisted(() => ({
  configMock: vi.fn(),
  updateConfigMock: vi.fn(async () => ({})),
  counterMock: vi.fn(async () => 0),
  bumpMock: vi.fn(async () => {}),
  knownMock: vi.fn(async () => false),
  aiMock: vi.fn(),
}))
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: configMock,
  updateProspectingConfig: updateConfigMock,
  getProspectingCounter: counterMock,
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-07',
  counterDay: () => '2026-07-07',
  isKnownContact: knownMock,
}))
vi.mock('@/lib/ai', () => ({
  runClaudeJson: aiMock,
  aiConfigured: () => false, // template-merge path by default (AI covered elsewhere)
}))
vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: vi.fn(async () => 'tok'),
  sendMessage: vi.fn(async () => ({ id: 'g1', threadId: 't1' })),
}))

import {
  runOutreach,
  warmupDailyCap,
  withinSendWindow,
  mergeTemplate,
  renderOutreachEmail,
} from '@/lib/services/prospect-outreach'
import { encodeToken, decodeToken } from '@/lib/marketing/tokens'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

// Tuesday 15:00 UTC = 10:00 America/Chicago — inside the 8–17 window.
const TUESDAY_10AM_CHICAGO = new Date('2026-07-07T15:00:00Z')
// Saturday, same clock time.
const SATURDAY = new Date('2026-07-04T15:00:00Z')

const LIVE_CONFIG = {
  ...PROSPECTING_DEFAULTS,
  killSwitch: false,
  dryRun: false,
  enabledStates: ['TX'],
  warmup: { ...PROSPECTING_DEFAULTS.warmup, startedAt: '2026-07-01T00:00:00Z' },
}
const DRY_CONFIG = { ...LIVE_CONFIG, dryRun: true }

const ENROLLMENT = {
  id: 'oenr_1', prospectId: 'pros_1', sequenceId: 'oseq_default',
  status: 'active', currentStep: 0, nextSendAt: new Date('2026-07-07T00:00:00Z'),
  enrolledAt: new Date('2026-07-07T00:00:00Z'), stoppedAt: null, stopReason: null,
}
const PROSPECT = {
  id: 'pros_1', name: 'Lone Star Dental', email: 'doc@lonestardental.com',
  phone: '2145551212', websiteUrl: 'https://lonestardental.com',
  authorizedOfficialName: 'MARIA GARZA', city: 'Dallas', state: 'TX',
  timezone: 'America/Chicago', status: 'queued', aiVerdict: null, reviewCount: 12,
}
const TEMPLATE_1 = {
  id: 'otpl_default_1', sequenceId: 'oseq_default', stepNumber: 1, dayOffset: 0,
  subjectTemplate: 'Quick question about {{clinicName}}',
  bodyTemplate: 'Hi {{firstName}},\n\nSaw {{clinicName}} in {{city}}.\n\nLook: https://www.dreamcreatestudio.com',
  aiPersonalize: 1,
}
const TEMPLATE_2 = { ...TEMPLATE_1, id: 'otpl_default_2', stepNumber: 2, dayOffset: 3 }

/** Queue the selects one engine iteration consumes (happy path). */
function queueHappyPath() {
  state.selectQueue.push([]) // paused sequences
  state.selectQueue.push([ENROLLMENT]) // due enrollments
  state.selectQueue.push([PROSPECT]) // prospect
  state.selectQueue.push([TEMPLATE_1]) // this step's template
  state.selectQueue.push([TEMPLATE_2]) // next template (advance)
}

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  state.claimRejects = false
  vi.clearAllMocks()
  configMock.mockResolvedValue(LIVE_CONFIG)
  counterMock.mockResolvedValue(0)
  knownMock.mockResolvedValue(false)
  vi.stubEnv('OUTREACH_EMAIL_FROM', 'Dustin <dustin@getdreamcrm.com>')
  vi.stubEnv('MARKETING_POSTAL_ADDRESS', '123 Peachtree St, Atlanta, GA 30303')
  vi.stubEnv('RESEND_API_KEY', 're_key')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('warmupDailyCap (pure)', () => {
  const cfg = (warmup: Partial<(typeof PROSPECTING_DEFAULTS)['warmup']>) => ({
    ...LIVE_CONFIG,
    warmup: { ...LIVE_CONFIG.warmup, ...warmup },
  })
  it('before live sending starts: the start rate', () => {
    expect(warmupDailyCap(cfg({ startedAt: null }), TUESDAY_10AM_CHICAGO)).toBe(20)
  })
  it('ramps weekly and clamps at the ceiling', () => {
    const start = '2026-07-01T00:00:00Z'
    expect(warmupDailyCap(cfg({ startedAt: start }), new Date('2026-07-06T00:00:00Z'))).toBe(20) // week 0
    expect(warmupDailyCap(cfg({ startedAt: start }), new Date('2026-07-09T00:00:00Z'))).toBe(30) // week 1
    expect(warmupDailyCap(cfg({ startedAt: start }), new Date('2027-07-01T00:00:00Z'))).toBe(150) // ceiling
  })
})

describe('withinSendWindow (pure)', () => {
  const WIN = { startHour: 8, endHour: 17 }
  it('weekday inside the window → true', () => {
    expect(withinSendWindow(TUESDAY_10AM_CHICAGO, 'America/Chicago', WIN)).toBe(true)
  })
  it('weekends and off-hours → false; bad tz fails closed', () => {
    expect(withinSendWindow(SATURDAY, 'America/Chicago', WIN)).toBe(false)
    expect(withinSendWindow(new Date('2026-07-07T03:00:00Z'), 'America/Chicago', WIN)).toBe(false) // 10pm Mon
    expect(withinSendWindow(TUESDAY_10AM_CHICAGO, 'Not/AZone', WIN)).toBe(false)
  })
})

describe('mergeTemplate + renderOutreachEmail (pure)', () => {
  it('merges tokens and strips unknowns', () => {
    expect(mergeTemplate('Hi {{firstName}} of {{clinicName}}{{junk}}', { firstName: 'Maria', clinicName: 'Lone Star' }))
      .toBe('Hi Maria of Lone Star')
  })
  it('renders the compliance shell: postal footer, unsub link + tracked links + pixel', () => {
    const r = renderOutreachEmail({
      paragraphs: ['Hi Maria,', 'Look: https://www.dreamcreatestudio.com'],
      prospectId: 'pros_1',
      touchLogId: 'otch_1',
      email: 'Doc@LoneStarDental.com',
      senderName: 'Dustin',
      postalAddress: '123 Peachtree St, Atlanta, GA 30303',
    })
    expect(r.html).toContain('123 Peachtree St')
    expect(r.html).toContain('/api/unsub/')
    expect(r.html).toContain('/api/track/open/')
    expect(r.html).toContain('/api/track/click/')
    expect(r.html).not.toContain('href="https://www.dreamcreatestudio.com"') // raw link replaced
    expect(r.text).toContain('Unsubscribe:')
    // The unsub token decodes to the prospect payload with a lowercased email.
    const token = r.unsubUrl.split('/api/unsub/')[1]
    expect(decodeToken(token)).toMatchObject({
      p: 'u', pr: 'pros_1', tl: 'otch_1', e: 'doc@lonestardental.com',
    })
  })
})

describe('extended token payloads', () => {
  it('pr/tl roundtrip without a campaign id', () => {
    const t = encodeToken({ e: 'a@b.com', pr: 'pros_9', tl: 'otch_9', p: 'o' })
    expect(decodeToken(t)).toEqual({ e: 'a@b.com', pr: 'pros_9', tl: 'otch_9', p: 'o' })
    expect(decodeToken(t + 'x')).toBeNull() // tamper = dead token
  })
})

describe('runOutreach', () => {
  it('no-ops on the kill switch', async () => {
    configMock.mockResolvedValue({ ...LIVE_CONFIG, killSwitch: true })
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r.skipped).toBe('kill_switch')
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  it('dry-run: personalizes + logs channel=dry_run, never touches Resend, never burns the daily counter', async () => {
    configMock.mockResolvedValue(DRY_CONFIG)
    queueHappyPath()
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r).toMatchObject({ sent: 1, dryRun: true, errors: 0 })
    expect(resendSendMock).not.toHaveBeenCalled()
    const touch = state.inserts.find((i) => i.table === 'outreach_touch_log')
    expect(touch!.values).toMatchObject({ channel: 'dry_run', stepNumber: 1 })
    expect(touch!.values.subject).toBe('Quick question about Lone Star Dental')
    expect(bumpMock).not.toHaveBeenCalledWith('2026-07-07', 'outreach_send')
  })

  it('missing sender env forces dry-run even with config.dryRun=false', async () => {
    vi.stubEnv('OUTREACH_EMAIL_FROM', '')
    configMock.mockResolvedValue(LIVE_CONFIG)
    queueHappyPath()
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r.dryRun).toBe(true)
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  it('live send: RFC-8058 headers + prospect tags + advance to the next touch', async () => {
    queueHappyPath()
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r).toMatchObject({ sent: 1, dryRun: false })
    expect(resendSendMock).toHaveBeenCalledTimes(1)
    const args = (resendSendMock.mock.calls[0] as unknown[])[0] as Record<string, any>
    expect(args.from).toContain('getdreamcrm.com')
    expect(args.to).toBe('doc@lonestardental.com')
    expect(args.headers['List-Unsubscribe']).toContain('/api/unsub/')
    expect(args.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(args.tags).toEqual([
      { name: 'prospectId', value: 'pros_1' },
      expect.objectContaining({ name: 'touchLogId' }),
    ])
    expect(args.html).toContain('123 Peachtree St')
    // Advance: currentStep 1, next send ~3 days out; prospect → contacted.
    const advance = state.updates.find((u) => u.table === 'outreach_enrollment')
    expect(advance!.values).toMatchObject({ currentStep: 1 })
    const flip = state.updates.find((u) => u.table === 'prospect')
    expect(flip!.values).toMatchObject({ status: 'contacted' })
    expect(bumpMock).toHaveBeenCalledWith('2026-07-07', 'outreach_send')
  })

  it('daily warm-up cap zero → nothing scans', async () => {
    counterMock.mockResolvedValue(20) // today's sends already at the cap
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r.skipped).toBe('daily_cap')
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  it('outside the prospect-local window (weekend) → skip, touch stays due', async () => {
    state.selectQueue.push([]) // paused
    state.selectQueue.push([ENROLLMENT])
    state.selectQueue.push([PROSPECT])
    const r = await runOutreach({ now: SATURDAY })
    expect(r).toMatchObject({ windowSkipped: 1, sent: 0 })
    expect(state.inserts.find((i) => i.table === 'outreach_touch_log')).toBeUndefined()
  })

  it('send-time known-contact/suppression guard fails closed and stops the enrollment', async () => {
    knownMock.mockResolvedValue(true)
    state.selectQueue.push([]) // paused
    state.selectQueue.push([ENROLLMENT])
    state.selectQueue.push([PROSPECT])
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r).toMatchObject({ guardSkipped: 1, sent: 0 })
    expect(resendSendMock).not.toHaveBeenCalled()
    const stop = state.updates.find((u) => u.table === 'outreach_enrollment')
    expect(stop!.values).toMatchObject({ status: 'stopped_manual' })
  })

  it('a lost touch-log claim (concurrent run) sends nothing', async () => {
    state.claimRejects = true
    queueHappyPath()
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r.sent).toBe(0)
    expect(resendSendMock).not.toHaveBeenCalled()
  })

  it('paused sequences hold their enrollments', async () => {
    state.selectQueue.push([{ id: 'oseq_default' }]) // paused sequence list
    state.selectQueue.push([ENROLLMENT]) // due, but filtered out
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r).toMatchObject({ scanned: 0, sent: 0 })
  })

  it('a Resend failure marks the touch failed (no advance, no counter)', async () => {
    resendSendMock.mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } } as never)
    queueHappyPath()
    const r = await runOutreach({ now: TUESDAY_10AM_CHICAGO })
    expect(r.errors).toBe(1)
    const failed = state.updates.find(
      (u) => u.table === 'outreach_touch_log' && u.values.status === 'failed',
    )
    expect(String(failed!.values.error)).toContain('rate limited')
    expect(bumpMock).not.toHaveBeenCalledWith('2026-07-07', 'outreach_send')
  })
})
