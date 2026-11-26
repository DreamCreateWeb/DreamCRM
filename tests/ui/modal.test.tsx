/**
 * The one Modal primitive: a sheet on a phone, a dialog above (one DOM, the
 * breakpoint is CSS), the same trap and the same close rules everywhere.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import Modal from '@/components/ui/modal'

function Harness({ blocking = false, onClose = () => {} }: { blocking?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      <Modal
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="Add thing"
        blocking={blocking}
        footer={<button>Save</button>}
      >
        <input aria-label="name" />
      </Modal>
    </div>
  )
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Modal open={false} onClose={() => {}} label="x">hi</Modal>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is aria-modal, labelled by its title, with a sheet handle and a scroll lock', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('opener'))
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelId = dialog.getAttribute('aria-labelledby')!
    expect(document.getElementById(labelId)!.textContent).toBe('Add thing')
    expect(dialog.querySelector('[data-modal-handle]')).toBeTruthy()
    expect(dialog.className).toContain('sm:max-w-md')
    expect(dialog.className).toContain('max-h-[85dvh]')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('moves focus in on open and back to the opener on close; unlocks the page', () => {
    render(<Harness />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('closes on Escape, a backdrop tap and the X', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.click(document.querySelector('[data-modal-backdrop]')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('a tap inside the panel does not close it', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.click(screen.getByLabelText('name'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('blocking refuses Escape, the backdrop and the X', () => {
    const onClose = vi.fn()
    render(<Harness blocking onClose={onClose} />)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('[data-modal-backdrop]')!)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('backdropClose={false} ignores the backdrop but still honours Escape', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} label="m" backdropClose={false}>x</Modal>)
    fireEvent.click(document.querySelector('[data-modal-backdrop]')!)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('names the dialog from labelledBy or label when there is no title', () => {
    const { unmount } = render(<Modal open onClose={() => {}} label="Plain label">x</Modal>)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Plain label')
    unmount()
    render(<Modal open onClose={() => {}} labelledBy="h"><h2 id="h">Own heading</h2></Modal>)
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('h')
  })

  it('stacked modals share one scroll lock that outlives the inner one', () => {
    const { rerender } = render(
      <>
        <Modal open onClose={() => {}} label="a">a</Modal>
        <Modal open onClose={() => {}} label="b">b</Modal>
      </>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    rerender(
      <>
        <Modal open onClose={() => {}} label="a">a</Modal>
        <Modal open={false} onClose={() => {}} label="b">b</Modal>
      </>,
    )
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('a card keeps every class it had before `screen` existed', () => {
    const { unmount } = render(<Modal open onClose={() => {}} label="card">x</Modal>)
    const dialog = screen.getByRole('dialog')
    for (const card of ['max-h-[85dvh]', 'sm:max-h-[90dvh]', 'rounded-t-[var(--r-lg)]', 'sm:rounded-[var(--r-lg)]', 'shadow-[var(--shadow-modal)]', 'bg-[color:var(--color-surface-2)]', 'pb-[env(safe-area-inset-bottom)]', 'sm:pb-0', 'sm:max-w-md', 'overflow-y-auto']) {
      expect(dialog.className, card).toContain(card)
    }
    expect(dialog.className).not.toContain('h-[100dvh]')
    expect(dialog.querySelector('[data-modal-handle]')).not.toBeNull()
    unmount()
  })

  it('at `screen` it is the whole viewport on the page canvas — same trap, same lock, same Escape; no sheet handle, no corner radius', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <Modal open onClose={onClose} size="screen" label="On the big screen" backdropClose={false}>
        <button>Done</button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'On the big screen' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // The surface is CHOSEN, never overridden: the card's cap, radius, shadow
    // and fill are simply not there. (The first cut laid `max-h-none` over
    // `max-h-[85dvh]` and let the class merger referee — it does not know
    // `dvh`, so both shipped and the stylesheet's order decided.)
    expect(dialog.className).toContain('h-[100dvh]')
    expect(dialog.className).toContain('bg-[color:var(--color-canvas)]')
    for (const card of ['max-h-[85dvh]', 'sm:max-h-[90dvh]', 'rounded-t-[var(--r-lg)]', 'shadow-[var(--shadow-modal)]', 'bg-[color:var(--color-surface-2)]']) {
      expect(dialog.className, card).not.toContain(card)
    }
    expect(dialog.querySelector('[data-modal-handle]')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    // There is no backdrop to tap; Escape is still a way out.
    fireEvent.click(dialog.parentElement!)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })
})
