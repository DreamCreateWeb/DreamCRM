// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StaleRefresh } from '@/components/ui/stale-refresh'
import { STALE_APP_MESSAGE } from '@/lib/deployment-skew'

const { sendPayLinkAction } = vi.hoisted(() => ({ sendPayLinkAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(default)/patients/actions', () => ({ sendPayLinkAction: (...a: unknown[]) => sendPayLinkAction(...a) }))

import SendLinkCell from '@/app/(default)/payments/collections/send-link-cell'

describe('StaleRefresh', () => {
  it('offers Refresh only for the redeploy message', () => {
    const { rerender } = render(<StaleRefresh error="Something else" />)
    expect(screen.queryByText('Refresh')).toBeNull()
    rerender(<StaleRefresh error={STALE_APP_MESSAGE} />)
    expect(screen.getByText('Refresh')).toBeTruthy()
  })
})

describe('a thrown action in a wrapped surface', () => {
  it('shows the stale message + Refresh instead of freezing', async () => {
    sendPayLinkAction.mockRejectedValueOnce(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))
    render(<SendLinkCell patientId="p1" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByText(/updated while this tab was open/i)).toBeTruthy())
    expect(screen.getByText('Refresh')).toBeTruthy()
  })

  it('a refusal shows its own error with no Refresh', async () => {
    sendPayLinkAction.mockResolvedValueOnce({ ok: false, error: 'No email on file.' })
    render(<SendLinkCell patientId="p1" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByText(/No email on file/)).toBeTruthy())
    expect(screen.queryByText('Refresh')).toBeNull()
  })
})
