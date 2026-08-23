import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import RunwaySection, { type RunwayRowData } from '@/app/(default)/dream-team/runway-section'

const { mockStop } = vi.hoisted(() => ({
  mockStop: vi.fn(async (..._a: unknown[]) => ({ ok: true, message: 'Stopped — the post won’t go out.' })),
}))
vi.mock('@/app/(default)/dream-team/actions', () => ({ stopRunwayItemAction: mockStop }))
vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  useRouter: () => ({ refresh: vi.fn() }),
}))

function wrap(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </ToastProvider>,
  )
}

function item(over: Partial<RunwayRowData> = {}): RunwayRowData {
  return {
    kind: 'blog',
    id: 'b1',
    excerpt: 'Five gentle truths about flossing',
    destination: 'your blog',
    goesOutLabel: 'Tue, Aug 25, 10:00 AM',
    ...over,
  }
}

describe('the veto runway ("Going out soon")', () => {
  it('renders nothing when the queue is empty — an empty runway is a fact, not a surface', () => {
    const { container } = wrap(<RunwaySection items={[]} />)
    expect(container.querySelector('section')).toBeNull()
  })

  it('names each piece, where it lands, and WHEN — the go-time is the whole veto window', () => {
    wrap(<RunwaySection items={[item()]} />)
    expect(screen.getByText('Going out soon')).toBeInTheDocument()
    expect(screen.getByText('Five gentle truths about flossing')).toBeInTheDocument()
    expect(screen.getByText(/goes out Tue, Aug 25, 10:00 AM/)).toBeInTheDocument()
  })

  it('a BLOG stop needs no confirm (the article returns to drafts) and the row leaves the queue', async () => {
    wrap(<RunwaySection items={[item()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(mockStop).toHaveBeenCalledWith({ kind: 'blog', id: 'b1' }))
    await waitFor(() =>
      expect(screen.queryByText('Five gentle truths about flossing')).not.toBeInTheDocument(),
    )
  })

  it('a SOCIAL stop confirms first — the draft is discarded, and the copy says so', async () => {
    wrap(<RunwaySection items={[item({ kind: 'social', id: 's1', destination: 'Instagram' })]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    // The confirm dialog interposes; nothing stopped yet.
    expect(await screen.findByText('Stop this post?')).toBeInTheDocument()
    expect(mockStop).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop it' }))
    await waitFor(() => expect(mockStop).toHaveBeenCalledWith({ kind: 'social', id: 's1' }))
  })

  it('a failed stop keeps the row and reports urgently — silently keeping the send would break the veto promise', async () => {
    mockStop.mockResolvedValueOnce({ ok: false, message: 'That item is no longer queued.' })
    wrap(<RunwaySection items={[item()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(mockStop).toHaveBeenCalled())
    expect(screen.getByText('Five gentle truths about flossing')).toBeInTheDocument()
  })
})
