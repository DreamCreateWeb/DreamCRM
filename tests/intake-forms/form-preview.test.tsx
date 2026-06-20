import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FormPreview from '@/app/(default)/intake-forms/[id]/form-preview'
import type { FormSection } from '@/lib/types/forms'

/**
 * The builder's live "what patients see" pane. It must faithfully mirror the
 * schema (titles, labels, required markers, help, options, the right control
 * per field type) but stay strictly read-only — it's a preview, never a
 * fillable form.
 */
const sections: FormSection[] = [
  {
    id: 's1',
    title: 'About you',
    description: 'Basic details',
    fields: [
      { id: 'f1', type: 'text', label: 'Full name', required: true, help: null, systemKey: null, placeholder: 'Jane Doe' },
      { id: 'f2', type: 'select', label: 'Preferred contact', required: false, help: 'How we reach you', systemKey: null, options: ['Email', 'Phone'] },
      { id: 'f3', type: 'yes_no', label: 'New patient?', required: true, help: null, systemKey: null },
    ],
  },
]

describe('FormPreview', () => {
  it('renders the patient-facing title, section, help text, and field controls', () => {
    render(<FormPreview title="New Patient Intake" description="Please fill this out" sections={sections} />)
    expect(screen.getByText('New Patient Intake')).toBeInTheDocument()
    expect(screen.getByText('Please fill this out')).toBeInTheDocument()
    expect(screen.getByText('About you')).toBeInTheDocument()
    expect(screen.getByText('How we reach you')).toBeInTheDocument()
    // The text field renders with its placeholder; the yes/no field renders both options.
    expect(screen.getByPlaceholderText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('marks the required fields (two of the three here)', () => {
    const { container } = render(<FormPreview title="T" description="" sections={sections} />)
    expect(container.querySelectorAll('span.text-rose-500')).toHaveLength(2)
  })

  it('is strictly read-only — every control is disabled', () => {
    const { container } = render(<FormPreview title="T" description="" sections={sections} />)
    const controls = container.querySelectorAll('input, select, textarea')
    expect(controls.length).toBeGreaterThan(0)
    controls.forEach((c) => expect((c as HTMLInputElement).disabled).toBe(true))
  })

  it('shows a hint instead of a form when there are no fields yet', () => {
    render(<FormPreview title="Empty" description="" sections={[]} />)
    expect(screen.getByText(/Add a question and it appears here/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
  })

  it('falls back to "Untitled form" when the title is blank', () => {
    render(<FormPreview title="" description="" sections={[]} />)
    expect(screen.getByText('Untitled form')).toBeInTheDocument()
  })
})
