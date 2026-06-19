import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from '@/components/ui/editor-kit'

describe('Field — label association (a11y)', () => {
  it('auto-associates the label with a single wrapped control', () => {
    // getByLabelText only matches when the <label> is programmatically tied to
    // the input — previously the label was visual-only.
    render(
      <Field label="Display name">
        <input type="text" defaultValue="" />
      </Field>,
    )
    expect(screen.getByLabelText('Display name')).toBeInstanceOf(HTMLInputElement)
  })

  it('associates select + textarea controls too', () => {
    const { rerender } = render(
      <Field label="State">
        <select>
          <option>CA</option>
        </select>
      </Field>,
    )
    expect(screen.getByLabelText('State').tagName).toBe('SELECT')
    rerender(
      <Field label="Notes">
        <textarea />
      </Field>,
    )
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA')
  })

  it('respects an explicit htmlFor over the auto id', () => {
    render(
      <Field label="Email" htmlFor="email-x">
        <input id="email-x" type="email" />
      </Field>,
    )
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
  })

  it('never clobbers a child that already has an id', () => {
    render(
      <Field label="Phone">
        <input id="my-phone" type="tel" />
      </Field>,
    )
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'my-phone')
  })
})
