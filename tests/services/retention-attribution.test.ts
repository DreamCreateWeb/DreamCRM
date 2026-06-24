import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Retention attribution — the proof layer under Recall & Outreach. Buckets the
 * `booked` campaign events by the kind of outreach, dedupes per patient
 * (most-recent wins), and sums distinct patients won back.
 */

let bookedRows: Array<Record<string, unknown>> = []

function chain() {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy']) c[m] = () => c
  c.then = (resolve: (v: unknown) => unknown) => resolve(bookedRows)
  return c
}

vi.mock('@/lib/db', () => ({
  db: { select: () => chain() },
  schema: {
    campaignEvents: { patientId: 'p', bookedAppointmentId: 'a', occurredAt: 'o', type: 't', campaignId: 'c' },
    campaigns: { id: 'id', organizationId: 'org', automationKey: 'ak', templateId: 'tid' },
    campaignTemplates: { id: 'id', category: 'cat' },
    patient: { firstName: 'f', lastName: 'l' },
  },
}))
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }), eq: (...a: unknown[]) => ({ a }),
  gte: (...a: unknown[]) => ({ a }), desc: (x: unknown) => x,
}))

import { getRetentionAttribution, bucketForCampaign } from '@/lib/services/retention-attribution'

function row(patientId: string, over: Record<string, unknown> = {}) {
  return {
    patientId, firstName: 'Pat', lastName: patientId.toUpperCase(),
    appointmentId: `appt_${patientId}`, occurredAt: new Date('2026-06-20T10:00:00Z'),
    automationKey: null, templateCategory: null, ...over,
  }
}

beforeEach(() => { bookedRows = [] })

describe('bucketForCampaign', () => {
  it('reads the retention automations off the automationKey first', () => {
    expect(bucketForCampaign('birthday:org_1:2026-06-20', null)).toBe('birthday')
    expect(bucketForCampaign('reactivation:org_1:2026-06', 'recall')).toBe('reactivation') // key wins over template
  })
  it('falls back to the linked template category', () => {
    expect(bucketForCampaign(null, 'recall')).toBe('recall')
    expect(bucketForCampaign(null, 'welcome')).toBe('welcome')
    expect(bucketForCampaign(null, 'reactivation')).toBe('reactivation')
  })
  it('defaults to "other" for an uncategorized manual campaign', () => {
    expect(bucketForCampaign(null, null)).toBe('other')
    expect(bucketForCampaign(null, 'general')).toBe('other')
  })
})

describe('getRetentionAttribution', () => {
  it('buckets won-back patients and sums distinct patients', async () => {
    bookedRows = [
      row('a', { automationKey: 'reactivation:org_1:2026-06' }),
      row('b', { templateCategory: 'recall' }),
      row('c', { automationKey: 'birthday:org_1:2026-06-20' }),
      row('d', { templateCategory: 'recall' }),
    ]
    const out = await getRetentionAttribution('org_1', { days: 30 })
    expect(out.totalWonBack).toBe(4)
    // Buckets in display order: recall first.
    expect(out.buckets.map((b) => [b.key, b.count])).toEqual([
      ['recall', 2],
      ['reactivation', 1],
      ['birthday', 1],
    ])
    expect(out.buckets[0].patients[0].appointmentId).toBe('appt_b')
  })

  it('counts each patient once — most-recent booked event wins the bucket', async () => {
    // Same patient booked twice; rows arrive most-recent first (desc), so the
    // birthday event (newer) should claim them, not the recall event.
    bookedRows = [
      row('x', { automationKey: 'birthday:org_1:2026-06-20', occurredAt: new Date('2026-06-20') }),
      row('x', { templateCategory: 'recall', occurredAt: new Date('2026-06-01') }),
    ]
    const out = await getRetentionAttribution('org_1', { days: 30 })
    expect(out.totalWonBack).toBe(1)
    expect(out.buckets).toEqual([
      { key: 'birthday', label: 'Birthday messages', count: 1, patients: [expect.objectContaining({ patientId: 'x' })] },
    ])
  })

  it('returns an empty result when no campaign rebooked anyone', async () => {
    bookedRows = []
    const out = await getRetentionAttribution('org_1', { days: 90 })
    expect(out).toMatchObject({ windowDays: 90, totalWonBack: 0, buckets: [] })
  })

  it('ignores booked events with no linked patient', async () => {
    bookedRows = [row('a', { templateCategory: 'recall' }), { ...row('skip'), patientId: null }]
    const out = await getRetentionAttribution('org_1', { days: 30 })
    expect(out.totalWonBack).toBe(1)
  })
})
