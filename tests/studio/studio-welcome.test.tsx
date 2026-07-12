import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StudioWelcome from '@/app/(default)/website/editor/studio-welcome'

const SEEN_KEY = 'dc-studio-welcome-done'

beforeEach(() => {
  window.localStorage.removeItem(SEEN_KEY)
})

describe('StudioWelcome', () => {
  it('shows once on first open with the three editing moves + phone tip', () => {
    render(<StudioWelcome />)
    expect(screen.getByRole('dialog', { name: /Welcome to the Website Studio/i })).toBeInTheDocument()
    expect(screen.getByText('Click any text to edit it')).toBeInTheDocument()
    expect(screen.getByText(/Hover a section/)).toBeInTheDocument()
    expect(screen.getByText('Or just ask the AI')).toBeInTheDocument()
    expect(screen.getByText('Check the phone view')).toBeInTheDocument()
  })

  it('dismiss persists — a second mount renders nothing', () => {
    const first = render(<StudioWelcome />)
    fireEvent.click(screen.getByRole('button', { name: /Start editing/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    first.unmount()

    render(<StudioWelcome />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('ESC dismisses and persists too', () => {
    render(<StudioWelcome />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('renders nothing when already seen', () => {
    window.localStorage.setItem(SEEN_KEY, '1')
    render(<StudioWelcome />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
