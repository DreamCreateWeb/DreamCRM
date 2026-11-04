import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

const publish = vi.fn(async (_i?: unknown) => ({ ok: true as const, published: 1, remaining: 1 }))
const discard = vi.fn(async (_i?: unknown) => ({ ok: true as const, discarded: 1 }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))
vi.mock('@/app/(default)/website/editor/website-actions', () => ({
  publishWebsiteAction: (i?: unknown) => publish(i),
  discardWebsiteAction: (i?: unknown) => discard(i),
}))

import PublishCard from '@/app/(default)/website/publish-card'

const sections = [
  { key: 'hero', label: 'Hero' },
  { key: 'about', label: 'About' },
]

beforeEach(() => {
  cleanup()
  publish.mockClear()
  discard.mockClear()
})

describe('PublishCard sections', () => {
  it('starts with every section on and publishes everything', async () => {
    render(<PublishCard count={2} labels={['a', 'b']} sections={sections} />)
    expect((screen.getByLabelText('Hero') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Publish to your live site/ }))
    await waitFor(() => expect(publish).toHaveBeenCalledWith(undefined))
  })

  it('unchecking one reads "Publish 1 of 2", keeps the rest as a draft and sends only the checked', async () => {
    render(<PublishCard count={2} labels={['a', 'b']} sections={sections} />)
    fireEvent.click(screen.getByLabelText('About'))
    expect(screen.getByText(/Keep the rest as a draft/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Publish 1 of 2' }))
    await waitFor(() => expect(publish).toHaveBeenCalledWith({ sections: ['hero'] }))
  })

  it('discard also acts on the checked sections only', async () => {
    render(<PublishCard count={2} labels={['a', 'b']} sections={sections} />)
    fireEvent.click(screen.getByLabelText('Hero'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(discard).toHaveBeenCalledWith({ sections: ['about'] }))
  })

  it('with nothing checked both buttons are disabled', () => {
    render(<PublishCard count={2} labels={['a', 'b']} sections={sections} />)
    fireEvent.click(screen.getByLabelText('Hero'))
    fireEvent.click(screen.getByLabelText('About'))
    expect((screen.getByRole('button', { name: /Publish/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('a thrown action surfaces an error and frees the buttons', async () => {
    publish.mockRejectedValueOnce(new Error('boom'))
    render(<PublishCard count={2} labels={['a', 'b']} sections={sections} />)
    fireEvent.click(screen.getByRole('button', { name: /Publish to your live site/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect((screen.getByRole('button', { name: /Publish to your live site/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})
