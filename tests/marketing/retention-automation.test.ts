import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Orchestration tests for the retention auto-send engine
 * (`lib/services/retention-automation.ts`).
 *
 * Covered:
 *  - Demo clinics are skipped (never send real email).
 *  - Clinics with every automation toggle off are skipped.
 *  - Idempotency: an existing campaign for the window → no new insert.
 *  - Empty audience → no campaign created (no empty blast queued).
 *  - Eligible org → a SCHEDULED campaign is inserted with the deterministic
 *    automationKey + recipientSource='patients', due per automationSendAt.
 *  - Message content comes from getAutomationTemplate (override-aware).
 *  - Seasonal gating (benefits Oct–Dec) + the weekly welcome Monday key.
 *  - A unique-violation on insert (concurrent run) is swallowed, not thrown.
 *  - previewRetentionAudiences returns all four automation counts.
 *  - automationSendAt: before 10am clinic-local → today 10am; after → now.
 */

const h = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  // Per-table query results
  clinics: [] as Record<string, unknown>[],
  existingCampaign: [] as Record<string, unknown>[],
  audienceFind: [] as Record<string, unknown>[],
  inserts: [] as { table: string | undefined; values: Record<string, unknown> }[],
  updates: [] as { table: string | undefined; set: Record<string, unknown> }[],
  insertThrows: null as unknown,
  insertedCampaignId: 555,
  insertedAudienceId: 100,
}))

vi.mock('@/lib/db', () => {
  function resolve(kind: string, tbl: string | undefined): Promise<unknown> {
    if (kind === 'select') {
      if (tbl === 'clinicProfile') return Promise.resolve(h.clinics)
      if (tbl === 'campaigns') return Promise.resolve(h.existingCampaign)
      if (tbl === 'audiences') return Promise.resolve(h.audienceFind)
      return Promise.resolve([])
    }
    if (kind === 'insert') {
      // Only the campaign insert simulates a fault — the audience insert (which
      // runs first) must succeed so we're testing the right failure.
      if (tbl === 'campaigns' && h.insertThrows) return Promise.reject(h.insertThrows)
      if (tbl === 'campaigns') return Promise.resolve([{ id: h.insertedCampaignId }])
      if (tbl === 'audiences') return Promise.resolve([{ id: h.insertedAudienceId }])
      return Promise.resolve([])
    }
    return Promise.resolve(undefined) // update
  }
  function chain(kind: string, table?: string) {
    const ctx: { kind: string; tbl: string | undefined } = { kind, tbl: table }
    const proxy: Record<string, unknown> = {
      from: (t: { __t?: string }) => {
        ctx.tbl = t?.__t
        return proxy
      },
      innerJoin: () => resolve(ctx.kind, ctx.tbl),
      where: () => proxy,
      limit: () => resolve(ctx.kind, ctx.tbl),
      orderBy: () => proxy,
      set: (v: Record<string, unknown>) => {
        h.updates.push({ table: ctx.tbl, set: v })
        return proxy
      },
      values: (v: Record<string, unknown>) => {
        h.inserts.push({ table: ctx.tbl, values: v })
        return proxy
      },
      returning: () => resolve(ctx.kind, ctx.tbl),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        resolve(ctx.kind, ctx.tbl).then(res, rej),
    }
    return proxy
  }
  const t = (name: string) => ({ __t: name })
  return {
    db: {
      select: () => chain('select'),
      insert: (tb: { __t?: string }) => chain('insert', tb?.__t),
      update: (tb: { __t?: string }) => chain('update', tb?.__t),
    },
    schema: {
      clinicProfile: {
        ...t('clinicProfile'),
        organizationId: 'organizationId',
        birthdayAutoSendEnabled: 'birthdayAutoSendEnabled',
        lapsedReactivationEnabled: 'lapsedReactivationEnabled',
      },
      organization: { ...t('organization'), id: 'id', isDemo: 'isDemo' },
      campaigns: { ...t('campaigns'), id: 'id', organizationId: 'organizationId', automationKey: 'automationKey' },
      audiences: { ...t('audiences'), id: 'id', organizationId: 'organizationId', name: 'name' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _kind: 'and', a }),
  eq: (...a: unknown[]) => ({ _kind: 'eq', a }),
}))

