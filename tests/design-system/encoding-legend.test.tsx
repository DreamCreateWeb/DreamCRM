import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EncodingLegend } from '@/components/ui/encoding-legend'

describe('EncodingLegend', () => {
  it('renders nothing when there is nothing to explain', () => {
    const { container } = render(<EncodingLegend />)
    expect(container.innerHTML).toBe('')
  })

  it('shows a Key button and opens the legend on click', () => {
    render(<EncodingLegend glyphs={['newPatient', 'balance']} />)
    const button = screen.getByRole('button', { name: /key/i })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(button)
    expect(screen.getByRole('dialog', { name: /what the colors and icons mean/i })).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('explains each declared glyph with label and what-to-do copy', () => {
    render(<EncodingLegend glyphs={['unconfirmed48h']} />)
    fireEvent.click(screen.getByRole('button', { name: /key/i }))
    expect(screen.getByText('Unconfirmed appointment in next 48h')).toBeInTheDocument()
    expect(screen.getByText(/send a reminder or call/i)).toBeInTheDocument()
  })

  it('explains the aging colors from the preset', () => {
    render(<EncodingLegend aging="leads" />)
    fireEvent.click(screen.getByRole('button', { name: /key/i }))
    expect(screen.getByText(/how long a new lead has waited/i)).toBeInTheDocument()
    expect(screen.getByText('Fresh')).toBeInTheDocument()
    expect(screen.getByText(/call now, conversion is highest/i)).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('explains status pills with their meanings', () => {
    render(
      <EncodingLegend
        pills={[
          { tone: 'warn', label: 'Unconfirmed', meaning: 'Needs a confirmation text' },
          { tone: 'ok', label: 'Confirmed', meaning: 'They said they are coming' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /key/i }))
    expect(screen.getByText('Unconfirmed')).toBeInTheDocument()
    expect(screen.getByText('Needs a confirmation text')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  it('documents channels in their own (non-status) section', () => {
    render(
      <EncodingLegend
        aging="messages"
        channels={[
          { icon: '✉️', label: 'Email', meaning: 'Message sent by email' },
          { icon: '📱', label: 'SMS', meaning: 'Message sent by text' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /key/i }))
    expect(screen.getByText('Channels')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Message sent by email')).toBeInTheDocument()
    expect(screen.getByText('SMS')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<EncodingLegend glyphs={['newPatient']} />)
    fireEvent.click(screen.getByRole('button', { name: /key/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
