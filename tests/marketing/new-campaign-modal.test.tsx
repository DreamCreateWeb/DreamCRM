import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The "+ New campaign" modal (campaigns phase 1, 2026-07-21): the old
 * decorative Type <select> is gone; the "Start from" picker is REAL —
 * Blank + system/custom templates, and the picked templateId flows into
 * createCampaignAction (which seeds content server-side). prefill_template
 * from the outreach queue preselects + auto-opens.
 */

const createCampaignAction = vi.fn(async (_input: unknown) => {})
vi.mock('@/app/(default)/marketing/actions', () => ({
  createCampaignAction: (input: unknown) => createCampaignAction(input),
}))

import NewCampaignButton, { type TemplateOption } from '@/app/(default)/growth/campaigns/new-campaign-button'

const TEMPLATES: TemplateOption[] = [
  { id: 9, name: 'Reactivation — come back for a cleaning', description: 'For patients 6+ months out.', subject: 'Has it been a minute?', kind: 'system' },
  { id: 12, name: 'Spring whitening special', description: null, subject: 'Brighten up for spring', kind: 'custom' },
]

beforeEach(() => createCampaignAction.mockClear())

describe('NewCampaignButton — Start from picker', () => {
  it('offers Blank + every template, Blank selected by default', () => {
    render(<NewCampaignButton templates={TEMPLATES} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New campaign' }))
    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Blank/ })).toHaveAttribute('aria-checked', 'true')
    // Custom templates carry the "Yours" badge; system ones don't.
    expect(screen.getByRole('radio', { name: /Spring whitening special/ })).toHaveTextContent('Yours')
    expect(screen.getByRole('radio', { name: /Reactivation/ })).not.toHaveTextContent('Yours')
  })

  it('passes the picked templateId to the action and falls back to its name', async () => {
    render(<NewCampaignButton templates={TEMPLATES} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New campaign' }))
    fireEvent.click(screen.getByRole('radio', { name: /Reactivation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createCampaignAction).toHaveBeenCalledTimes(1))
    expect(createCampaignAction).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 9, name: 'Reactivation — come back for a cleaning' }),
    )
  })

  it('creates blank with no templateId when Blank stays selected', async () => {
    render(<NewCampaignButton templates={TEMPLATES} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New campaign' }))
    fireEvent.change(screen.getByPlaceholderText(/Holiday hours/), { target: { value: 'My blast' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createCampaignAction).toHaveBeenCalledTimes(1))
    const arg = createCampaignAction.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.name).toBe('My blast')
    expect(arg).not.toHaveProperty('templateId')
  })

  it('prefill_template auto-opens the modal with that template preselected (queue CTA)', () => {
    render(<NewCampaignButton templates={TEMPLATES} prefillAudienceId={42} prefillTemplateId={9} />)
    // Auto-opened — no click needed.
    expect(screen.getByRole('radio', { name: /Reactivation/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('hides the picker entirely when no templates exist (platform tenant)', () => {
    render(<NewCampaignButton templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New campaign' }))
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText('Name (internal)')).toBeInTheDocument()
  })

  it('offers a "To" audience picker and passes the chosen audienceId', async () => {
    const AUDIENCES = [
      { id: 7, name: 'Recall due (6+ months)' },
      { id: 8, name: 'Birthday this month' },
    ]
    render(<NewCampaignButton templates={TEMPLATES} audiences={AUDIENCES} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New campaign' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '8' } })
    fireEvent.change(screen.getByPlaceholderText(/Holiday hours/), { target: { value: 'B-day blast' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createCampaignAction).toHaveBeenCalledTimes(1))
    expect(createCampaignAction).toHaveBeenCalledWith(
      expect.objectContaining({ audienceId: 8, name: 'B-day blast' }),
    )
  })

  it('preselects the prefilled audience in the To picker (queue CTA)', () => {
    const AUDIENCES = [{ id: 7, name: 'Recall due (6+ months)' }]
    render(<NewCampaignButton templates={TEMPLATES} audiences={AUDIENCES} prefillAudienceId={7} />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('7')
  })
})
