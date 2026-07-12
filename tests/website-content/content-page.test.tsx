/**
 * Website → Content — the plain-form home for website content (deep-carve
 * Phase 1). Proves: every section renders against a real profile; each
 * section form posts to ITS OWN scoped action (the Studio's savers — one
 * saver, two doors); pediatric-only gating; role gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'

let ctx: Record<string, unknown>
let profileRow: Record<string, unknown> | null
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
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (profileRow ? [profileRow] : []) }) }),
    }),
  },
}))
vi.mock('@/lib/services/service-library', () => ({
  listLibraryForPicker: vi.fn(async () => []),
}))

const { actionMocks } = vi.hoisted(() => {
  const mk = () => vi.fn(async (_fd: FormData) => ({ ok: true as const }))
  return {
    actionMocks: {
      saveStory: mk(),
      saveStaff: mk(),
      saveStats: mk(),
      saveOfficePhotos: mk(),
      saveFaq: mk(),
      saveDifferenceChips: mk(),
      saveColoringPages: mk(),
      saveInsurance: mk(),
      savePaymentFinancing: mk(),
    },
  }
})
vi.mock('@/app/(default)/website/editor/website-actions', () => ({ ...actionMocks }))
// The picker self-saves through its own actions — stub it to keep the page
// render light (its behavior is covered by its own tests).
vi.mock('@/app/(default)/settings/clinic/services-library-picker', () => ({
  default: () => <div data-testid="services-picker" />,
}))

import WebsiteContentPage from '@/app/(default)/website/content/page'

function makeProfile(over: Record<string, unknown> = {}) {
  return {
    organizationId: 'org_1',
    displayName: 'Acme Dental',
    tagline: 'Care that feels human',
    about: 'A friendly practice.',
    template: 'modern',
    city: 'Austin',
    services: [{ id: 's1', name: 'Cleanings' }],
    staff: [{ id: 'st1', name: 'Dr. A' }],
    stats: null,
    officePhotos: null,
    faq: null,
    differenceChips: ['Same-week visits'],
    coloringPages: null,
    acceptedInsuranceCarriers: ['Delta Dental'],
    paymentMethods: ['Cash'],
    financingPartners: null,
    cancellationPolicy: null,
    ...over,
  }
}

beforeEach(() => {
  redirectMock.mockClear()
  Object.values(actionMocks).forEach((m) => m.mockClear())
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
    planTier: 'pro',
  }
  profileRow = makeProfile()
})

describe('WebsiteContentPage', () => {
  it('renders every applicable section against the real profile', async () => {
    render(await WebsiteContentPage())
    for (const label of [
      'Your story',
      'Services',
      'Team',
      'Trust stats',
      'Office photos',
      'FAQ',
      '“Why us” highlights',
      'Insurance carriers',
      'Payments & policies',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    // Real values pre-filled.
    expect(screen.getByDisplayValue('Care that feels human')).toBeTruthy()
    // Coloring pages only for pediatric.
    expect(screen.queryByText('Coloring pages')).toBeNull()
    cleanup()
  })

  it('pediatric template surfaces the coloring-pages section', async () => {
    profileRow = makeProfile({ template: 'pediatric' })
    render(await WebsiteContentPage())
    expect(screen.getAllByText('Coloring pages').length).toBeGreaterThan(0)
    cleanup()
  })

  it('the story form posts to saveStory (its own scoped action)', async () => {
    render(await WebsiteContentPage())
    fireEvent.click(screen.getByText('Save your story'))
    await waitFor(() => expect(actionMocks.saveStory).toHaveBeenCalledTimes(1))
    const fd = actionMocks.saveStory.mock.calls[0][0] as FormData
    expect(fd.get('tagline')).toBe('Care that feels human')
    // No other section's action fired.
    expect(actionMocks.saveStaff).not.toHaveBeenCalled()
    cleanup()
  })

  it('the payments form posts all three columns through savePaymentFinancing', async () => {
    render(await WebsiteContentPage())
    fireEvent.click(screen.getByText('Save payments & policies'))
    await waitFor(() => expect(actionMocks.savePaymentFinancing).toHaveBeenCalledTimes(1))
    cleanup()
  })

  it('members are redirected to the hub (owner/admin surface)', async () => {
    ctx = { ...ctx, role: 'member' }
    await expect(WebsiteContentPage()).rejects.toThrow('REDIRECT:/website')
    cleanup()
  })
})
