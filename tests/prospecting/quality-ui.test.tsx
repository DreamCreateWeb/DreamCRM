import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * The quality surfaces (P-01): the drawer's Verification card says every
 * signal's source and UTC stamp; the call card refuses a dead number as
 * the dial target and says so; the pills speak the registry's tones.
 */

vi.mock('@/app/(default)/platform/prospecting/admin-actions', () => ({
  logCallOutcomeAction: vi.fn(async () => {}),
  convertProspectAction: vi.fn(async () => ({ ok: true })),
  getBookingLinkAction: vi.fn(async () => ({ ok: false, reason: 'booking_disabled' })),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => () => {} }))

import { VerificationCard } from '@/app/(default)/platform/prospecting/verification-card'
import { QualityPill, PhoneStandingPill, QUALITY_LEGEND } from '@/app/(default)/platform/prospecting/quality-pills'
import CallCard from '@/app/(default)/platform/prospecting/call-list/call-card'
import type { CallListRow } from '@/lib/services/prospecting'

const NOW = new Date('2026-11-10T12:00:00Z')
const VERIFICATION = {
  places: { status: 'matched', detail: 'Matched "Smile Dental" (phone matches)', checkedAt: '2026-11-10T09:05:00.000Z', source: 'places' },
  business: { status: 'open', detail: 'Google lists it as open', checkedAt: '2026-11-10T09:05:00.000Z', source: 'places' },
  npi: { status: 'active', detail: 'NPI active', checkedAt: '2026-11-10T09:05:00.000Z', source: 'nppes' },
  website: { status: 'dead', detail: 'smiledental.com no longer resolves (DNS)', checkedAt: '2026-11-10T09:05:00.000Z', source: 'crawl' },
  phone: { status: 'well_formed', detail: 'Well-formed US number — the line check is off', checkedAt: '2026-11-10T09:05:00.000Z', source: 'nanp' },
}

function row(over: Partial<CallListRow> = {}): CallListRow {
  return {
    id: 'pros_1',
    name: 'Smile Dental',
    city: 'Atlanta',
    state: 'GA',
    phone: '4045551212',
    email: null,
    authorizedOfficialName: 'Jane Doe',
    intentSignal: 'reply_interested',
    intentAt: NOW,
    intentSummary: null,
    talkingPoints: [],
    replyDraft: null,
    opportunityScore: 92,
    scoreBand: 'hot',
    lastCallOutcome: null,
    phoneStatus: 'valid',
    phoneLineType: 'landline',
    qualityScore: 85,
    qualityBand: 'best',
    qualityReasons: ['Google listing matched and open'],
    ...over,
  }
}

describe('VerificationCard', () => {
  it('names every signal with its status, source and a UTC-marked stamp, and explains a parked record', () => {
    const { container } = render(
      <VerificationCard
        verification={VERIFICATION}
        verifiedAt="2026-11-10T09:05:00.000Z"
        qualityScore={0}
        qualityBand="parked"
        qualityReasons={['smiledental.com no longer resolves (DNS)']}
        phone="4045551212"
        phoneSource="places"
        now={NOW}
      />,
    )
    for (const id of ['places', 'business', 'npi', 'website', 'phone']) {
      expect(container.querySelector(`[data-signal="${id}"]`)).toBeTruthy()
    }
    expect(screen.getAllByText(/Nov 10, 2026 · 09:05 UTC/).length).toBeGreaterThanOrEqual(5)
    expect(screen.getAllByText(/Google Places · checked/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Number from Google listing/)).toBeTruthy()
    expect(screen.getByText(/Parked — not served to any queue/)).toBeTruthy()
    // The website signal's urgent pill, the listing's ok pill.
    const website = container.querySelector('[data-signal="website"] [data-tone]')
    expect(website?.getAttribute('data-tone')).toBe('urgent')
    const places = container.querySelector('[data-signal="places"] [data-tone]')
    expect(places?.getAttribute('data-tone')).toBe('ok')
    cleanup()
  })

  it('"Verified" only when every core signal is inside 60 days; never verified says so', () => {
    render(
      <VerificationCard verification={null} verifiedAt={null} qualityScore={null} qualityBand={null} qualityReasons={null} phone={null} phoneSource={null} now={NOW} />,
    )
    expect(screen.getAllByText('Not verified yet').length).toBeGreaterThan(0)
    cleanup()
    const full = { ...VERIFICATION, website: { ...VERIFICATION.website, status: 'alive' } }
    render(
      <VerificationCard verification={full} verifiedAt="2026-11-10T09:05:00.000Z" qualityScore={82} qualityBand="best" qualityReasons={[]} phone="4045551212" phoneSource="nppes" now={NOW} />,
    )
    expect(screen.getByText(/^Verified · /)).toBeTruthy()
    cleanup()
  })
})

describe('the pills', () => {
  it('speak the registry: best=ok · good=info · weak=warn · parked=neutral; a dead phone is urgent', () => {
    const { container } = render(
      <>
        <QualityPill band="best" score={85} />
        <QualityPill band="good" score={65} />
        <QualityPill band="weak" score={45} />
        <QualityPill band="parked" score={0} />
        <QualityPill band={null} score={null} />
        <PhoneStandingPill status="disconnected" lineType={null} />
        <PhoneStandingPill status="valid" lineType="voip" />
      </>,
    )
    const tones = Array.from(container.querySelectorAll('[data-tone]')).map((e) => e.getAttribute('data-tone'))
    expect(tones).toEqual(['ok', 'info', 'warn', 'neutral', 'neutral', 'urgent', 'ok'])
    expect(screen.getByText('Best · 85')).toBeTruthy()
    expect(screen.getByText('Not verified yet')).toBeTruthy()
    expect(screen.getByText('Valid · VoIP')).toBeTruthy()
    expect(QUALITY_LEGEND.map((l) => l.label)).toEqual(['Best', 'Good', 'Weak', 'Parked'])
    cleanup()
  })
})

describe('CallCard — the dial target', () => {
  it('a valid number is a tel: link with its line type beside it', () => {
    const { container } = render(<CallCard row={row()} />)
    expect(container.querySelector('a[href="tel:4045551212"]')).toBeTruthy()
    expect(screen.getByText('Valid · landline')).toBeTruthy()
    expect(container.querySelector('[data-dial-refused]')).toBeNull()
    cleanup()
  })

  it('a disconnected number is REFUSED as the dial target — no tel: link, the reason in words, the next card is the next prospect', () => {
    const { container } = render(<CallCard row={row({ phoneStatus: 'disconnected', phoneLineType: null, qualityScore: 0, qualityBand: 'parked' })} />)
    expect(container.querySelector('a[href^="tel:"]')).toBeNull()
    expect(container.querySelector('[data-dial-refused]')).toBeTruthy()
    expect(screen.getByText(/Disconnected — not a dial target/)).toBeTruthy()
    cleanup()
  })

  it('offers the caller’s verdicts in plain words', () => {
    render(<CallCard row={row()} />)
    for (const label of ['Disconnected', 'Wrong number', 'Practice closed / retired', 'Reached the desk']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    cleanup()
  })
})
