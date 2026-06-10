import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import MarketingHome from '@/components/marketing/marketing-home'
import { PLANS } from '@/lib/stripe-config'

/**
 * The platform marketing site at the root of www.dreamcreatestudio.com.
 * Asserts the conversion-critical pieces: hero value prop, sign-in/sign-up
 * entries, live-demo link, pricing rendered FROM the real PLANS config (so
 * marketing can never drift from what checkout charges), and the FAQ.
 */

describe('MarketingHome', () => {
  it('renders the hero value proposition', () => {
    render(<MarketingHome />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/one calm system/i)
    expect(screen.getByText(/wrapped around the practice management system you already run/i)).toBeInTheDocument()
  })

  it('has Sign in and Get started entries in the header', () => {
    render(<MarketingHome />)
    const signIns = screen.getAllByRole('link', { name: /sign in/i })
    expect(signIns.length).toBeGreaterThanOrEqual(1)
    expect(signIns[0]).toHaveAttribute('href', '/signin')
    const signUps = screen.getAllByRole('link', { name: /get started/i })
    expect(signUps.length).toBeGreaterThanOrEqual(1)
    expect(signUps[0]).toHaveAttribute('href', '/signup')
  })

  it('links to the live Acme demo practice on its subdomain', () => {
    render(<MarketingHome />)
    const demoLinks = screen.getAllByRole('link', { name: /demo/i })
    expect(demoLinks.length).toBeGreaterThanOrEqual(1)
    for (const link of demoLinks) {
      expect(link.getAttribute('href')).toContain('acme-dental-demo.')
      expect(link).toHaveAttribute('target', '_blank')
    }
  })

  it('renders every plan with its real monthly price from PLANS', () => {
    render(<MarketingHome />)
    for (const plan of PLANS) {
      expect(screen.getByRole('heading', { name: plan.name })).toBeInTheDocument()
      expect(screen.getByText(`$${plan.price}`)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: `Choose ${plan.name}` })).toHaveAttribute('href', '/signup')
    }
  })

  it('renders each plan’s first feature bullet (copy stays wired to config)', () => {
    render(<MarketingHome />)
    for (const plan of PLANS) {
      expect(screen.getByText(plan.features[plan.features.length - 1])).toBeInTheDocument()
    }
  })

  it('marks Pro as the highlighted plan', () => {
    render(<MarketingHome />)
    expect(screen.getByText(/most popular/i)).toBeInTheDocument()
  })

  it('renders the FAQ with the keep-your-PMS answer', () => {
    render(<MarketingHome />)
    expect(screen.getByText(/Do I have to leave my practice management system\?/i)).toBeInTheDocument()
    expect(screen.getByText(/wraps the PMS you already run/i)).toBeInTheDocument()
  })

  it('renders the consolidation pitch with the replaced-tools list', () => {
    render(<MarketingHome />)
    expect(screen.getByText(/Website agency retainer/i)).toBeInTheDocument()
    expect(screen.getByText(/DreamCRM — all of it/i)).toBeInTheDocument()
  })
})
