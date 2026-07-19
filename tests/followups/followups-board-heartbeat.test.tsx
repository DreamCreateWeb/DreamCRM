/**
 * FollowupsBoard — the 8-week completed-follow-ups heartbeat sparkline (law 7).
 *
 * Mirrors tests/patients/patients-list-heartbeat.test.tsx: renders with a
 * signal-bearing series, stays hidden with no series / a single blip, and is
 * decorative (aria-hidden svg; the adjacent text label carries the meaning).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(default)/patients/actions', () => ({
  completeFollowupAction: vi.fn(),
  reopenFollowupAction: vi.fn(),
  updateFollowupAction: vi.fn(),
}))
vi.mock('@/app/(default)/followups/followup-rules-card', () => ({ default: () => null }))

import FollowupsBoard from '@/app/(default)/followups/followups-board'
import { DEFAULT_FOLLOWUP_RULES } from '@/lib/types/followup-rules'

// 8 buckets, oldest first — mirrors getFollowupsCompletedPerWeek8's shape.
const series = (values: number[]) =>
  values.map((v, i) => ({ bucket: `Wk ${i + 1}`, value: v }))

function renderBoard(completedPerWeek8?: Array<{ bucket: string; value: number }>) {
  return render(
    <FollowupsBoard
      rows={[]}
      orgName="Dream Dental"
      filters={{ mine: false, includeDone: false }}
      staff={[]}
      currentUserId="user_1"
      ruleConfig={DEFAULT_FOLLOWUP_RULES}
      digestEnabled={false}
      canManageRules={false}
      completedPerWeek8={completedPerWeek8}
    />,
  )
}

describe('FollowupsBoard — 8-week heartbeat sparkline (law 7)', () => {
  it('renders the sparkline with its label when the series carries signal', () => {
    const { container } = renderBoard(series([0, 2, 1, 0, 3, 0, 1, 2]))
    expect(screen.getByText('Completed · 8 weeks')).toBeInTheDocument()
    // Decorative: the svg is wrapped in aria-hidden; the adjacent text label
    // carries the meaning.
    const spark = container.querySelector('[aria-hidden="true"] svg')
    expect(spark).not.toBeNull()
    expect(spark!.querySelectorAll('circle')).toHaveLength(8)
  })

  it('stays hidden without the series or with fewer than 2 nonzero weeks', () => {
    // No prop at all (default []) — nothing renders.
    const { container } = render(
      <FollowupsBoard
        rows={[]}
        orgName="Dream Dental"
        filters={{ mine: false, includeDone: false }}
        staff={[]}
        currentUserId="user_1"
        ruleConfig={DEFAULT_FOLLOWUP_RULES}
        digestEnabled={false}
        canManageRules={false}
      />,
    )
    expect(screen.queryByText('Completed · 8 weeks')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeNull()
  })

  it('treats a single blip as no trend — still hidden', () => {
    const { container } = renderBoard(series([0, 0, 0, 0, 0, 0, 0, 5]))
    expect(screen.queryByText('Completed · 8 weeks')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeNull()
  })
})
