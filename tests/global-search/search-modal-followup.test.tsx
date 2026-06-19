/**
 * ⌘K palette → "add a follow-up for a patient" sub-mode. The palette searches
 * + navigates; the ＋ Follow-up affordance on a patient result lets you compose
 * a follow-up without leaving where you are. These tests pin: the affordance is
 * patient-only, opening it swaps to the composer, a valid submit calls the
 * create action with the right patient + due date and returns to results with a
 * confirmation, an empty title is guarded, and Back cancels cleanly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// Headless UI renders via a portal + CSS transitions; passthrough mocks put the
// panel content straight in the DOM so the test is deterministic.
vi.mock('@headlessui/react', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogPanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Transition: ({ children, show }: { children: ReactNode; show?: boolean }) => (show ? <div>{children}</div> : null),
  TransitionChild: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const globalSearchAction = vi.fn()
vi.mock('@/app/(default)/search/actions', () => ({
  globalSearchAction: (...a: unknown[]) => globalSearchAction(...a),
}))

type FollowupInput = { patientId: string; title: string; dueDate: string | null }
const createFollowupAction = vi.fn(async (_i: FollowupInput) => ({ ok: true as const, followup: {} as never }))
vi.mock('@/app/(default)/patients/actions', () => ({
  createFollowupAction: (i: FollowupInput) => createFollowupAction(i),
}))

import SearchModal from '@/components/search-modal'

const GROUPS = [
  {
    label: 'Patients',
    results: [
      { id: 'pat-pat_1', label: 'Mia Hayes', sublabel: 'mia@example.com', href: '/patients/pat_1', kind: 'patient' as const },
    ],
  },
  {
    label: 'Pages',
    results: [
      { id: 'page-leads', label: 'Leads', sublabel: 'Daily', href: '/leads', kind: 'page' as const },
    ],
  },
]

beforeEach(() => {
  globalSearchAction.mockReset()
  globalSearchAction.mockResolvedValue(GROUPS)
  createFollowupAction.mockClear()
  createFollowupAction.mockResolvedValue({ ok: true, followup: {} as never })
})

describe('SearchModal — follow-up composer', () => {
  it('shows a ＋ Follow-up affordance on patient results only', async () => {
    render(<SearchModal isOpen setIsOpen={vi.fn()} />)
    await screen.findByText('Mia Hayes')
    // One follow-up trigger (the patient), none for the page result.
    expect(screen.getByTitle('Add a follow-up for Mia')).toBeTruthy()
    expect(screen.getAllByTitle(/Add a follow-up/)).toHaveLength(1)
  })

  it('opens the composer for the chosen patient and creates the follow-up', async () => {
    render(<SearchModal isOpen setIsOpen={vi.fn()} />)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByTitle('Add a follow-up for Mia'))

    // Composer view.
    expect(screen.getByText('Add a follow-up for Mia')).toBeTruthy()
    const input = screen.getByPlaceholderText(/Call Mia about the crown estimate/)
    fireEvent.change(input, { target: { value: 'Call about the crown' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }))

    await waitFor(() => expect(createFollowupAction).toHaveBeenCalledTimes(1))
    const arg = createFollowupAction.mock.calls[0][0]
    expect(arg.patientId).toBe('pat_1')
    expect(arg.title).toBe('Call about the crown')
    expect(arg.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Returns to results with a confirmation flash.
    await waitFor(() => expect(screen.getByText(/Follow-up added for Mia/)).toBeTruthy())
    expect(screen.getByText('Mia Hayes')).toBeTruthy()
  })

  it('guards an empty title (no action call)', async () => {
    render(<SearchModal isOpen setIsOpen={vi.fn()} />)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByTitle('Add a follow-up for Mia'))
    fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }))
    expect(createFollowupAction).not.toHaveBeenCalled()
    expect(screen.getByText(/Add a short reminder/)).toBeTruthy()
  })

  it('Back to results cancels the composer without creating anything', async () => {
    render(<SearchModal isOpen setIsOpen={vi.fn()} />)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByTitle('Add a follow-up for Mia'))
    fireEvent.click(screen.getByRole('button', { name: /Back to results/ }))
    // Composer gone, results back, nothing created.
    expect(screen.queryByText('Add a follow-up for Mia')).toBeNull()
    expect(screen.getByText('Mia Hayes')).toBeTruthy()
    expect(createFollowupAction).not.toHaveBeenCalled()
  })
})
