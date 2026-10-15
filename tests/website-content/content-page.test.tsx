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

let searchParams = new URLSearchParams()
const refreshMock = vi.fn()
vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  redirect: (to: string) => redirectMock(to),
  useSearchParams: () => searchParams,
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
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
      savePaymentMethods: mk(),
      saveFinancingPartners: mk(),
      saveCancellationPolicy: mk(),
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
  searchParams = new URLSearchParams()
  refreshMock.mockClear()
  window.location.hash = ''
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
  it('the rail lists every applicable section with its honest state; one section is open', async () => {
    render(await WebsiteContentPage())
    for (const id of ['story', 'services', 'staff', 'stats', 'photos', 'faq', 'why-us', 'insurance', 'methods', 'financing', 'cancellation']) {
      expect(screen.getByTestId(`rail-${id}`)).toBeTruthy()
    }
    // Counts in the rail's own words — and "Not set yet" where there is nothing.
    expect(screen.getByText('1 service')).toBeTruthy()
    expect(screen.getByText('1 on the team')).toBeTruthy()
    expect(screen.getByText('1 highlight')).toBeTruthy()
    expect(screen.getByText('1 carrier')).toBeTruthy()
    expect(screen.getByText('1 ways to pay'.replace('1 ways', '1 ways'))).toBeTruthy()
    expect(screen.getAllByText('Not set yet').length).toBeGreaterThan(0)
    expect(screen.getByTestId('rail-services').getAttribute('data-filled')).toBe('true')
    expect(screen.getByTestId('rail-faq').getAttribute('data-filled')).toBe('false')
    // The completeness heartbeat, paired with visible text.
    expect(screen.getByText(/sections filled/)).toBeTruthy()
    // The first section is open; the rest are mounted but hidden.
    expect(screen.getByTestId('panel-story').hidden).toBe(false)
    expect(screen.getByTestId('panel-financing').hidden).toBe(true)
    expect(screen.getByDisplayValue('Care that feels human')).toBeTruthy()
    // Coloring pages only for pediatric.
    expect(screen.queryByTestId('rail-coloring')).toBeNull()
    cleanup()
  })

  it('pediatric template surfaces the coloring-pages section', async () => {
    profileRow = makeProfile({ template: 'pediatric' })
    render(await WebsiteContentPage())
    expect(screen.getByTestId('rail-coloring')).toBeTruthy()
    cleanup()
  })

  it('picking a section opens it and the doors point at where it shows', async () => {
    render(await WebsiteContentPage())
    fireEvent.click(screen.getByTestId('rail-financing'))
    expect(screen.getByTestId('panel-financing').hidden).toBe(false)
    expect(screen.getByTestId('panel-story').hidden).toBe(true)
    expect(screen.getByTestId('rail-financing').getAttribute('aria-selected')).toBe('true')
    const doors = screen.getByTestId('section-doors')
    expect(doors.querySelector('a[href$="/payment-financing"]')).toBeTruthy()
    expect(doors.querySelector('a[href="/website/editor?page=%2Fpayment-financing"]')).toBeTruthy()
    cleanup()
  })

  it('the settings smart-search deep link (?sub=) opens that section', async () => {
    searchParams = new URLSearchParams('sub=financing')
    render(await WebsiteContentPage())
    expect(screen.getByTestId('panel-financing').hidden).toBe(false)
    expect(screen.getByTestId('panel-story').hidden).toBe(true)
    cleanup()
  })

  it('edits survive switching sections, and the rail says which are unsaved', async () => {
    render(await WebsiteContentPage())
    const tagline = screen.getByDisplayValue('Care that feels human') as HTMLInputElement
    fireEvent.input(tagline, { target: { value: 'A new tagline' } })
    expect(screen.getByText('1 with unsaved changes')).toBeTruthy()
    fireEvent.click(screen.getByTestId('rail-faq'))
    fireEvent.click(screen.getByTestId('rail-story'))
    expect((screen.getByDisplayValue('A new tagline') as HTMLInputElement).value).toBe('A new tagline')
    expect(screen.getByTestId('rail-story').textContent).toContain('Unsaved')
    cleanup()
  })

  it('the story form posts to saveStory (its own scoped action) and refreshes the server tree', async () => {
    render(await WebsiteContentPage())
    fireEvent.click(screen.getByText('Save your story'))
    await waitFor(() => expect(actionMocks.saveStory).toHaveBeenCalledTimes(1))
    const fd = actionMocks.saveStory.mock.calls[0][0] as FormData
    expect(fd.get('tagline')).toBe('Care that feels human')
    // No other section's action fired.
    expect(actionMocks.saveStaff).not.toHaveBeenCalled()
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    cleanup()
  })

  it('the three money sections each post ONLY their own column', async () => {
    render(await WebsiteContentPage())
    fireEvent.click(screen.getByTestId('rail-methods'))
    fireEvent.click(screen.getByText('Save payment methods'))
    await waitFor(() => expect(actionMocks.savePaymentMethods).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTestId('rail-financing'))
    fireEvent.click(screen.getByText('Save financing'))
    await waitFor(() => expect(actionMocks.saveFinancingPartners).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTestId('rail-cancellation'))
    fireEvent.click(screen.getByText('Save cancellation policy'))
    await waitFor(() => expect(actionMocks.saveCancellationPolicy).toHaveBeenCalledTimes(1))
    expect(actionMocks.savePaymentFinancing).not.toHaveBeenCalled()
    const fin = actionMocks.saveFinancingPartners.mock.calls[0][0] as FormData
    expect(fin.has('financingPartners')).toBe(true)
    expect(fin.has('paymentMethods')).toBe(false)
    cleanup()
  })

  it('members are redirected to the hub (owner/admin surface)', async () => {
    ctx = { ...ctx, role: 'member' }
    await expect(WebsiteContentPage()).rejects.toThrow('REDIRECT:/website')
    cleanup()
  })
})
