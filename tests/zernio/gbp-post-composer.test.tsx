import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const createAction = vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 'published' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(default)/google-posts/actions', () => ({
  createGbpPostAction: (...a: unknown[]) => createAction(...a),
  deleteGbpPostAction: vi.fn(async () => ({ ok: true })),
}))
// The composer imports the XHR upload helper at module load.
vi.mock('@/lib/upload-with-progress', () => ({
  uploadFileWithProgress: vi.fn(() => ({ promise: Promise.resolve('https://s3/x.jpg'), cancel: vi.fn() })),
  UploadCancelledError: class extends Error {},
}))

import PostComposer from '@/app/(default)/google-posts/post-composer'

beforeEach(() => {
  createAction.mockClear()
})

describe('PostComposer', () => {
  it('renders the three post-type pills + a char counter starting at 1500', () => {
    render(<PostComposer bookUrl="https://clinic/book" />)
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Offer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Event' })).toBeTruthy()
    expect(screen.getByText('1500')).toBeTruthy()
  })

  it('decrements the char counter as you type', () => {
    render(<PostComposer bookUrl={null} />)
    const textarea = screen.getByLabelText('Post text')
    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(screen.getByText('1495')).toBeTruthy()
  })

  it('reveals Event fields only when Event is selected', () => {
    render(<PostComposer bookUrl={null} />)
    expect(screen.queryByText('Event title')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Event' }))
    expect(screen.getByText('Event title')).toBeTruthy()
    expect(screen.getByText('Starts')).toBeTruthy()
  })

  it('reveals Offer fields only when Offer is selected', () => {
    render(<PostComposer bookUrl={null} />)
    expect(screen.queryByText('Coupon code (optional)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Offer' }))
    expect(screen.getByText('Coupon code (optional)')).toBeTruthy()
  })

  it('defaults the Book CTA URL to the clinic /book link', () => {
    render(<PostComposer bookUrl="https://clinic/book" />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'BOOK' } })
    const urlInput = screen.getByPlaceholderText('https://…') as HTMLInputElement
    expect(urlInput.value).toBe('https://clinic/book')
  })

  it('CALL CTA shows the listing-phone note and no URL field', () => {
    render(<PostComposer bookUrl={null} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'CALL' } })
    expect(screen.getByText(/listing.s phone number/i)).toBeTruthy()
    expect(screen.queryByText('Button link')).toBeNull()
  })

  it('submits the composed post via the gated action', async () => {
    render(<PostComposer bookUrl={null} />)
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'Same-week cleanings' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post to Google' }))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    const arg = createAction.mock.calls[0][0] as { summary: string; postType: string }
    expect(arg.summary).toBe('Same-week cleanings')
    expect(arg.postType).toBe('standard')
    await screen.findByText('Posted to Google.')
  })

  it('the primary button reads "Schedule" once schedule-for-later is on', () => {
    render(<PostComposer bookUrl={null} />)
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByLabelText('Schedule for later'))
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy()
  })
})
