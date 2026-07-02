import { describe, it, expect, beforeEach, vi } from 'vitest'

// Keep the engines inert — we're only testing the CRON_SECRET gate, which runs
// before any service call. Mocking also keeps module import side-effect-free.
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/services/pms/sync', () => ({ runImport: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))
vi.mock('@/lib/services/reminder-automation', () => ({ runDueReminders: vi.fn(async () => ({})) }))
vi.mock('@/lib/services/marketing-scheduled', () => ({ sendDueScheduledCampaigns: vi.fn(async () => ({})) }))
const customizePendingServices = vi.fn(async () => ({ scanned: 0, customized: 0, orgsTouched: 0, errors: 0 }))
vi.mock('@/lib/services/customize-services-cron', () => ({
  customizePendingServices: () => customizePendingServices(),
}))
const runRetentionAutomations = vi.fn(async () => ({
  scanned: 0, created: 0, alreadyCreated: 0, emptyAudience: 0, details: [], errors: [],
}))
vi.mock('@/lib/services/retention-automation', () => ({
  runRetentionAutomations: () => runRetentionAutomations(),
}))
// The retention cron also ticks the opt-in balance-reminder cadence (best-effort).
const runBalanceReminderCadence = vi.fn(async () => ({ orgsScanned: 0, candidates: 0, sent: 0, skipped: 0 }))
vi.mock('@/lib/services/balance-outreach', () => ({
  runBalanceReminderCadence: () => runBalanceReminderCadence(),
}))
const runFollowupRules = vi.fn(async () => ({ scanned: 0, created: 0, errors: [] }))
vi.mock('@/lib/services/followup-rules', () => ({
  runFollowupRules: () => runFollowupRules(),
}))
const runDailyDigest = vi.fn(async () => ({ scanned: 0, sent: 0, skippedEmpty: 0, skippedAlready: 0, errors: [] }))
vi.mock('@/lib/services/daily-digest', () => ({
  runDailyDigest: () => runDailyDigest(),
}))

const ROUTES = [
  '@/app/api/cron/pms-sync/route',
  '@/app/api/cron/send-reminders/route',
  '@/app/api/cron/send-scheduled-campaigns/route',
  '@/app/api/cron/customize-services/route',
  '@/app/api/cron/retention-automations/route',
  '@/app/api/cron/followup-rules/route',
  '@/app/api/cron/daily-digest/route',
] as const

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  vi.clearAllMocks()
})

describe.each(ROUTES)('cron auth gate — %s', (routePath) => {
  it('returns 401 when the Authorization header is missing', async () => {
    const { POST } = await import(routePath)
    const req = new Request('https://www.dreamcreatestudio.com/api/cron', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the bearer token is wrong', async () => {
    const { GET } = await import(routePath)
    const req = new Request('https://www.dreamcreatestudio.com/api/cron', {
      method: 'GET',
      headers: { authorization: 'Bearer not-the-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when CRON_SECRET is not configured (never wide-open)', async () => {
    delete process.env.CRON_SECRET
    const { POST } = await import(routePath)
    const req = new Request('https://www.dreamcreatestudio.com/api/cron', {
      method: 'POST',
      headers: { authorization: 'Bearer anything' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('customize-services cron — authorized run', () => {
  it('runs the sweep + returns ok:true with batch health on a valid bearer', async () => {
    customizePendingServices.mockResolvedValueOnce({
      scanned: 3,
      customized: 2,
      orgsTouched: 1,
      errors: 1,
    })
    const { POST } = await import('@/app/api/cron/customize-services/route')
    const req = new Request('https://www.dreamcreatestudio.com/api/cron', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, scanned: 3, customized: 2, orgsTouched: 1, errors: 1 })
    expect(customizePendingServices).toHaveBeenCalledTimes(1)
  })
})

describe('retention-automations cron — authorized run', () => {
  it('runs the sweep + returns ok:true with the run summary on a valid bearer', async () => {
    runRetentionAutomations.mockResolvedValueOnce({
      scanned: 2, created: 1, alreadyCreated: 1, emptyAudience: 0, details: [], errors: [],
    })
    const { POST } = await import('@/app/api/cron/retention-automations/route')
    const req = new Request('https://www.dreamcreatestudio.com/api/cron', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true, scanned: 2, created: 1, alreadyCreated: 1, emptyAudience: 0, details: [], errors: [],
      balanceOutreach: { orgsScanned: 0, candidates: 0, sent: 0, skipped: 0 },
    })
    expect(runRetentionAutomations).toHaveBeenCalledTimes(1)
    expect(runBalanceReminderCadence).toHaveBeenCalledTimes(1)
  })
})
