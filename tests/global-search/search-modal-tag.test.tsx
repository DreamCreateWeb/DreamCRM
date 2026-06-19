/**
 * ⌘K palette → "tag a patient" sub-mode. The 🏷 Tag affordance on a patient
 * result swaps the palette body to the tag editor (PatientTagControl, mocked to
 * a marker here since it's covered by its own test) and Back returns to results.
 * Pins the modal's sub-mode wiring + that the affordance is patient-only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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
vi.mock('@/app/(default)/patients/actions', () => ({
  createFollowupAction: vi.fn(async () => ({ ok: true, followup: {} })),
}))
// PatientTagControl has its own test; here it's a marker so we can assert the
// sub-view mounted it against the right patient.
vi.mock('@/components/tags/patient-tag-control', () => ({
  default: ({ patientId }: { patientId: string }) => <div data-testid="tag-control">tags:{patientId}</div>,
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
    results: [{ id: 'page-leads', label: 'Leads', sublabel: 'Daily', href: '/leads', kind: 'page' as const }],
  },
]

beforeEach(() => {
  globalSearchAction.mockReset()
  globalSearchAction.mockResolvedValue(GROUPS)
})

describe('SearchModal — tag sub-mode', () => {
  it('shows a 🏷 Tag affordance on patient results only', async () => {
    render(<SearchModal isOpen setIsOpen={vi.fn()} />)
    await screen.findByText('Mia Hayes')
    expect(screen.getByTitle('Tag Mia')).toBeTruthy()
    expect(screen.getAllByTitle(/^Tag /)).toHaveLength(1)
  })

  it('opens the tag editor for the chosen patient and returns via Back', async () => {
    render(<SearchModal isOpen setIsOpen={vi.fn()} />)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByTitle('Tag Mia'))

    // Sub-view: heading + the (mocked) tag control bound to the patient id.
    expect(screen.getByText('Tag Mia')).toBeTruthy()
    expect(screen.getByTestId('tag-control')).toHaveTextContent('tags:pat_1')

    fireEvent.click(screen.getByRole('button', { name: /Back to results/ }))
    expect(screen.queryByTestId('tag-control')).toBeNull()
    expect(screen.getByText('Mia Hayes')).toBeTruthy()
  })
})
