/**
 * The intake form's rules card (ML-27, G3-20): the visit-type multi-select
 * (nothing ticked = every visit) + "ask again every [12] months" with the
 * copy "Returning patients get a fresh form every year". Saving sends
 * `appointmentTypeIds` (null when none ticked) + `refreshMonths` (null when
 * off) through saveFormAction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FormTemplate } from '@/lib/db/schema/clinic'

const { saveFormAction } = vi.hoisted(() => ({ saveFormAction: vi.fn(async () => ({ id: 'form_1' })) }))
vi.mock('@/app/(default)/intake-forms/actions', () => ({
  saveFormAction,
  archiveFormAction: vi.fn(),
  translateFormAction: vi.fn(),
}))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))
vi.mock('@/app/(default)/intake-forms/[id]/form-preview', () => ({ default: () => <div data-testid="preview" /> }))

import FormBuilder from '@/app/(default)/intake-forms/[id]/form-builder'

function template(over: Partial<FormTemplate> = {}): FormTemplate {
  return {
    id: 'form_1',
    organizationId: 'org_1',
    title: 'Sedation consent',
    description: null,
    slug: 'sedation-consent',
    schema: { sections: [] },
    isDefault: 0,
    autoSendAudience: 'all',
    appointmentTypeIds: null,
    refreshMonths: null,
    translations: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

const VISIT_TYPES = [
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'sedation', label: 'Sedation' },
]

beforeEach(() => {
  saveFormAction.mockClear()
})

describe('the rules card', () => {
  it('nothing ticked = every visit; ticking a visit type + turning the window on saves the rule', async () => {
    render(<FormBuilder template={template()} visitTypes={VISIT_TYPES} />)
    expect(screen.getByText(/Rides along with every visit/)).toBeInTheDocument()
    expect(screen.getByText(/Off: one form on file is enough, forever/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sedation' }))
    expect(screen.getByText('Only this visit type gets this form.')).toBeInTheDocument()

    const months = screen.getByLabelText('Ask again every') as HTMLInputElement
    expect(months.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ask returning patients for a fresh form' }))
    expect(months.disabled).toBe(false)
    expect(months.value).toBe('12')
    expect(screen.getByText(/Returning patients get a fresh form every year/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveFormAction).toHaveBeenCalledTimes(1))
    expect(saveFormAction).toHaveBeenCalledWith(
      'form_1',
      expect.objectContaining({ appointmentTypeIds: ['sedation'], refreshMonths: 12 }),
    )
  })

  it('a stored rule renders ticked + on; unticking everything and turning the window off saves null / null', async () => {
    render(<FormBuilder template={template({ appointmentTypeIds: ['sedation'], refreshMonths: 6 })} visitTypes={VISIT_TYPES} />)
    const sedation = screen.getByRole('checkbox', { name: 'Sedation' }) as HTMLInputElement
    expect(sedation.checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Cleaning' }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText('Ask again every') as HTMLInputElement).value).toBe('6')
    expect(screen.getByText(/fresh form every 6 months/)).toBeInTheDocument()

    fireEvent.click(sedation)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ask returning patients for a fresh form' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveFormAction).toHaveBeenCalledTimes(1))
    expect(saveFormAction).toHaveBeenCalledWith('form_1', expect.objectContaining({ appointmentTypeIds: null, refreshMonths: null }))
  })

  it('no visit-type catalog → the picker is hidden and nothing is targeted', () => {
    render(<FormBuilder template={template()} />)
    expect(screen.queryByText('Visit types')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Ask returning patients for a fresh form' })).toBeInTheDocument()
  })
})
