import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Feedback settings — the submit form writes a REAL topic to feedback.category
 * (was hardcoded 'nps'), keeps the 1–5 NPS score optional, char-counts the
 * message to 4000; the platform-admin inbox renders the category as a neutral
 * pill and filters by it.
 */

const sendFeedback = vi.fn<(input: Record<string, unknown>) => Promise<{ id: number }>>(async () => ({ id: 1 }))
vi.mock('@/app/(default)/settings/actions', () => ({
  sendFeedback: (...a: unknown[]) => sendFeedback(...(a as [Record<string, unknown>])),
}))
// SettingsTabs reads ?tab=&sub= via useSearchParams.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import FeedbackPanel from '@/app/(default)/settings/feedback/feedback-panel'
import FeedbackAdmin, { type FeedbackEntry } from '@/app/(default)/settings/feedback/feedback-admin'

beforeEach(() => {
  sendFeedback.mockClear()
})

describe('FeedbackPanel — submit form', () => {
  it('writes the chosen topic to feedback.category, with an optional rating and trimmed message', async () => {
    render(<FeedbackPanel />)

    // Pick a real topic bucket (not the old hardcoded 'nps').
    fireEvent.change(screen.getByLabelText(/Feedback topic/i), { target: { value: 'billing' } })

    // Choose an NPS score.
    fireEvent.click(screen.getByRole('radio', { name: /^4 —/ }))

    fireEvent.change(screen.getByLabelText(/Leave feedback/i), { target: { value: '  the shop is great  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Send feedback/i }))

    await waitFor(() => expect(sendFeedback).toHaveBeenCalledTimes(1))
    expect(sendFeedback).toHaveBeenCalledWith({ category: 'billing', rating: 4, message: 'the shop is great' })
  })

  it('keeps the NPS rating optional — sends null when no score is picked', async () => {
    render(<FeedbackPanel />)
    fireEvent.change(screen.getByLabelText(/Leave feedback/i), { target: { value: 'no score here' } })
    fireEvent.click(screen.getByRole('button', { name: /Send feedback/i }))

    await waitFor(() => expect(sendFeedback).toHaveBeenCalledTimes(1))
    const arg = sendFeedback.mock.calls[0][0]
    expect(arg.rating).toBeNull()
    expect(arg.message).toBe('no score here')
  })

  it('toggles a rating off when its button is clicked again', async () => {
    render(<FeedbackPanel />)
    const four = screen.getByRole('radio', { name: /^4 —/ })
    fireEvent.click(four)
    expect(four.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(four)
    expect(four.getAttribute('aria-checked')).toBe('false')
  })

  it('does not submit an empty message (Send is disabled until there is text)', () => {
    render(<FeedbackPanel />)
    const send = screen.getByRole('button', { name: /Send feedback/i }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(send)
    expect(sendFeedback).not.toHaveBeenCalled()
    // Once there's real content the button enables.
    fireEvent.change(screen.getByLabelText(/Leave feedback/i), { target: { value: 'ok' } })
    expect((screen.getByRole('button', { name: /Send feedback/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('char-counts the message toward the 4000 cap', () => {
    render(<FeedbackPanel />)
    expect(screen.getByText('0 / 4,000')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Leave feedback/i), { target: { value: 'hello' } })
    expect(screen.getByText('5 / 4,000')).toBeTruthy()
  })

  it('makes the NPS endpoints unmistakable', () => {
    render(<FeedbackPanel />)
    expect(screen.getAllByText('Not likely').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Extremely likely').length).toBeGreaterThan(0)
  })
})

const baseEntry = (over: Partial<FeedbackEntry>): FeedbackEntry => ({
  id: 1,
  category: 'other',
  rating: 5,
  message: 'msg',
  createdAt: new Date().toISOString(),
  submitterName: 'Jane',
  submitterEmail: 'jane@example.com',
  organizationName: 'Acme',
  organizationType: 'clinic',
  ...over,
})

describe('FeedbackAdmin — inbox', () => {
  it('renders the category as a neutral pill and filters by topic', () => {
    const entries = [
      baseEntry({ id: 1, category: 'billing', message: 'billing note' }),
      baseEntry({ id: 2, category: 'website', message: 'website note' }),
    ]
    render(<FeedbackAdmin entries={entries} />)

    // Category pills present (neutral tone).
    const pills = document.querySelectorAll('[data-tone="neutral"]')
    expect(pills.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('billing note')).toBeTruthy()

    // Filter down to just the Website topic.
    fireEvent.click(screen.getByRole('button', { name: /Website & studio/i }))
    expect(screen.getByText('website note')).toBeTruthy()
    expect(screen.queryByText('billing note')).toBeNull()
  })

  it('labels a legacy nps row readably instead of a blank pill', () => {
    render(<FeedbackAdmin entries={[baseEntry({ category: 'nps' })]} />)
    // 'nps' → "Nps" via the fallback (never empty).
    expect(screen.getByText('Nps')).toBeTruthy()
  })
})
