import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Composer from '@/app/(default)/growth/social/composer'
import type { ComposerChannel } from '@/lib/types/zernio'

/**
 * The post widget (2026-07-20 composer-widget pass): the old form sprawl
 * collapsed into one compact card — a single text field, an emoji drawer, an
 * image button, a schedule toggle, a Google-options drawer, and a channels
 * dropdown. These tests pin the widget's anatomy AND that no capability was
 * lost in the collapse (GBP types/CTA/event/offer, scheduling, submit rules).
 */

const createSocialPostAction = vi.fn(async () => ({ ok: true as const, status: 'published' as const }))
vi.mock('@/app/(default)/growth/social/actions', () => ({
  createSocialPostAction: (...args: unknown[]) => createSocialPostAction(...(args as [])),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/upload-with-progress', () => ({
  UploadCancelledError: class extends Error {},
  uploadFileWithProgress: vi.fn(() => ({ promise: new Promise(() => {}), cancel: vi.fn() })),
}))

const CHANNELS: ComposerChannel[] = [
  { accountId: 'acc_gbp', platform: 'googlebusiness', label: 'Google Business', icon: '📍', handle: 'Dream Dental' },
  { accountId: 'acc_ig', platform: 'instagram', label: 'Instagram', icon: '📸', handle: '@dreamdental' },
  { accountId: 'acc_fb', platform: 'facebook', label: 'Facebook', icon: '👥', handle: 'Dream Dental' },
]

function renderComposer(channels: ComposerChannel[] = CHANNELS) {
  return render(<Composer channels={channels} bookUrl="https://acme.example/book" clinicName="Dream Dental" />)
}

beforeEach(() => {
  createSocialPostAction.mockClear()
})

describe('Composer widget anatomy', () => {
  it('renders one text field + the toolbar (emoji, image, schedule) + channels dropdown', () => {
    renderComposer()
    expect(screen.getByLabelText('Post text')).toBeInTheDocument()
    expect(screen.getByLabelText('Add an emoji')).toBeInTheDocument()
    expect(screen.getByLabelText('Attach a photo or video')).toBeInTheDocument()
    expect(screen.getByLabelText('Schedule for later')).toBeInTheDocument()
    // All channels selected by default — the dropdown face says so.
    expect(screen.getByRole('button', { name: /choose channels/i })).toHaveTextContent('All channels')
  })

  it('does NOT sprawl: GBP fields stay hidden until the Google-options drawer opens', () => {
    renderComposer()
    expect(screen.queryByRole('group', { name: 'Post type' })).not.toBeInTheDocument()
    expect(screen.queryByText('Button (Google only, optional)')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Google options' }))
    expect(screen.getByRole('group', { name: 'Post type' })).toBeInTheDocument()
    expect(screen.getByText('Button (Google only, optional)')).toBeInTheDocument()
  })

  it('hides the Google-options button entirely when no Google channel is targeted', () => {
    renderComposer(CHANNELS.filter((c) => c.platform !== 'googlebusiness'))
    expect(screen.queryByRole('button', { name: 'Google options' })).not.toBeInTheDocument()
  })
})

describe('Emoji drawer', () => {
  it('opens on the toolbar button and inserts the picked emoji into the text', async () => {
    renderComposer()
    const textarea = screen.getByLabelText('Post text') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Smile day' } })
    fireEvent.click(screen.getByLabelText('Add an emoji'))
    const drawer = screen.getByRole('dialog', { name: 'Emoji picker' })
    expect(drawer).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '🦷' }))
    await waitFor(() => expect(textarea.value).toContain('🦷'))
    // Picking closes the drawer (calm, one-at-a-time).
    expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).not.toBeInTheDocument()
  })
})

describe('Channels dropdown', () => {
  it('toggles channels in the popover and the face label follows', () => {
    renderComposer()
    fireEvent.click(screen.getByRole('button', { name: /choose channels/i }))
    const popover = screen.getByRole('dialog', { name: 'Choose channels' })
    expect(popover).toBeInTheDocument()
    const ig = screen.getByRole('button', { name: /instagram/i })
    expect(ig).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(ig)
    expect(ig).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /choose channels/i })).toHaveTextContent('2 of 3 channels')
  })

  it('blocks submit when every channel is deselected', () => {
    renderComposer([CHANNELS[1]])
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'Hello!' } })
    fireEvent.click(screen.getByRole('button', { name: /choose channels/i }))
    fireEvent.click(screen.getByRole('button', { name: /instagram/i }))
    expect(screen.getByRole('button', { name: /choose channels/i })).toHaveTextContent('Pick channels')
    expect(screen.getByRole('button', { name: 'Post now' })).toBeDisabled()
  })
})

describe('Schedule toggle', () => {
  it('reveals the time field and flips the submit label', () => {
    renderComposer()
    expect(screen.queryByLabelText('Schedule time')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Schedule for later'))
    expect(screen.getByLabelText('Schedule time')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schedule post' })).toBeInTheDocument()
  })
})

describe('Submit', () => {
  it('stays disabled with empty text, enables with text, and sends the full input', async () => {
    renderComposer()
    const post = screen.getByRole('button', { name: /post to 3 channels/i })
    expect(post).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'Same-week openings!' } })
    expect(post).toBeEnabled()
    fireEvent.click(post)
    await waitFor(() => expect(createSocialPostAction).toHaveBeenCalledTimes(1))
    expect(createSocialPostAction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountIds: ['acc_gbp', 'acc_ig', 'acc_fb'],
        summary: 'Same-week openings!',
        postType: 'standard',
        scheduledAt: null,
      }),
    )
    await waitFor(() => expect(screen.getByText(/Posted to your channels/i)).toBeInTheDocument())
  })

  it('keeps the GBP capabilities: offer type + coupon flow through the drawer', async () => {
    renderComposer()
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'Whitening special' } })
    fireEvent.click(screen.getByRole('button', { name: 'Google options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Offer' }))
    fireEvent.change(screen.getByPlaceholderText('SMILE99'), { target: { value: 'BRIGHT25' } })
    fireEvent.click(screen.getByRole('button', { name: /post to 3 channels/i }))
    await waitFor(() => expect(createSocialPostAction).toHaveBeenCalledTimes(1))
    expect(createSocialPostAction).toHaveBeenCalledWith(
      expect.objectContaining({ postType: 'offer', offerCouponCode: 'BRIGHT25' }),
    )
  })
})
