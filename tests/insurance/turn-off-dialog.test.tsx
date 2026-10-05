import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * THE DEAD LINK (2026-10-05). "Turn off insurance checks" awaited the kit's
 * confirm dialog INSIDE a React transition; React 19 holds an async
 * transition's screen updates until it settles, so the dialog never
 * appeared and the click did nothing. This test uses the REAL
 * ConfirmProvider (the tool's own test mocks it, which is how the deadlock
 * slipped through): the dialog must appear, and its confirm must call the
 * action.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => vi.fn() }))
const disableInsuranceAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/app/(default)/insurance/actions', () => ({
  disableInsuranceAction: (...a: unknown[]) => disableInsuranceAction(...(a as [])),
  checkInsuranceAction: vi.fn(),
  createPatientFromCheckAction: vi.fn(),
  saveInsuranceToPatientAction: vi.fn(),
  searchPayersAction: vi.fn(),
  scanCardAction: vi.fn(),
}))
vi.mock('@/lib/upload-with-progress', () => ({ uploadFileWithProgress: vi.fn(), UploadCancelledError: class extends Error {} }))

import InsuranceTool from '@/app/(default)/insurance/insurance-tool'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'

describe('Turn off insurance checks — with the real confirm dialog', () => {
  it('opens the dialog on click, and its confirm button calls the action', async () => {
    render(
      <ConfirmProvider>
        <InsuranceTool
          orgName="Dream Dental"
          recent={[]}
          carriers={[]}
          patientOptions={[]}
          timeZone="America/Chicago"
          prefill={null}
          initialCheck={null}
          driver="sandbox"
          canManage
        />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByText('Turn off insurance checks'))
    // The dialog itself must render — this is the line the deadlock failed.
    const title = await screen.findByText('Turn off insurance checks?')
    expect(title).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    await waitFor(() => expect(disableInsuranceAction).toHaveBeenCalledTimes(1))
  })
})
