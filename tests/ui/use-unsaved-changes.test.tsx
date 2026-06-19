/**
 * useUnsavedChanges — guards unsaved edits. While active: beforeunload fires for
 * hard navigation, and internal anchor clicks are intercepted + routed through
 * the confirm callback (proceeding only when confirmed). Inactive = no guards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useUnsavedChanges } from '@/components/ui/use-unsaved-changes'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

function Editor({ dirty, confirmLeave }: { dirty: boolean; confirmLeave?: () => Promise<boolean> }) {
  useUnsavedChanges(dirty, confirmLeave)
  return (
    <div>
      <a href="/somewhere">internal</a>
      <a href="https://example.com">external</a>
      <a href="#anchor">hash</a>
    </div>
  )
}

function fireBeforeUnload(): boolean {
  const e = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(e)
  return e.defaultPrevented
}

beforeEach(() => push.mockClear())

describe('useUnsavedChanges', () => {
  it('prompts on hard navigation only while dirty', () => {
    const { rerender } = render(<Editor dirty />)
    expect(fireBeforeUnload()).toBe(true)
    rerender(<Editor dirty={false} />)
    expect(fireBeforeUnload()).toBe(false)
  })

  it('intercepts an internal link click and proceeds when confirmed', async () => {
    const confirmLeave = vi.fn(async () => true)
    render(<Editor dirty confirmLeave={confirmLeave} />)
    fireEvent.click(screen.getByText('internal'))
    expect(confirmLeave).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(push).toHaveBeenCalledWith('/somewhere')
  })

  it('intercepts but does NOT navigate when the user cancels', async () => {
    const confirmLeave = vi.fn(async () => false)
    render(<Editor dirty confirmLeave={confirmLeave} />)
    fireEvent.click(screen.getByText('internal'))
    expect(confirmLeave).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores external + hash links (browser/beforeunload handle those)', () => {
    const confirmLeave = vi.fn(async () => true)
    render(<Editor dirty confirmLeave={confirmLeave} />)
    fireEvent.click(screen.getByText('external'))
    fireEvent.click(screen.getByText('hash'))
    expect(confirmLeave).not.toHaveBeenCalled()
  })

  it('does nothing at all when not dirty', () => {
    const confirmLeave = vi.fn(async () => true)
    render(<Editor dirty={false} confirmLeave={confirmLeave} />)
    fireEvent.click(screen.getByText('internal'))
    expect(confirmLeave).not.toHaveBeenCalled()
    expect(fireBeforeUnload()).toBe(false)
  })
})
