/**
 * FollowupsBoard — the ?closedBy=me view (My Day's "You closed N this week"
 * link target).
 *
 * Pins the board half of the honest-link contract:
 *   - a "Closed by me" FilterChip renders in the filter row, aria-pressed
 *     mirroring the parsed param, and toggles ?closedBy=me on click;
 *   - with closedByMe on, done rows render under a "Closed by you" heading
 *     WITHOUT needing the separate done=1 filter;
 *   - an empty closed-by-me view gets the filtered "Nothing here" empty state,
 *     never the celebratory "You're all caught up".
 *
 * Mirrors tests/followups/followups-board-heartbeat.test.tsx's mocking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
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
import type { PatientFollowupView } from '@/lib/types/followups'

const doneRow: PatientFollowupView = {
  id: 'pfu_1',
  patientId: 'pat_1',
  patientName: 'Norah Nguyen',
  title: 'Call about crown follow-up',
  dueDate: null,
  assignedUserId: 'user_1',
  assigneeName: 'Front Desk',
  status: 'done',
  createdByName: null,
  completedAt: new Date('2026-07-18T20:00:00Z'),
  createdAt: new Date('2026-07-10T15:00:00Z'),
}

function renderBoard(opts: { rows?: PatientFollowupView[]; closedByMe?: boolean } = {}) {
  return render(
    <FollowupsBoard
      rows={opts.rows ?? []}
      orgName="Dream Dental"
      filters={{ mine: false, includeDone: false, closedByMe: opts.closedByMe }}
      staff={[]}
      currentUserId="user_1"
      ruleConfig={DEFAULT_FOLLOWUP_RULES}
      digestEnabled={false}
      canManageRules={false}
    />,
  )
}

beforeEach(() => {
  push.mockClear()
})

describe('FollowupsBoard — the ?closedBy=me view', () => {
  it('renders the "Closed by me" chip, un-pressed by default, and toggles ?closedBy=me on click', () => {
    renderBoard()
    const chip = screen.getByRole('button', { name: 'Closed by me' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip)
    expect(push).toHaveBeenCalledWith('/followups?closedBy=me')
  })

  it('marks the chip pressed under the filter, and clicking again clears the param', () => {
    renderBoard({ closedByMe: true })
    const chip = screen.getByRole('button', { name: 'Closed by me' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(push).toHaveBeenCalledWith('/followups?')
  })

  it('shows done rows under "Closed by you" without needing the done=1 filter', () => {
    renderBoard({ rows: [doneRow], closedByMe: true })
    expect(screen.getByText('Closed by you')).toBeInTheDocument()
    expect(screen.getByText('Call about crown follow-up')).toBeInTheDocument()
    // Plain "Show done" heading is replaced by the personal one.
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })

  it('shows the filtered empty state (never "all caught up") when the user has no closes', () => {
    renderBoard({ closedByMe: true })
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument()
  })
})