vi.mock('@/lib/services/marketing', () => ({
  resolvePatientAudience: h.resolveMock,
}))

// The engine now reads the org's message via getAutomationTemplate (override
// or system default — campaigns phase 2); mock it per kind.
vi.mock('@/lib/services/marketing-templates', () => ({
  getAutomationTemplate: async (_orgId: string, kind: string) => {
    const byKind: Record<string, { subject: string; previewText: string; bodyHtml: string }> = {
      reactivation: { subject: 'Has it been a minute?', previewText: 'A friendly nudge.', bodyHtml: '<p>Hi {{firstName}}, come back.</p>' },
      benefits: { subject: 'Your benefits reset January 1', previewText: 'Use them before they vanish.', bodyHtml: '<p>Hi {{firstName}}, benefits expire.</p>' },
      birthday: { subject: 'Happy birthday', previewText: 'A little note.', bodyHtml: '<p>Hi {{firstName}}, happy birthday.</p>' },
      welcome: { subject: 'Welcome — a few things', previewText: 'What comes next.', bodyHtml: '<p>Hi {{firstName}}, welcome.</p>' },
    }
    return { ...byKind[kind], isCustom: false }
  },
}))

import { runRetentionAutomations, previewRetentionAudiences } from '@/lib/services/retention-automation'

const NOW = new Date('2026-06-18T15:00:00.000Z')

function recipients(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, patientId: `p${i}`, firstName: 'Mia', email: `m${i}@x.com`, emailOptIn: true }))
}

beforeEach(() => {
  h.resolveMock.mockReset().mockResolvedValue(recipients(3))
  h.clinics = []
  h.existingCampaign = []
  h.audienceFind = []
  h.inserts = []
  h.updates = []
  h.insertThrows = null
})

