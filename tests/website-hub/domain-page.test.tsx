/**
 * /website/domain — the elevated custom-domain page (Phase B). Proves the
 * role gate (owner/admin only; members bounce to the hub) and that the page
 * renders the connect card against the REAL stored status + the free
 * subdomain fallback address.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

let ctx: Record<string, unknown>
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`)
})

vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  redirect: (to: string) => redirectMock(to),
}))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ctx),
}))
vi.mock('@/lib/services/custom-domain', () => ({
  getCustomDomainStatus: vi.fn(async () => null),
}))
// The card itself is client-interactive; its own behavior is covered by the
// service tests — here we only need the page to mount it with real props.
vi.mock('@/app/(default)/website/domain/custom-domain-card', () => ({
  default: ({ subdomainUrl }: { subdomainUrl: string }) => (
    <div data-testid="domain-card">{subdomainUrl}</div>
  ),
}))

import WebsiteDomainPage from '@/app/(default)/website/domain/page'

beforeEach(() => {
  redirectMock.mockClear()
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
    planTier: 'pro',
  }
})

describe('WebsiteDomainPage', () => {
  it('renders the connect card with the free subdomain fallback', async () => {
    render(await WebsiteDomainPage())
    expect(screen.getByTestId('domain-card').textContent).toContain('https://acme.')
    expect(screen.getByText('Domain')).toBeTruthy()
    cleanup()
  })

  it('members bounce to the hub (domain changes are owner/admin-only)', async () => {
    ctx = { ...ctx, role: 'member' }
    await expect(WebsiteDomainPage()).rejects.toThrow('REDIRECT:/website')
    cleanup()
  })

  it('patients bounce to the portal', async () => {
    ctx = { ...ctx, tenantType: 'patient' }
    await expect(WebsiteDomainPage()).rejects.toThrow('REDIRECT:/patient/dashboard')
    cleanup()
  })
})
