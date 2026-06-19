/**
 * useFocusTrap — the a11y core for hand-rolled overlays. Verifies the
 * deterministic behaviors: initial focus into the overlay, Tab/Shift+Tab cycling
 * at the boundaries, focus restoration to the opener on close, and Escape.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRef, useState } from 'react'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

function Modal({ onEscape, initialFocus }: { onEscape?: () => void; initialFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(true, ref, { onEscape, initialFocus })
  return (
    <div ref={ref} role="dialog">
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  )
}

function Harness({ initialFocus, onEscape }: { initialFocus?: boolean; onEscape?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && <Modal onEscape={onEscape} initialFocus={initialFocus} />}
      <button onClick={() => setOpen(false)}>close</button>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('moves focus into the overlay on open (first focusable)', () => {
    render(<Modal />)
    expect((document.activeElement as HTMLElement).textContent).toBe('first')
  })

  it('does not steal focus when initialFocus is false', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    render(<Modal initialFocus={false} />)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('cycles Tab from the last element back to the first', () => {
    render(<Modal />)
    const last = screen.getByText('last')
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect((document.activeElement as HTMLElement).textContent).toBe('first')
  })

  it('cycles Shift+Tab from the first element to the last', () => {
    render(<Modal />)
    screen.getByText('first').focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect((document.activeElement as HTMLElement).textContent).toBe('last')
  })

  it('calls onEscape on Escape (only when provided)', () => {
    const onEscape = vi.fn()
    render(<Modal onEscape={onEscape} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the opener when the overlay closes', () => {
    render(<Harness />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener) // opens — focus moves into the modal
    expect((document.activeElement as HTMLElement).textContent).toBe('first')
    fireEvent.click(screen.getByText('close')) // unmounts the modal
    expect(document.activeElement).toBe(opener)
  })
})
