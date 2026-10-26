/**
 * The /book page makes no availability PROMISE it cannot keep.
 *
 * "Same-week visits — most new patients are scheduled within 3–5 days" was a
 * constant on every practice's booking page, with no copy key to edit it out:
 * a one-doctor office booked three weeks out was made to promise 3–5 days on
 * its own site. The shared header dropped the same chip as "an availability
 * guarantee a given office may not keep". The replacement is LIVING DATA —
 * the shell's own 14-day scan (`firstBookableDayInWindow`, clinic-local day
 * keys) feeds a "Next opening: Thursday" card; request-only booking says what
 * actually happens next; a closed window shows no card at all (the form's
 * rescue card already covers it honestly). The three voice cards that remain
 * are editable under `book.assure.<i>`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { nextOpeningLabel } from '@/lib/clinic-site-helpers'

function makeData(overrides: Partial<ClinicSiteData['profile']> = {}): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Acme Dental',
    slug: 'acme-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      legalName: null,
      displayName: 'Acme Dental',
      tagline: null,
      about: null,
      npi: null,
      brandColor: '#9CAF9F',
      template: 'modern',
      phone: '(555) 555-0100',
      email: 'hi@acme.test',
      websiteDomain: null,
      addressLine1: null,
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: null,
      country: 'US',
      hours: null,
      timezone: 'America/Chicago',
      planTier: 'premium',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      logoUrl: null,
      heroImageUrl: null,
      services: null,
      staff: null,
      stats: null,
      testimonials: null,
      officePhotos: null,
      faq: null,
      visitTypeSettings: null,
      portalSettings: null,
      copyOverrides: null,
      selfBookingEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      intakeFormsEnabledAt: null,
      ...overrides,
    } as ClinicSiteData['profile'],
  }
}

vi.mock('@/lib/services/clinic-site', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/clinic-site')>(
    '@/lib/services/clinic-site',
  )
  return {
    ...actual,
    getClinicThemeBySlug: vi.fn(async () => ({ orgId: null, brand: null, template: null })),
    getClinicSiteBySlug: vi.fn(),
    resolveSiteBasePath: vi.fn(async () => '/site/acme-dental'),
    appBaseUrl: vi.fn(() => 'https://app.example.com'),
    publicSiteUrl: vi.fn(() => 'https://dreamcreatestudio.com/site/acme-dental'),
  }
})
vi.mock('@/lib/services/blog', () => ({ listPublishedPosts: vi.fn(async () => []) }))
vi.mock('@/lib/services/membership', () => ({ listActivePlans: vi.fn(async () => []) }))
vi.mock('@/lib/services/careers', () => ({ getOpenJobs: vi.fn(async () => []) }))
vi.mock('@/lib/services/portal-settings', () => ({
  getPortalSettings: vi.fn(async () => ({ booking: { minNoticeHours: 24 } })),
}))
vi.mock('@/lib/services/booking-deposits', () => ({
  canTakeBookingDeposits: vi.fn(async () => false),
  finalizeBookingDepositFromSession: vi.fn(async () => null),
}))
const firstBookableDayInWindow = vi.fn(async (): Promise<string | null> => null)
vi.mock('@/lib/services/booking', () => ({
  firstBookableDayInWindow: (...a: unknown[]) => firstBookableDayInWindow(...(a as [])),
}))
// The forms' mount effects call these; keep the component off the server.
vi.mock('@/app/site/[slug]/actions', () => ({
  listBookingSlots: vi.fn(async () => ({ slots: [], closedReason: 'day_closed' })),
  submitBookingRequest: vi.fn(async () => ({ ok: true, data: {} })),
  submitAppointmentRequest: vi.fn(async () => ({ ok: true, data: {} })),
}))

import BookPage from '@/app/site/[slug]/book/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

// Monday 2026-10-26, 10:00 Central. Only Date is faked so React's scheduler
// and testing-library keep their real timers.
const NOW = new Date('2026-10-26T15:00:00Z')

async function renderPage(data: ClinicSiteData = makeData(), nextDay: string | null = null) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  firstBookableDayInWindow.mockResolvedValue(nextDay)
  const ui = await BookPage({
    params: Promise.resolve({ slug: 'acme-dental' }),
    searchParams: Promise.resolve({}),
  })
  return render(ui as React.ReactElement)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const PROMISE = /same[- ]week|3–5 days|3-5 days/i

describe('nextOpeningLabel (pure, clinic-local day keys)', () => {
  const today = '2026-10-26'
  it('today / tomorrow / a weekday inside the week / a dated day beyond it', () => {
    expect(nextOpeningLabel('2026-10-26', today)).toBe('today')
    expect(nextOpeningLabel('2026-10-27', today)).toBe('tomorrow')
    expect(nextOpeningLabel('2026-10-29', today)).toBe('Thursday')
    expect(nextOpeningLabel('2026-11-01', today)).toBe('Sunday')
    expect(nextOpeningLabel('2026-11-05', today)).toBe('Thursday, November 5')
  })
  it('is timezone-independent: a calendar key has one weekday wherever the server runs', () => {
    // 2026-10-29 is a Thursday in every zone; the label never reads the host clock.
    expect(nextOpeningLabel('2026-10-29', today)).toBe('Thursday')
  })
  it('refuses a day in the past, a missing day and a malformed key (no card)', () => {
    expect(nextOpeningLabel('2026-10-25', today)).toBeNull()
    expect(nextOpeningLabel(null, today)).toBeNull()
    expect(nextOpeningLabel('next thursday', today)).toBeNull()
    expect(nextOpeningLabel('2026-10-29', 'garbage')).toBeNull()
  })
})

describe('/book — the availability line is data, not a promise', () => {
  it('self-booking on: names the real next opening from the schedule scan (clinic-local)', async () => {
    await renderPage(makeData(), '2026-10-29')
    expect(screen.getByText('Next opening: Thursday')).toBeInTheDocument()
    // The scan ran from the CLINIC's today, not UTC's.
    expect(firstBookableDayInWindow).toHaveBeenCalledWith('org_1', '2026-10-26', 14, undefined, 24)
    expect(document.body.textContent).not.toMatch(PROMISE)
  })

  it('self-booking on, the whole window closed: no opening card (the rescue card covers it)', async () => {
    await renderPage(makeData(), null)
    expect(screen.queryByText(/Next opening/i)).toBeNull()
    expect(document.body.textContent).not.toMatch(PROMISE)
  })

  it('request-only booking: says what happens next, with no day attached', async () => {
    await renderPage(makeData({ selfBookingEnabled: false }))
    expect(screen.getByText('We’ll reach out to find a time')).toBeInTheDocument()
    expect(screen.queryByText(/Next opening/i)).toBeNull()
    expect(firstBookableDayInWindow).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(PROMISE)
  })

  it('the hero intro and the three voice cards are clinic-editable copy keys', async () => {
    await renderPage(
      makeData({
        copyOverrides: {
          'book.heroIntro': 'Our own words up top.',
          'book.assure.0.title': 'Our own first card',
          'book.assure.2.body': 'Our own last body.',
        } as never,
      }),
      '2026-10-29',
    )
    expect(screen.getByText('Our own words up top.')).toBeInTheDocument()
    expect(screen.getByText('Our own first card')).toBeInTheDocument()
    expect(screen.getByText('Our own last body.')).toBeInTheDocument()
    // The live card is not a copy key — it cannot be edited into a promise.
    expect(screen.getByText('Next opening: Thursday')).toBeInTheDocument()
    // The untouched defaults still render.
    expect(screen.getByText('We’ll explain everything')).toBeInTheDocument()
  })
})
