import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * The public form runner honors a field's `visibleWhen` — a conditional field
 * stays hidden until its trigger is satisfied, and the new field types
 * (number, instructions, photo, insurance card) render.
 */

vi.mock('@/lib/upload-with-progress', () => ({
  uploadFileWithProgress: () => ({ promise: Promise.resolve('https://cdn/x.jpg'), cancel: () => {} }),
}))

import IntakeFormRunner from '@/app/site/[slug]/intake/[formSlug]/intake-form-runner'
import type { FormTemplateSchema } from '@/lib/types/forms'

const schema: FormTemplateSchema = {
  sections: [
    {
      id: 's1',
      title: 'Medical',
      fields: [
        { id: 'note', type: 'content', label: 'Heads up', required: false, body: 'Please answer honestly.' },
        { id: 'age', type: 'number', label: 'Age', required: false },
        { id: 'allergic', type: 'yes_no', label: 'Any allergies?', required: false },
        {
          id: 'allergy_detail',
          type: 'textarea',
          label: 'What are you allergic to?',
          required: false,
          visibleWhen: { fieldId: 'allergic', op: 'equals', value: 'true' },
        },
        { id: 'card', type: 'insurance_card', label: 'Insurance card', required: false },
        { id: 'photo', type: 'file', label: 'A photo', required: false, imagesOnly: true, maxFiles: 1 },
      ],
    },
  ],
}

function renderRunner() {
  return render(
    <IntakeFormRunner
      orgId="org_1"
      templateId="tpl_1"
      schema={schema}
      brand="#2A7F8C"
      clinicName="Dream Dental"
      action={vi.fn(async () => {})}
    />,
  )
}

describe('IntakeFormRunner — new types + conditional', () => {
  it('renders the content block, number, and upload fields', () => {
    renderRunner()
    expect(screen.getByText('Please answer honestly.')).toBeInTheDocument()
    expect(screen.getByText('Age')).toBeInTheDocument()
    // Insurance card front/back capture buttons.
    expect(screen.getByText(/Front of card/)).toBeInTheDocument()
    expect(screen.getByText(/Back of card/)).toBeInTheDocument()
  })

  it('hides a conditional field until its trigger is met, then reveals it', () => {
    renderRunner()
    // Hidden initially (allergic not answered).
    expect(screen.queryByText('What are you allergic to?')).not.toBeInTheDocument()
    // Answer "Yes" to the trigger.
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByText('What are you allergic to?')).toBeInTheDocument()
    // Switch to "No" → hidden again.
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.queryByText('What are you allergic to?')).not.toBeInTheDocument()
  })
})