describe('runRetentionAutomations', () => {
  it('skips demo clinics entirely', async () => {
    h.clinics = [{ organizationId: 'org_demo', birthday: 1, reactivation: 1, isDemo: true }]
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.scanned).toBe(0)
    expect(res.created).toBe(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('skips clinics with both automations off', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 0, reactivation: 0, isDemo: false }]
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.scanned).toBe(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('creates a scheduled birthday campaign with the deterministic key', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 1, reactivation: 0, isDemo: false }]
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.scanned).toBe(1)
    expect(res.created).toBe(1)
    const campaignInsert = h.inserts.find((i) => i.table === 'campaigns')
    expect(campaignInsert).toBeTruthy()
    expect(campaignInsert!.values.automationKey).toBe('birthday:org_1:2026-06-18')
    expect(campaignInsert!.values.status).toBe('scheduled')
    expect(campaignInsert!.values.recipientSource).toBe('patients')
    expect(campaignInsert!.values.scheduledAt).toEqual(NOW)
    expect(campaignInsert!.values.subject).toBe('Happy birthday')
    expect(campaignInsert!.values.createdBy).toBeNull()
    // An automation audience was created too.
    expect(h.inserts.some((i) => i.table === 'audiences')).toBe(true)
  })

  it('is idempotent — an existing campaign for the window is not re-created', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 1, reactivation: 0, isDemo: false }]
    h.existingCampaign = [{ id: 999 }] // a campaign with this automationKey already exists
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.alreadyCreated).toBe(1)
    expect(res.created).toBe(0)
    expect(h.inserts).toHaveLength(0)
    // Audience never resolved either (we bail before that).
    expect(h.resolveMock).not.toHaveBeenCalled()
  })

  it('does not create a campaign when the audience is empty', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 1, reactivation: 0, isDemo: false }]
    h.resolveMock.mockResolvedValue([]) // nobody has a birthday today
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.emptyAudience).toBe(1)
    expect(res.created).toBe(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('fires both automations for an org with both enabled (monthly key for reactivation)', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 1, reactivation: 1, isDemo: false }]
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.created).toBe(2)
    const keys = h.inserts.filter((i) => i.table === 'campaigns').map((i) => i.values.automationKey)
    expect(keys).toContain('birthday:org_1:2026-06-18')
    expect(keys).toContain('reactivation:org_1:2026-06') // monthly granularity
  })

  it('use-your-benefits stays quiet outside Oct–Dec even when enabled', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 0, reactivation: 0, benefits: 1, isDemo: false }]
    const res = await runRetentionAutomations({ now: NOW }) // June
    expect(res.scanned).toBe(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('use-your-benefits fires in season with a monthly key + the benefits template', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 0, reactivation: 0, benefits: 1, isDemo: false }]
    const res = await runRetentionAutomations({ now: new Date('2026-11-05T15:00:00.000Z') })
    expect(res.created).toBe(1)
    const campaignInsert = h.inserts.find((i) => i.table === 'campaigns')
    expect(campaignInsert!.values.automationKey).toBe('benefits:org_1:2026-11')
    expect(campaignInsert!.values.subject).toBe('Your benefits reset January 1')
  })

  it('reuses an existing automation audience instead of creating a new one', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 1, reactivation: 0, isDemo: false }]
    h.audienceFind = [{ id: 42 }] // the birthday automation audience already exists
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.created).toBe(1)
    // No new audience inserted; the existing one is refreshed (update) + pointed at.
    expect(h.inserts.some((i) => i.table === 'audiences')).toBe(false)
    expect(h.updates.some((u) => u.table === 'audiences')).toBe(true)
    const campaignInsert = h.inserts.find((i) => i.table === 'campaigns')
    expect(campaignInsert!.values.audienceId).toBe(42)
  })

  it('swallows a unique-violation on insert (concurrent run) without throwing', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 1, reactivation: 0, isDemo: false }]
    h.insertThrows = Object.assign(new Error('duplicate key'), { code: '23505' })
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.created).toBe(0)
    expect(res.alreadyCreated).toBe(1)
    expect(res.errors).toHaveLength(0)
  })

  it('records a non-unique insert error without aborting the whole run', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 1, reactivation: 0, isDemo: false }]
    h.insertThrows = Object.assign(new Error('boom'), { code: '500' })
    const res = await runRetentionAutomations({ now: NOW })
    expect(res.created).toBe(0)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].kind).toBe('birthday')
  })

  it('welcome fires weekly — keyed to the UTC Monday of the current week', async () => {
    h.clinics = [{ organizationId: 'org_1', birthday: 0, reactivation: 0, welcome: 1, isDemo: false }]
    const res = await runRetentionAutomations({ now: NOW }) // Thu 2026-06-18 → Mon 2026-06-15
    expect(res.created).toBe(1)
    const campaignInsert = h.inserts.find((i) => i.table === 'campaigns')
    expect(campaignInsert!.values.automationKey).toBe('welcome:org_1:2026-06-15')
    expect(campaignInsert!.values.subject).toBe('Welcome — a few things')
  })
})

describe('previewRetentionAudiences', () => {
  it('returns all four automation counts', async () => {
    h.resolveMock
      .mockResolvedValueOnce(recipients(4)) // birthdaysThisMonth
      .mockResolvedValueOnce(recipients(2)) // newlyLapsed
      .mockResolvedValueOnce(recipients(3)) // benefitsEligible
      .mockResolvedValueOnce(recipients(1)) // newThisWeek
    const counts = await previewRetentionAudiences('org_1')
    expect(counts).toEqual({ birthdaysThisMonth: 4, newlyLapsed: 2, benefitsEligible: 3, newThisWeek: 1 })
  })
})

describe('automationSendAt — the clinic-local send window (phase 4)', () => {
  it('before 10am clinic-local: schedules for 10am that day', async () => {
    const { automationSendAt } = await import('@/lib/services/retention-automation')
    // 12:00 UTC on Jun 18 = 07:00 in Chicago (CDT) → today 10:00 CDT = 15:00 UTC.
    const at = automationSendAt(new Date('2026-06-18T12:00:00.000Z'), 'America/Chicago')
    expect(at.toISOString()).toBe('2026-06-18T15:00:00.000Z')
  })

  it('after 10am clinic-local: sends now — never pushes a birthday to tomorrow', async () => {
    const { automationSendAt } = await import('@/lib/services/retention-automation')
    // 20:00 UTC = 15:00 CDT, past the window → now wins.
    const now = new Date('2026-06-18T20:00:00.000Z')
    expect(automationSendAt(now, 'America/Chicago').toISOString()).toBe(now.toISOString())
  })
})
