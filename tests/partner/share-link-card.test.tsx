import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import ShareLinkCard from '@/app/(partner)/partner/share-link-card'

describe('partner share-link card', () => {
  it('shows the link and the signed-up count', () => {
    render(<ShareLinkCard url="https://www.dreamcreatestudio.com/?ref=abcd2345" signedUp={3} />)
    expect(screen.getByLabelText('Your share link')).toHaveValue('https://www.dreamcreatestudio.com/?ref=abcd2345')
    expect(screen.getByText('3 practices signed up through it.')).toBeInTheDocument()
  })
  it('zero reads kindly, one is singular', () => {
    const { rerender } = render(<ShareLinkCard url="u" signedUp={0} />)
    expect(screen.getByText(/No practices have signed up/)).toBeInTheDocument()
    rerender(<ShareLinkCard url="u" signedUp={1} />)
    expect(screen.getByText('1 practice signed up through it.')).toBeInTheDocument()
  })
  it('copies to the clipboard', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareLinkCard url="https://x/?ref=abcd2345" signedUp={0} />)
    fireEvent.click(screen.getByRole('button', { name: /Copy link/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://x/?ref=abcd2345'))
  })
})
