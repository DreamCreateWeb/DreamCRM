import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

/**
 * Design v2 global keyboard map (KeyboardShortcuts, DESIGN-SYSTEM.md Part 4):
 *   [            toggle the rail
 *   ⌘1/2/3       navigate the pinned cockpit paths
 *   C            dispatch dc:quick-create (open the header menu)
 *   G then P/A/L go-to chord (500ms window)
 * Never fires while focus is in a text field / contenteditable, or a modal is
 * open. ⌘K is owned elsewhere and must pass through untouched.
 */

const push = vi.fn()
const toggleRail = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))
vi.mock('@/app/app-provider', () => ({
  useAppProvider: () => ({ toggleRail }),
}))

import KeyboardShortcuts from '@/components/ui/keyboard-shortcuts'

const COCKPIT = ['/dashboard', '/messages', '/appointments']

beforeEach(() => {
  push.mockReset()
  toggleRail.mockReset()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function mount() {
  render(<KeyboardShortcuts cockpitPaths={COCKPIT} />)
}

describe('KeyboardShortcuts — cockpit + rail + create', () => {
  it('[ toggles the rail', () => {
    mount()
    fireEvent.keyDown(window, { key: '[' })
    expect(toggleRail).toHaveBeenCalledTimes(1)
  })

  it('⌘1 / ⌘2 / ⌘3 navigate the pinned cockpit paths in order', () => {
    mount()
    fireEvent.keyDown(window, { key: '1', metaKey: true })
    fireEvent.keyDown(window, { key: '2', metaKey: true })
    fireEvent.keyDown(window, { key: '3', metaKey: true })
    expect(push).toHaveBeenNthCalledWith(1, '/dashboard')
    expect(push).toHaveBeenNthCalledWith(2, '/messages')
    expect(push).toHaveBeenNthCalledWith(3, '/appointments')
  })

  it('Ctrl+1 also works (non-mac)', () => {
    mount()
    fireEvent.keyDown(window, { key: '1', ctrlKey: true })
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('C dispatches the dc:quick-create event', () => {
    const onCreate = vi.fn()
    window.addEventListener('dc:quick-create', onCreate)
    mount()
    fireEvent.keyDown(window, { key: 'c' })
    expect(onCreate).toHaveBeenCalledTimes(1)
    window.removeEventListener('dc:quick-create', onCreate)
  })

  it('plain 1/2/3 (no modifier) do NOT navigate — left free for page use', () => {
    mount()
    fireEvent.keyDown(window, { key: '1' })
    expect(push).not.toHaveBeenCalled()
  })

  it('⌘K is left alone (owned by the palette)', () => {
    mount()
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })
    window.dispatchEvent(e)
    expect(push).not.toHaveBeenCalled()
    expect(toggleRail).not.toHaveBeenCalled()
  })
})

describe('KeyboardShortcuts — G→P/A/L chord', () => {
  it('G then P navigates to /patients', () => {
    mount()
    fireEvent.keyDown(window, { key: 'g' })
    fireEvent.keyDown(window, { key: 'p' })
    expect(push).toHaveBeenCalledWith('/patients')
  })

  it('G then A → /appointments, G then L → /leads', () => {
    mount()
    fireEvent.keyDown(window, { key: 'g' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(push).toHaveBeenLastCalledWith('/appointments')
    fireEvent.keyDown(window, { key: 'g' })
    fireEvent.keyDown(window, { key: 'l' })
    expect(push).toHaveBeenLastCalledWith('/leads')
  })

  it('the chord expires after the 500ms window', () => {
    mount()
    fireEvent.keyDown(window, { key: 'g' })
    vi.advanceTimersByTime(600)
    fireEvent.keyDown(window, { key: 'p' })
    expect(push).not.toHaveBeenCalled()
  })

  it('G then an unrelated key does nothing (and clears the chord)', () => {
    mount()
    fireEvent.keyDown(window, { key: 'g' })
    fireEvent.keyDown(window, { key: 'x' })
    expect(push).not.toHaveBeenCalled()
  })
})

describe('KeyboardShortcuts — input + modal guards', () => {
  it('does not fire while focus is in an <input>', () => {
    mount()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: '[' })
    fireEvent.keyDown(input, { key: 'c' })
    fireEvent.keyDown(input, { key: '1', metaKey: true })
    expect(toggleRail).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    input.remove()
  })

  it('does not fire while focus is in a <textarea>', () => {
    mount()
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()
    fireEvent.keyDown(ta, { key: '[' })
    expect(toggleRail).not.toHaveBeenCalled()
    ta.remove()
  })

  it('does not fire in a contenteditable region', () => {
    mount()
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    document.body.appendChild(div)
    div.focus()
    // happy-dom may not flip isContentEditable from the attribute alone; force it.
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true })
    fireEvent.keyDown(div, { key: '[' })
    expect(toggleRail).not.toHaveBeenCalled()
    div.remove()
  })

  it('does not fire while a modal is open (aria-modal present)', () => {
    mount()
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.appendChild(modal)
    fireEvent.keyDown(window, { key: '[' })
    fireEvent.keyDown(window, { key: '1', metaKey: true })
    expect(toggleRail).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    modal.remove()
  })
})
