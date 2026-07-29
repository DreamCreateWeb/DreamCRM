import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE PROPOSAL ENGINE, OBSERVABLE (Phase 4 slice 4).
 *
 * A broken generator used to be a console line nobody reads: the clinic saw
 * an empty Approval Inbox, indistinguishable from a week with nothing to
 * approve, and so did we. These pin the wiring that ends that — a break is
 * written into the clinic's ledger where the Guardian's three-strike rule
 * can see it, and a break in our own bookkeeping is NOT written into their
 * story.
 */

const ledger = vi.hoisted(() => ({ failures: [] as Array<Record<string, unknown>>, suppress: false }))
vi.mock('@/lib/services/action-ledger', () => ({
  recordFailure: vi.fn(async (input: Record<string, unknown>) => {
    if (ledger.suppress) return false
    ledger.failures.push(input)
    return true
  }),
  recordAction: vi.fn(async () => true),
}))

const ai = vi.hoisted(() => ({ configured: false }))
vi.mock('@/lib/ai', () => ({ aiConfigured: () => ai.configured, runClaudeJson: vi.fn() }))
vi.mock('@/lib/services/service-library-ai', () => ({ CORE_VOICE_RULES: '' }))
vi.mock('@/lib/services/ai-usage', () => ({
  isAiUsageOverCap: vi.fn(async () => false),
  bumpAiUsage: vi.fn(async () => {}),
}))

const svc = vi.hoisted(() => ({
  reconcileThrows: false,
  expireThrows: false,
}))
vi.mock('@/lib/services/proposals', () => ({
  fileProposal: vi.fn(async () => ({ filed: false })),
  expireStaleProposals: vi.fn(async () => {
    if (svc.expireThrows) throw new Error('expire down')
    return 0
  }),
  reconcileStrandedApprovals: vi.fn(async () => {
    if (svc.reconcileThrows) throw new Error('reconcile down')
    return 0
  }),
  closeRecoveredProposal: vi.fn(async () => 'not_ours' as const),
  autoExecuteProposal: vi.fn(async () => ({ ok: true as const })),
  machineHandlesCard: () => null,
  resolveGrantedCapabilities: () => [],
}))

const tz = vi.hoisted(() => ({ throws: false }))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => {
    if (tz.throws) throw new Error('tz lookup down')
    return 'America/New_York'
  }),
}))
vi.mock('@/lib/trial', () => ({ resolveTrialState: () => ({ isTrialing: false, hasExpired: false }) }))

const store = vi.hoisted(() => ({
  orgs: [] as Array<Record<string, unknown>>,
  throwOnTable: null as string | null,
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  function select(cols?: Record<string, unknown>) {
    let table = ''
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.where = () => api
    api.orderBy = () => api
    api.groupBy = () => api
    const rows = () => {
      if (store.throwOnTable && table === store.throwOnTable) {
        throw new Error(`${table} read down`)
      }
      return table === 'organization' ? store.orgs : []
    }
    api.limit = async () => rows()
    api.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      try { resolve(rows()) } catch (e) { reject(e) }
    }
    return api
  }
  const t = (name: string, ...cols: string[]) =>
    Object.assign({ __name: name }, Object.fromEntries(cols.map((c) => [c, col(c)])))
  return {
    db: { select, update: () => ({ set: () => ({ where: async () => undefined }) }) },
    schema: {
      organization: t('organization', 'id', 'name', 'type', 'isDemo'),
      platformReview: t('platform_review', 'organizationId', 'platform', 'externalReviewId', 'reviewerName', 'starRating', 'comment', 'replyComment', 'reviewCreatedAt', 'createdAt'),
      lead: t('lead', 'id', 'organizationId', 'name', 'email', 'phone', 'message', 'status', 'createdAt'),
      socialPostTarget: t('social_post_target', 'organizationId', 'platform', 'status', 'createdAt'),
      proposal: t('proposal', 'id', 'organizationId', 'capability', 'status', 'sourceKey', 'payload', 'decidedAt', 'createdAt', 'body', 'subject', 'expiresAt'),
      clinicProfile: t('clinic_profile', 'organizationId', 'autonomy', 'timezone', 'reminderSettings'),
      patient: t('patient', 'id', 'organizationId', 'email', 'createdAt'),
      appointment: t('appointment', 'id', 'organizationId', 'patientId', 'startsAt', 'status'),
      campaign: t('campaign', 'id', 'organizationId', 'status', 'scheduledFor', 'createdAt'),
    },
  }
})

