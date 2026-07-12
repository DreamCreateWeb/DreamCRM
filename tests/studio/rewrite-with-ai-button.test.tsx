import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import type { AiRewriteResult } from '@/app/(default)/website/editor/ai-actions'
import type { AiUsageSnapshot, GeneratedContent } from '@/lib/types/ai-website'

// Mock the server action — the button just calls it and routes the result.
const aiRewriteSection = vi.fn<(s: string) => Promise<AiRewriteResult>>()
vi.mock('@/app/(default)/website/editor/ai-actions', () => ({
  aiRewriteSection: (s: string) => aiRewriteSection(s),
}))

import RewriteWithAiButton from '@/app/(default)/website/editor/rewrite-with-ai-button'

const usage = (remaining: number): AiUsageSnapshot => ({
  used: 10 - remaining,
  limit: 10,
  remaining,
  period: '2026-06',
})

beforeEach(() => {
  aiRewriteSection.mockReset()
})

describe('RewriteWithAiButton', () => {
  it('fills the form (onContent) but does NOT save, and updates the usage counter', async () => {
    const content: GeneratedContent = { section: 'about', about: 'A warm new about paragraph.' }
    aiRewriteSection.mockResolvedValue({ ok: true, content, usage: usage(4) })
    const onContent = vi.fn()
    const onUsage = vi.fn()

    render(
      <RewriteWithAiButton section="about" usage={usage(5)} onUsage={onUsage} onContent={onContent} />,
    )
    fireEvent.click(screen.getByTestId('ai-rewrite-button'))

    await waitFor(() => expect(onContent).toHaveBeenCalledWith(content))
    expect(onUsage).toHaveBeenCalledWith(usage(4))
    // It only calls the generation action — never a save action.
    expect(aiRewriteSection).toHaveBeenCalledTimes(1)
    expect(aiRewriteSection).toHaveBeenCalledWith('about')
  })

  it('shows remaining allowance from props', () => {
    render(<RewriteWithAiButton section="stats" usage={usage(3)} onUsage={vi.fn()} onContent={vi.fn()} />)
    expect(screen.getByTestId('ai-rewrite-remaining').textContent).toMatch(/3 AI rewrites left/)
  })

  it('gates gracefully when the allowance is spent (no button, friendly copy)', () => {
    render(<RewriteWithAiButton section="faq" usage={usage(0)} onUsage={vi.fn()} onContent={vi.fn()} />)
    expect(screen.queryByTestId('ai-rewrite-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('ai-rewrite-gate').textContent).toMatch(/0 left.*resets on the 1st/i)
  })

  it('on a limit result, syncs usage and does not fill the form', async () => {
    aiRewriteSection.mockResolvedValue({ ok: false, reason: 'limit', usage: usage(0) })
    const onContent = vi.fn()
    const onUsage = vi.fn()
    render(<RewriteWithAiButton section="about" usage={usage(1)} onUsage={onUsage} onContent={onContent} />)
    fireEvent.click(screen.getByTestId('ai-rewrite-button'))
    await waitFor(() => expect(onUsage).toHaveBeenCalledWith(usage(0)))
    expect(onContent).not.toHaveBeenCalled()
  })

  it('surfaces a non-limit error inline', async () => {
    aiRewriteSection.mockResolvedValue({ ok: false, reason: 'error', error: 'AI output failed validation' })
    render(<RewriteWithAiButton section="about" usage={usage(5)} onUsage={vi.fn()} onContent={vi.fn()} />)
    fireEvent.click(screen.getByTestId('ai-rewrite-button'))
    await waitFor(() => expect(screen.getByText(/failed validation/i)).toBeInTheDocument())
  })
})
