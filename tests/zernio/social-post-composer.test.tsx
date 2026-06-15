import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const createAction = vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 'published' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(default)/social-posts/actions', () => ({
  createSocialPostAction: (...a: unknown[]) => createAction(...a),
  deleteSocialPostAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/upload-with-progress', () => ({
  uploadFileWithProgress: vi.fn(() => ({ promise: Promise.resolve('https://s3/x.jpg'), cancel: vi.fn() })),
  UploadCancelledError: class extends Error {},
}))

import Composer from '@/app/(default)/social-posts/composer'
import type { ComposerChannel } from '@/lib/types/zernio'

const GBP: ComposerChannel = { accountId: 'a_gbp', platform: 'googlebusiness', label: 'Google Business Profile', icon: '📍', handle: 'dream' }
const IG: ComposerChannel = { accountId: 'a_ig', platform: 'instagram', label: 'Instagram', icon: '📸', handle: '@dream' }
const FB: ComposerChannel = { accountId: 'a_fb', platform: 'facebook', label: 'Facebook', icon: '📘', handle: 'Dream' }

beforeEach(() => createAction.mockClear())

describe('Composer — channel picker', () => {
  it('renders a button per connected channel', () => {
    render(<Composer channels={[GBP, IG, FB]} bookUrl={null} />)
    expect(screen.getByRole('button', { name: /Google Business Profile/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Instagram/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Facebook/ })).toBeTruthy()
  })

  it('all channels start selected (aria-pressed)', () => {
    render(<Composer channels={[GBP, IG]} bookUrl={null} />)
    expect(screen.getByRole('button', { name: /Instagram/ }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Composer — GBP options are conditional on a GBP target', () => {
  it('shows the post-type selector + CTA picker when GBP is selected', () => {
    render(<Composer channels={[GBP, IG]} bookUrl={null} />)
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Offer' })).toBeTruthy()
    expect(screen.getByText(/Button \(Google only/)).toBeTruthy()
  })

  it('HIDES the GBP options when only social channels are selected', () => {
    render(<Composer channels={[GBP, IG]} bookUrl={null} />)
    // Deselect Google Business.
    fireEvent.click(screen.getByRole('button', { name: /Google Business Profile/ }))
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull()
    expect(screen.queryByText(/Button \(Google only/)).toBeNull()
  })

  it('reveals Event fields only when GBP + Event are selected', () => {
    render(<Composer channels={[GBP]} bookUrl={null} />)
    expect(screen.queryByText('Event title')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Event' }))
    expect(screen.getByText('Event title')).toBeTruthy()
  })

  it('defaults the Book CTA URL to the clinic /book link', () => {
    render(<Composer channels={[GBP]} bookUrl="https://clinic/book" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'BOOK' } })
    const urlInput = screen.getByPlaceholderText('https://…') as HTMLInputElement
    expect(urlInput.value).toBe('https://clinic/book')
  })
})

describe('Composer — per-platform hint + counter', () => {
  it('shows the "same text / tightest limit" note when multiple channels are picked', () => {
    render(<Composer channels={[GBP, IG]} bookUrl={null} />)
    expect(screen.getByText(/tightest limit \(1500\)/)).toBeTruthy()
  })

  it('counter starts at the GBP cap (1500) when GBP is targeted', () => {
    render(<Composer channels={[GBP, IG]} bookUrl={null} />)
    expect(screen.getByText('1500')).toBeTruthy()
  })

  it('counter rises to the social ceiling (2200) when GBP is deselected', () => {
    render(<Composer channels={[GBP, IG]} bookUrl={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Google Business Profile/ }))
    expect(screen.getByText('2200')).toBeTruthy()
  })
})

describe('Composer — submit', () => {
  it('submits the composed post with the selected account ids', async () => {
    render(<Composer channels={[GBP, IG]} bookUrl={null} />)
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'Same-week cleanings' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post now' }))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    const arg = createAction.mock.calls[0][0] as { summary: string; accountIds: string[] }
    expect(arg.summary).toBe('Same-week cleanings')
    expect(arg.accountIds.sort()).toEqual(['a_gbp', 'a_ig'])
    await screen.findByText('Posted to your channels.')
  })

  it('the primary button reads "Schedule" once schedule-for-later is on', () => {
    render(<Composer channels={[IG]} bookUrl={null} />)
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByLabelText('Schedule for later'))
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy()
  })
})
