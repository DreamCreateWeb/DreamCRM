import { describe, it, expect } from 'vitest'
import { computePipelineMetrics, type PipelineProject } from '@/lib/services/projects'
import type { AgencyProjectStatus, AgencyProjectType } from '@/lib/db/schema/platform'

const NOW = new Date('2026-05-18T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function project(overrides: Partial<PipelineProject> = {}): PipelineProject {
  return {
    id: overrides.id ?? 'p_x',
    title: 'Project X',
    description: null,
    type: 'website',
    status: 'lead',
    budgetCents: 100_000,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    organizationId: 'org_x',
    clinicName: 'X Clinic',
    clinicSlug: 'x',
    ownerUserId: null,
    createdAt: new Date(NOW.getTime() - 30 * DAY),
    updatedAt: new Date(NOW.getTime() - 7 * DAY),
    ...overrides,
  }
}

describe('computePipelineMetrics', () => {
  it('returns zeros for an empty list', () => {
    const m = computePipelineMetrics([], { now: NOW })
    expect(m.openCount).toBe(0)
    expect(m.openValueCents).toBe(0)
    expect(m.wonCount90d).toBe(0)
    expect(m.winRatePct).toBe(0)
    expect(m.avgDaysToClose).toBeNull()
    expect(m.overdueCount).toBe(0)
  })

  it('counts open projects across lead/discovery/in_progress/review only', () => {
    const m = computePipelineMetrics(
      [
        project({ id: 'a', status: 'lead', budgetCents: 50_000 }),
        project({ id: 'b', status: 'discovery', budgetCents: 100_000 }),
        project({ id: 'c', status: 'in_progress', budgetCents: 200_000 }),
        project({ id: 'd', status: 'review', budgetCents: 150_000 }),
        project({ id: 'e', status: 'completed', budgetCents: 99_999 }),
        project({ id: 'f', status: 'on_hold', budgetCents: 99_999 }),
        project({ id: 'g', status: 'cancelled', budgetCents: 99_999 }),
      ],
      { now: NOW },
    )
    expect(m.openCount).toBe(4)
    expect(m.openValueCents).toBe(500_000)
  })

  it('counts wins in the last 90 days only', () => {
    const m = computePipelineMetrics(
      [
        project({ id: 'recent', status: 'completed', completedAt: new Date(NOW.getTime() - 10 * DAY), budgetCents: 250_000 }),
        project({ id: 'old', status: 'completed', completedAt: new Date(NOW.getTime() - 120 * DAY), budgetCents: 999_999 }),
      ],
      { now: NOW },
    )
    expect(m.wonCount90d).toBe(1)
    expect(m.wonValueCents90d).toBe(250_000)
  })

  it('computes win rate from won vs lost (cancelled) in the last 90d', () => {
    const m = computePipelineMetrics(
      [
        project({ id: 'w1', status: 'completed', completedAt: new Date(NOW.getTime() - 5 * DAY) }),
        project({ id: 'w2', status: 'completed', completedAt: new Date(NOW.getTime() - 30 * DAY) }),
        project({ id: 'w3', status: 'completed', completedAt: new Date(NOW.getTime() - 60 * DAY) }),
        project({ id: 'l1', status: 'cancelled', completedAt: new Date(NOW.getTime() - 20 * DAY) }),
      ],
      { now: NOW },
    )
    expect(m.winRatePct).toBe(75) // 3 won / 4 total
  })

  it('returns 0 win rate when there are no closes in the window', () => {
    const m = computePipelineMetrics([project({ status: 'lead' })], { now: NOW })
    expect(m.winRatePct).toBe(0)
  })

  it('computes average days to close from createdAt to completedAt', () => {
    const m = computePipelineMetrics(
      [
        project({
          id: 'a',
          status: 'completed',
          createdAt: new Date(NOW.getTime() - 40 * DAY),
          completedAt: new Date(NOW.getTime() - 10 * DAY),
        }),
        project({
          id: 'b',
          status: 'completed',
          createdAt: new Date(NOW.getTime() - 30 * DAY),
          completedAt: new Date(NOW.getTime() - 20 * DAY),
        }),
      ],
      { now: NOW },
    )
    // (30d + 10d) / 2 = 20d
    expect(m.avgDaysToClose).toBe(20)
  })

  it('flags overdue projects (past due, still open)', () => {
    const m = computePipelineMetrics(
      [
        project({ id: 'late', status: 'in_progress', dueDate: new Date(NOW.getTime() - 5 * DAY) }),
        project({ id: 'future', status: 'in_progress', dueDate: new Date(NOW.getTime() + 5 * DAY) }),
        project({ id: 'done-late', status: 'completed', dueDate: new Date(NOW.getTime() - 5 * DAY) }),
      ],
      { now: NOW },
    )
    expect(m.overdueCount).toBe(1) // only the open one
  })

  it('groups counts by status and type', () => {
    const m = computePipelineMetrics(
      [
        project({ id: 'a', type: 'website', status: 'lead' }),
        project({ id: 'b', type: 'website', status: 'in_progress' }),
        project({ id: 'c', type: 'videography', status: 'review' }),
        project({ id: 'd', type: 'intake_form', status: 'completed', completedAt: new Date(NOW.getTime() - 1 * DAY) }),
      ],
      { now: NOW },
    )
    expect(m.byStatusCount.lead).toBe(1)
    expect(m.byStatusCount.in_progress).toBe(1)
    expect(m.byStatusCount.review).toBe(1)
    expect(m.byStatusCount.completed).toBe(1)
    expect(m.byTypeCount.website).toBe(2)
    expect(m.byTypeCount.videography).toBe(1)
    expect(m.byTypeCount.intake_form).toBe(1)
  })

  it('sums value-by-status correctly', () => {
    const m = computePipelineMetrics(
      [
        project({ status: 'lead', budgetCents: 50_000 }),
        project({ status: 'lead', budgetCents: 75_000 }),
        project({ status: 'in_progress', budgetCents: 200_000 }),
      ],
      { now: NOW },
    )
    expect(m.byStatusValueCents.lead).toBe(125_000)
    expect(m.byStatusValueCents.in_progress).toBe(200_000)
  })

  it('treats null budget as zero', () => {
    const m = computePipelineMetrics(
      [project({ status: 'lead', budgetCents: null })],
      { now: NOW },
    )
    expect(m.openValueCents).toBe(0)
    expect(m.openCount).toBe(1)
  })

  it('ignores wins outside the 90d window when computing close time', () => {
    const m = computePipelineMetrics(
      [
        project({
          status: 'completed',
          createdAt: new Date(NOW.getTime() - 200 * DAY),
          completedAt: new Date(NOW.getTime() - 150 * DAY),
        }),
      ],
      { now: NOW },
    )
    expect(m.avgDaysToClose).toBeNull()
  })
})