vi.mock('drizzle-orm', () => {
  const p = () => ({ op: 'x' })
  return { and: p, or: p, eq: p, gte: p, lt: p, lte: p, desc: p, asc: p, isNull: p, isNotNull: p, inArray: p, ne: p, sql: Object.assign(p, { raw: p }) }
})

import { runProposalGenerators, STEP_FAILURE, ENGINE_DOWN } from '@/lib/services/proposal-generators'
import { CAPABILITIES } from '@/lib/autonomy'

const NOW = new Date('2026-07-29T14:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  ledger.failures = []
  ledger.suppress = false
  svc.reconcileThrows = false
  svc.expireThrows = false
  tz.throws = false
  ai.configured = false
  store.orgs = [{ id: 'org_a', name: 'Ash Dental', type: 'clinic', isDemo: false }]
  store.throwOnTable = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('the failure map', () => {
  it('every capability it writes under is REGISTERED — an orphan stream reports to nobody', () => {
    const registered = new Set(CAPABILITIES.map((c) => c.key))
    const used = [...Object.values(STEP_FAILURE).filter(Boolean).map((f) => f!.capability), ENGINE_DOWN.capability]
    for (const c of used) expect(registered.has(c), `'${c}' is not in CAPABILITIES`).toBe(true)
  })

  it('speaks the clinic’s language, never a stack trace', () => {
    for (const f of [...Object.values(STEP_FAILURE).filter(Boolean).map((f) => f!), ENGINE_DOWN]) {
      expect(f.summary).not.toContain('!')
      // Anti-shame: our plumbing breaking is never their fault.
      expect(f.summary).not.toMatch(/\byou (failed|forgot|didn.t)\b|\berror\b|\bexception\b/i)
      // It always says it will try again — a dead end reads as abandonment.
      expect(f.summary).toMatch(/try|trying/i)
    }
  })

  it('our own bookkeeping is deliberately NOT a sentence in their story', () => {
    expect(STEP_FAILURE.reconcile).toBeNull()
    expect(STEP_FAILURE.sweep).toBeNull()
  })
})

describe('runProposalGenerators — a break is recorded where the Guardian can see it', () => {
  it('the whole engine dying for an org is written under proposal_engine', async () => {
    tz.throws = true
    const r = await runProposalGenerators(NOW)
    expect(r.failuresRecorded).toBe(1)
    expect(ledger.failures).toHaveLength(1)
    expect(ledger.failures[0].capability).toBe('proposal_engine')
    expect(ledger.failures[0].organizationId).toBe('org_a')
    // Recorded once a day, not once an hour — the cron ticks hourly.
    expect(ledger.failures[0].onceWithin).toBe(24 * 60 * 60 * 1000)
  })

  it('one generator breaking is recorded under ITS OWN capability', async () => {
    // The review-reply generator returns early when AI is off, so it has to
    // be reachable before its read can be made to fail.
    ai.configured = true
    store.throwOnTable = 'platform_review'
    const r = await runProposalGenerators(NOW)
    expect(ledger.failures.map((f) => f.capability)).toContain('review_reply')
    expect(r.errors.some((e) => e.error.startsWith('review_reply:'))).toBe(true)
  })

  it('a reconcile failure is reported to US but never written into their story', async () => {
    svc.reconcileThrows = true
    const r = await runProposalGenerators(NOW)
    expect(r.errors.some((e) => e.error.startsWith('reconcile:'))).toBe(true)
    expect(ledger.failures).toHaveLength(0)
    expect(r.failuresRecorded).toBe(0)
  })

  it('a healthy run writes no failures at all', async () => {
    const r = await runProposalGenerators(NOW)
    expect(ledger.failures).toHaveLength(0)
    expect(r.failuresRecorded).toBe(0)
  })

  it('a SUPPRESSED repeat still surfaces as an error but is not double-counted', async () => {
    tz.throws = true
    ledger.suppress = true
    const r = await runProposalGenerators(NOW)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.failuresRecorded).toBe(0)
  })

  it('one org’s break never stops the next org being scanned', async () => {
    store.orgs = [
      { id: 'org_a', name: 'Ash Dental', type: 'clinic', isDemo: false },
      { id: 'org_b', name: 'Birch Dental', type: 'clinic', isDemo: false },
    ]
    tz.throws = true
    const r = await runProposalGenerators(NOW)
    expect(r.orgsScanned).toBe(2)
    expect(ledger.failures.map((f) => f.organizationId)).toEqual(['org_a', 'org_b'])
  })
})
