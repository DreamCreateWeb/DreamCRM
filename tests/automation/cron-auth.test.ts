import { describe, it, expect, beforeEach, vi } from 'vitest'

// Keep the engines inert — we're only testing the CRON_SECRET gate, which runs
// before any service call. Mocking also keeps module import side-effect-free.
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/services/pms/sync', () => ({ runImport: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))
vi.mock('@/lib/services/reminder-automation', () => ({ runDueReminders: vi.fn(async () => ({})) }))
vi.mock('@/lib/services/marketing-scheduled', () => ({ sendDueScheduledCampaigns: vi.fn(async () => ({})) }))

const ROUTES = [
  '@/app/api/cron/pms-sync/route',
  '@/app/api/cron/send-reminders/route',
  '@/app/api/cron/send-scheduled-campaigns/route',
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
