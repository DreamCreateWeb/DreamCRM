/**
 * In-context not-found boundaries. A notFound() from a dashboard/portal page
 * must keep the user in their shell with a clear way back — not the chrome-less
 * root 404. The shared card carries the 404 label, a message, and a primary
 * link to a sensible home.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RouteNotFound from '@/components/ui/route-not-found'
import DashboardNotFound from '@/app/(default)/not-found'
import PortalNotFound from '@/app/(portal)/not-found'

describe('RouteNotFound', () => {
  it('renders the 404 label, title, message, and a back link', () => {
    render(<RouteNotFound href="/dashboard" linkLabel="Back to dashboard" />)
    expect(screen.getByText('404')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Back to dashboard' })
    expect(link.getAttribute('href')).toBe('/dashboard')
  })
})

describe('surface boundaries', () => {
  it('the dashboard 404 links back to /dashboard', () => {
    render(<DashboardNotFound />)
    expect(screen.getByText(/We couldn't find that/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to dashboard' }).getAttribute('href')).toBe('/dashboard')
  })

  it('the portal 404 links back to the patient portal', () => {
    render(<PortalNotFound />)
    expect(screen.getByRole('link', { name: 'Back to my portal' }).getAttribute('href')).toBe('/patient/dashboard')
  })
})
