/**
 * FollowupQuickAdd — the shared one-tap follow-up affordance dropped into the
 * appointment drawer and the message thread. These tests pin the contract the
 * host surfaces depend on: it stays collapsed until clicked, guards an empty
 * title, calls the create action with the patient + due date, reports success
 * (and errors) back through onDone, and collapses after a successful add.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

type FollowupInput = { patientId: string; title: string; dueDate: string | null }
const createFollowupAction = vi.fn(
  async (_input: FollowupInput) => ({ ok: true as const, followup: {} as never }),
)
vi.mock('@/app/(default)/patients/actions', () => ({
  createFollowupAction: (input: FollowupInput) => createFollowupAction(input),
}))

import FollowupQuickAdd from '@/components/followups/followup-quick-add'

beforeEach(() => {
  createFollowupAction.mockClear()
  createFollowupAction.mockResolvedValue({ ok: true, followup: {} as never })
})

describe('FollowupQuickAdd', () => {
  it('starts collapsed with the default trigger label and no form', () => {
    render(<FollowupQuickAdd patientId="pat_1" patientFirstName="Mia" onDone={vi.fn()} />)
    expect(screen.getByRole('button', { name: '+ Add a follow-up' })).toBeTruthy()
    expect(screen.queryByPlaceholderText(/Follow up with Mia/)).toBeNull()
  })

  it('honors a custom trigger label', () => {
    render(
      <FollowupQuickAdd patientId="pat_1" patientFirstName="Mia" onDone={vi.fn()} triggerLabel="+ Follow-up" />,
    )
    expect(screen.getByRole('button', { name: '+ Follow-up' })).toBeTruthy()
  })

  it('opens the form when the trigger is clicked', () => {
    render(<FollowupQuickAdd patientId="pat_1" patientFirstName="Mia" onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add a follow-up' }))
    expect(screen.getByPlaceholderText(/Follow up with Mia/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })

  it('does not call the action when the title is blank', () => {
    render(<FollowupQuickAdd patientId="pat_1" patientFirstName="Mia" onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add a follow-up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(createFollowupAction).not.toHaveBeenCalled()
  })

  it('creates the follow-up with the patient + due date and reports success', async () => {
    const onDone = vi.fn()
    render(<FollowupQuickAdd patientId="pat_42" patientFirstName="Mia" onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add a follow-up' }))
    fireEvent.change(screen.getByPlaceholderText(/Follow up with Mia/), {
      target: { value: 'Call about the crown estimate' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(createFollowupAction).toHaveBeenCalledTimes(1))
    const arg = createFollowupAction.mock.calls[0][0]
    expect(arg.patientId).toBe('pat_42')
    expect(arg.title).toBe('Call about the crown estimate')
    expect(arg.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Follow-up added for Mia'))
    // Collapses back to the trigger after a successful add.
    await waitFor(() => expect(screen.queryByPlaceholderText(/Follow up with Mia/)).toBeNull())
  })

  it('surfaces the action error through onDone', async () => {
    createFollowupAction.mockResolvedValueOnce({ ok: false, error: 'Nope' } as never)
    const onDone = vi.fn()
    render(<FollowupQuickAdd patientId="pat_1" patientFirstName="Mia" onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add a follow-up' }))
    fireEvent.change(screen.getByPlaceholderText(/Follow up with Mia/), { target: { value: 'Ring them' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Nope'))
  })
})
