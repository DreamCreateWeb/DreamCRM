import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { Toggle } from '@/components/ui/toggle'

/** The one canonical on/off switch (replaces the hand-rolled toggles). */

beforeEach(() => cleanup())

describe('Toggle', () => {
  it('is a switch reflecting checked state + accessible name', () => {
    render(<Toggle checked onChange={() => {}} srLabel="Reminders" />)
    const sw = screen.getByRole('switch', { name: 'Reminders' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('calls onChange with the FLIPPED value on click', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Toggle checked={false} onChange={onChange} srLabel="X" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)

    rerender(<Toggle checked onChange={onChange} srLabel="X" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('does not fire when disabled', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} disabled srLabel="X" />)
    const sw = screen.getByRole('switch') as HTMLButtonElement
    expect(sw.disabled).toBe(true)
    fireEvent.click(sw)
    expect(onChange).not.toHaveBeenCalled()
  })
})
