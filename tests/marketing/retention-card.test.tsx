import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RetentionAutomationsCard } from '@/app/(default)/marketing/retention-automations-card'

/**
 * The automations card (campaigns phase 2): four rows (welcome joined),
 * each with an "edit the message" path, a Customized pill when the org
 * overrode the copy, and an honest last-30-days proof line only when the
 * automation actually sent.
 */

vi.mock('@/app/(default)/marketing/actions', () => ({
  setRetentionAutomationAction: vi.fn(async () => ({ ok: true })),
}))

const BASE = {
  initial: { birthdayAutoSend: true, lapsedReactivation: false, benefitsAutoSend: false, welcomeAutoSend: false },
  preview: { birthdaysThisMonth: 3, newlyLapsed: 0, benefitsEligible: 0, newThisWeek: 2 },
  stats: {
    birthday: { sent: 43, booked: 6 },
    reactivation: { sent: 0, booked: 0 },
    benefits: { sent: 0, booked: 0 },
    welcome: { sent: 0, booked: 0 },
  },
  customized: { birthday: true, reactivation: false, benefits: false, welcome: false },
  canManage: true,
}

describe('RetentionAutomationsCard', () => {
  it('renders all four automations including the new-patient welcome', () => {
    render(<RetentionAutomationsCard {...BASE} />)
    expect(screen.getByText('Birthday greetings')).toBeInTheDocument()
    expect(screen.getByText('Reactivation nudge')).toBeInTheDocument()
    expect(screen.getByText('Use-your-benefits reminder')).toBeInTheDocument()
    expect(screen.getByText('New-patient welcome')).toBeInTheDocument()
  })

  it('every row links to its message editor', () => {
    render(<RetentionAutomationsCard {...BASE} />)
    const links = screen.getAllByRole('link', { name: /the message|your message/i })
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/growth/outreach/automations/birthday')
    expect(hrefs).toContain('/growth/outreach/automations/welcome')
    expect(links).toHaveLength(4)
  })

  it('shows the proof line only for automations that actually sent', () => {
    render(<RetentionAutomationsCard {...BASE} />)
    expect(screen.getByText(/43 sent/)).toBeInTheDocument()
    expect(screen.getByText(/6 booked/)).toBeInTheDocument()
    // Others sent nothing — no fake zeros.
    expect(screen.queryAllByText(/0 sent/)).toHaveLength(0)
  })

  it('marks an edited message with the Customized pill', () => {
    render(<RetentionAutomationsCard {...BASE} />)
    expect(screen.getAllByText('Customized')).toHaveLength(1)
  })
})
