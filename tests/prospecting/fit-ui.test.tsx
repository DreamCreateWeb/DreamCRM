import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * THE FIT SURFACES (P-04): the drawer's Fit card (a flagged row says why,
 * offers "Not a chain" — confirm BEFORE the transition, runAction; the
 * stack and the builder with the crawl's stamp), the Chain pill in the
 * drawer header and on the table, the hunt panel's "Chains removed" tile
 * and the early-refresh line, the Verification card's phone line naming
 * its sources, the settings slider's recommended marker — tones from the
 * registry, no raw buttons, no "coming soon".
 */

const actions = vi.hoisted(() => ({
  clearChain: vi.fn(async (_id: string) => ({ ok: true as const, status: 'contacted' })),
  confirm: vi.fn(async (_opts?: unknown) => true),
  refresh: vi.fn(),
}))
vi.mock('@/app/(default)/platform/prospecting/admin-actions', () => ({
  clearChainFlagAction: actions.clearChain,
  mergeProspectAction: vi.fn(async () => ({ ok: true })),
  updateHygieneAction: vi.fn(async () => ({ ok: true })),
  logCallOutcomeAction: vi.fn(async () => {}),
  suppressProspectAction: vi.fn(async () => {}),
  enrollProspectAction: vi.fn(async () => ({ ok: true })),
  stopEnrollmentAction: vi.fn(async () => {}),
  startBrandedDemoAction: vi.fn(async () => ({ ok: true, to: '/' })),
  reEnrichProspectAction: vi.fn(async () => ({ ok: true })),
  verifyProspectAction: vi.fn(async () => ({ ok: true, qualityScore: 80, qualityBand: 'best' })),
  addProspectContactAction: vi.fn(async () => ({ ok: true })),
  setPrimaryContactAction: vi.fn(async () => {}),
  deleteProspectContactAction: vi.fn(async () => {}),
  reverifyContactsAction: vi.fn(async () => ({ verified: 0 })),
  draftDemoFollowupAction: vi.fn(async () => ({ ok: false })),
  setQualityFloorAction: vi.fn(async () => ({ ok: true, floor: 70 })),
  updateProspectPhoneAction: vi.fn(async () => ({ ok: true, phone: '4045551212' })),
  assignProspectToCallerAction: vi.fn(async () => ({ ok: true })),
  setKillSwitchAction: vi.fn(async () => {}),
  setDryRunAction: vi.fn(async () => {}),
  toggleStateAction: vi.fn(async () => {}),
  updateAutoEnrollAction: vi.fn(async () => {}),
  setDigestEnabledAction: vi.fn(async () => {}),
  setWatchdogEnabledAction: vi.fn(async () => {}),
  setBookingEnabledAction: vi.fn(async () => {}),
  updateBrainAction: vi.fn(async () => {}),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => () => {} }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => actions.confirm }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: actions.refresh }) }))
vi.mock('@/components/ui/use-focus-trap', () => ({ useFocusTrap: () => {} }))

import { FitCard, unreadStackTitle } from '@/app/(default)/platform/prospecting/fit-card'
import ProspectDrawer from '@/app/(default)/platform/prospecting/prospect-drawer'
import HuntPanel from '@/app/(default)/platform/prospecting/hunt-panel'
import { VerificationCard, phoneSourcesLine } from '@/app/(default)/platform/prospecting/verification-card'
import { QualityFloor } from '@/app/(default)/platform/prospecting/settings/settings-panel'
import { PROSPECTING_DEFAULTS, type ProspectCrawlSignals } from '@/lib/types/prospecting'
import { CARRIER_ONLY_LINE } from '@/lib/prospect-quality'
import { TONE_PILL, TONE_TEXT } from '@/lib/ui/encodings'
import type { ProspectDetail, HuntStats } from '@/lib/services/prospecting'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const AT = '2026-11-10T09:05:00.000Z'
const FLAGGED = {
  fit: {
    dso: { status: 'match', detail: "Part of Aspen Dental — a chain; we'll target chains later", checkedAt: AT, source: 'dso_list', name: 'Aspen Dental', matchedOn: 'listing', priorStatus: 'contacted' },
    size: { status: 'group', detail: 'A group practice — 6 dentists at this address in the registry', checkedAt: AT, source: 'nppes', dentists: 6, official: 'executive' },
    newPractice: { status: 'established', detail: 'In the registry since May 2010', checkedAt: AT, source: 'nppes', enumeratedAt: '2010-05-05' },
  },
}
const SIGNALS: ProspectCrawlSignals = {
  ssl: true,
  mobileViewport: true,
  copyrightYear: 2026,
  titleTag: 'Smile',
  metaDescription: null,
  bookingWidget: true,
  socialLinks: {},
  builder: 'wix',
  stack: ['NexHealth', 'Birdeye'],
  pageWeightKb: 400,
  emails: [],
  fetchedAt: AT,
}

describe('FitCard', () => {
  it('a flagged row: the Chain pill, the reason, every signal with its source and UTC stamp, and "Not a chain" — confirm BEFORE the action, then runAction', async () => {
    const { container } = render(
      <FitCard verification={FLAGGED} signals={SIGNALS} prospectId="pros_1" prospectName="Aspen Dental of Austin" status="disqualified" suppressedReason="chain" />,
    )
    expect(screen.getByText('Chain — set aside')).toBeTruthy()
    expect(container.querySelector('[data-fit-reason]')?.textContent).toBe("Part of Aspen Dental — a chain; we'll target chains later")
    expect(container.querySelector('[data-fit-signal="dso"]')?.textContent).toContain('the DSO list · Nov 10, 2026 · 09:05 UTC')
    expect(container.querySelector('[data-fit-signal="dso"]')?.textContent).toContain('on the Google listing name')
    expect(container.querySelector('[data-fit-signal="size"]')?.textContent).toContain('NPI registry · Nov 10, 2026 · 09:05 UTC')
    expect(screen.getAllByText('Group practice').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-fit-signal="stack"]')?.textContent).toContain('NexHealth · Birdeye')
    expect(container.querySelector('[data-fit-signal="stack"]')?.textContent).toContain('our crawler · Nov 10, 2026 · 09:05 UTC')
    expect(container.querySelector('[data-fit-signal="builder"]')?.textContent).toContain('Wix')

    const order: string[] = []
    actions.confirm.mockImplementation(async () => {
      order.push('confirm')
      return true
    })
    actions.clearChain.mockImplementation(async () => {
      order.push('action')
      return { ok: true as const, status: 'contacted' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Not a chain' }))
    await waitFor(() => expect(actions.clearChain).toHaveBeenCalledWith('pros_1'))
    expect(order).toEqual(['confirm', 'action'])
    expect(actions.confirm.mock.calls[0][0]).toMatchObject({ title: 'Aspen Dental of Austin is not a chain?', confirmLabel: 'Not a chain' })
    await waitFor(() => expect(actions.refresh).toHaveBeenCalled())
  })

  it('a declined confirm never reaches the action; a refusal reads in words', async () => {
    actions.confirm.mockResolvedValueOnce(false)
    render(<FitCard verification={FLAGGED} signals={null} prospectId="pros_1" prospectName="Aspen" status="disqualified" suppressedReason="chain" />)
    fireEvent.click(screen.getByRole('button', { name: 'Not a chain' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(actions.clearChain).not.toHaveBeenCalled()

    actions.clearChain.mockResolvedValueOnce({ ok: false, reason: 'not_flagged' } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Not a chain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not flagged as a chain')
  })

  it('an overridden row says so and offers no button; a read-only (merged / customer) row offers none either', () => {
    const { container } = render(
      <FitCard
        verification={{ fit: { ...FLAGGED.fit, chainOverride: { status: 'not_a_chain', detail: 'Marked "not a chain" by hand — never flagged again', checkedAt: AT, source: 'owner' } } }}
        signals={null}
        prospectId="pros_1"
        prospectName="Aspen"
        status="contacted"
        suppressedReason={null}
      />,
    )
    expect(screen.getByText('Not a chain (by hand)')).toBeTruthy()
    expect(container.querySelector('[data-not-a-chain]')).toBeNull()
    expect(container.querySelector('[data-fit-signal="chainOverride"]')?.textContent).toContain('you · Nov 10, 2026 · 09:05 UTC')
    cleanup()
    render(<FitCard verification={FLAGGED} signals={null} prospectId="pros_1" prospectName="Aspen" status="disqualified" suppressedReason="chain" readOnly />)
    expect(screen.queryByRole('button', { name: 'Not a chain' })).toBeNull()
  })

  it('a row that merely CARRIES the signal (a customer, a row that said no) reads "noted — kept where it is" with no button; only a row set aside offers "Not a chain" (E.6)', () => {
    const noted = { fit: { chain: { status: 'shared_phone', detail: "Shares its phone number with 2 other practices at different addresses — a chain; we'll target chains later", checkedAt: AT, source: 'our_data', kind: 'shared_phone', count: 3 } } }
    const { container } = render(<FitCard verification={noted} signals={null} prospectId="p" prospectName="Smile" status="not_interested" suppressedReason={null} />)
    expect(screen.getByText('Chain signal noted — kept where it is')).toBeTruthy()
    expect(screen.queryByText('Chain — set aside')).toBeNull()
    expect(container.querySelector('[data-fit-reason]')?.textContent).toMatch(/Shares its phone number/)
    expect(container.querySelector('[data-not-a-chain]')).toBeNull()
    cleanup()
    const r2 = render(<FitCard verification={noted} signals={null} prospectId="p" prospectName="Smile" status="disqualified" suppressedReason="chain" />)
    expect(screen.getByText('Chain — set aside')).toBeTruthy()
    expect(r2.container.querySelector('[data-not-a-chain]')).toBeTruthy()
    cleanup()
    // A signal the sweep CLEARED is not a chain at all.
    const cleared = { fit: { chain: { ...noted.fit.chain, status: 'cleared', clearedAt: AT } } }
    const r3 = render(<FitCard verification={cleared} signals={null} prospectId="p" prospectName="Smile" status="contacted" suppressedReason={null} />)
    expect(screen.queryByText('Chain signal noted — kept where it is')).toBeNull()
    expect(r3.container.querySelector('[data-fit-signal="chain"]')?.textContent).toContain('Cleared')
  })

  it('no stack is the opportunity; an older crawl is honest; nothing read is honest (no "coming soon")', () => {
    const { container } = render(
      <FitCard verification={{ fit: { dso: { status: 'none', detail: 'Not on the DSO / chain list', checkedAt: AT, source: 'dso_list' } } }} signals={{ ...SIGNALS, stack: [], builder: null }} prospectId="p" prospectName="Smile" status="enriched" suppressedReason={null} />,
    )
    expect(screen.getByText('Not a chain')).toBeTruthy()
    expect(container.querySelector('[data-fit-signal="stack"]')?.textContent).toContain('None')
    expect(container.querySelector('[data-fit-signal="builder"]')?.textContent).toContain('Custom / unknown')
    cleanup()
    const { stack: _s, ...older } = SIGNALS
    const r2 = render(<FitCard verification={null} signals={older as ProspectCrawlSignals} prospectId="p" prospectName="Smile" status="enriched" suppressedReason={null} />)
    expect(r2.container.querySelector('[data-fit-signal="stack"]')?.textContent).toContain('Not read')
    expect(screen.getByText('Fit not checked yet')).toBeTruthy()
    cleanup()
    const r3 = render(<FitCard verification={null} signals={null} prospectId="p" prospectName="Smile" status="enriched" suppressedReason={null} />)
    expect(r3.container.textContent).toContain('Nothing read yet')
    expect(r3.container.textContent).not.toMatch(/coming soon/i)
  })

  it('V13: "Not read" says why — robots.txt refused us (never "Re-enrich reads it"), the site did not answer (Re-enrich tries again), or an older crawl; an unread crawl claims no builder', () => {
    const pill = (c: HTMLElement) => c.querySelector('[data-fit-signal="stack"] [title]') as HTMLElement | null
    const robots = render(
      <FitCard verification={null} signals={{ ...SIGNALS, stack: null, builder: null, error: 'robots_disallow' }} prospectId="p" prospectName="Smile" status="enriched" suppressedReason={null} />,
    )
    expect(pill(robots.container)?.textContent).toBe('Not read')
    expect(pill(robots.container)?.getAttribute('title')).toBe('Their robots.txt refuses crawlers — we never read the page')
    expect(pill(robots.container)?.getAttribute('title')).not.toMatch(/Re-enrich/)
    expect(robots.container.querySelector('[data-fit-signal="builder"]')).toBeNull()
    cleanup()
    const failed = render(
      <FitCard verification={null} signals={{ ...SIGNALS, stack: null, builder: null, error: 'fetch_failed' }} prospectId="p" prospectName="Smile" status="enriched" suppressedReason={null} />,
    )
    expect(pill(failed.container)?.getAttribute('title')).toBe('The site did not answer when we looked — Re-enrich tries again')
    expect(failed.container.querySelector('[data-fit-signal="builder"]')).toBeNull()
    cleanup()
    const { stack: _s, ...older } = SIGNALS
    const old = render(<FitCard verification={null} signals={older as ProspectCrawlSignals} prospectId="p" prospectName="Smile" status="enriched" suppressedReason={null} />)
    expect(pill(old.container)?.getAttribute('title')).toBe('An older crawl — Re-enrich reads the stack')
    expect(old.container.querySelector('[data-fit-signal="builder"]')).toBeTruthy()
    expect(unreadStackTitle(undefined)).toBe('An older crawl — Re-enrich reads the stack')
    expect(unreadStackTitle('robots_disallow')).toMatch(/never read the page/)
    expect(unreadStackTitle('fetch_failed')).toMatch(/did not answer/)
  })
})

function detail(over: Partial<ProspectDetail['prospect']> = {}): ProspectDetail {
  return {
    prospect: {
      id: 'pros_1',
      name: 'Aspen Dental of Austin',
      status: 'disqualified',
      suppressedReason: 'chain',
      addressLine1: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      phone: '5125551212',
      email: null,
      websiteUrl: null,
      verification: FLAGGED,
      enrichment: SIGNALS,
      ...over,
    } as ProspectDetail['prospect'],
    contacts: [],
    touches: [],
    events: [],
    calls: [],
    assignedCaller: null,
    mergedInto: null,
    duplicates: [],
  }
}

describe('the drawer', () => {
  it('carries the Chain pill in its header and the Fit card with the builder in words', () => {
    const { container } = render(<ProspectDrawer detail={detail()} closeHref="/platform/prospecting" />)
    expect(screen.getAllByText('Chain').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-fit-card]')).toBeTruthy()
    expect(container.querySelector('[data-not-a-chain]')).toBeTruthy()
    // The Online presence row speaks the label, never the key.
    expect(container.textContent).toContain('Wix')
    expect(container.textContent).not.toMatch(/\bwix\b/)
  })
})

describe('the hunt panel', () => {
  const stats: HuntStats = { sinceIso: AT, sent24h: 0, dryRun24h: 0, opens24h: 0, clicks24h: 0, replies24h: 0, newCallList24h: 0, autoEnrolledToday: 0, hottest: [] }
  const config = { ...PROSPECTING_DEFAULTS, killSwitch: false }
  const env = { senderConfigured: true, gmailConfigured: false }
  const quality = { best: 1, good: 2, weak: 3, parked: 4, unverified: 5, bestInQueue: 1, scoreBuckets: Array.from({ length: 21 }, () => 0) }

  it('"Chains removed: N" and "Refreshing TX 787 early — 3 closed practices this month", UTC stamped', () => {
    const { container } = render(
      <HuntPanel
        stats={stats}
        config={config}
        env={env}
        quality={quality}
        hygiene={{ mergedToday: 0, resting: 0, lastRefresh: null, chainsRemoved: 7, chainsRestoredToday: 2, earlyRefresh: { state: 'TX', zipPrefix: '787', reason: '2 closed, 1 disconnected this month', at: new Date('2026-11-10T06:05:00Z') } }}
      />,
    )
    expect(screen.getByText('Chains removed')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(container.textContent).toContain('2 restored today')
    const line = container.querySelector('[data-early-refresh]')!
    expect(line.textContent).toContain('Refreshing TX 787 early — 2 closed, 1 disconnected this month')
    expect(line.textContent).toContain('Nov 10, 2026 · 06:05 UTC')
    // The warn ink is the registry's (J.2), never a local amber.
    for (const cls of TONE_TEXT.warn.split(' ')) expect(line.className).toContain(cls)
    expect(line.className).not.toContain('text-amber-700')
    expect(container.textContent).toContain('floor 70')
  })
  it('no line without a pull; no "restored" without a restore', () => {
    const { container } = render(<HuntPanel stats={stats} config={config} env={env} quality={quality} hygiene={{ mergedToday: 0, resting: 0, lastRefresh: null, chainsRemoved: 0, chainsRestoredToday: 0, earlyRefresh: null }} />)
    expect(container.querySelector('[data-early-refresh]')).toBeNull()
    expect(container.textContent).not.toContain('restored today')
  })
})

describe('the Verification card’s phone line (the two-source rule)', () => {
  const base = { status: 'well_formed', detail: 'Well-formed US number — the line check is off', checkedAt: AT, source: 'nanp' }
  it('names the sources that agree, says corroborated; a single source says what to do; a legacy row reads as before', () => {
    expect(phoneSourcesLine({ ...base, sources: ['nppes', 'places'], standing: 'corroborated', lineCheck: 'off' }, 'corroborated')).toBe('Stated by NPI registry, Google listing — corroborated')
    expect(phoneSourcesLine({ ...base, sources: ['places', 'carrier'], standing: 'corroborated', lineCheck: 'done' }, 'corroborated')).toBe('Stated by Google listing, carrier database — corroborated')
    expect(phoneSourcesLine({ ...base, sources: ['nppes'], standing: 'single_source', lineCheck: 'off' }, 'single_source')).toBe('Only one source lists this number — turn on the line check to confirm it (NPI registry)')
    expect(phoneSourcesLine({ ...base, sources: ['places'], standing: 'single_source', lineCheck: 'skipped' }, 'single_source')).toBe('Only one source lists this number (Google listing)')
    // The carrier alone (G.1): in service, but nobody has said it is this practice's number.
    expect(phoneSourcesLine({ ...base, sources: ['carrier'], standing: 'single_source', lineCheck: 'done' }, 'single_source')).toBe(CARRIER_ONLY_LINE)
    expect(CARRIER_ONLY_LINE).toBe("The line is in service — no source yet says it is this practice's number")
    expect(phoneSourcesLine(base, 'places')).toBe('Number from Google listing')
    expect(phoneSourcesLine(undefined, null)).toBeNull()
  })
  it('renders the line beside the phone signal', () => {
    const { container } = render(
      <VerificationCard
        verification={{ phone: { ...base, sources: ['nppes', 'places'], standing: 'corroborated', lineCheck: 'off' }, reviews: { status: 'stale', detail: 'Latest Google review Jan 2024 — no opening hours on the listing', checkedAt: AT, source: 'places', latestAt: '2024-01-01T00:00:00.000Z', hours: false } }}
        verifiedAt={AT}
        qualityScore={55}
        qualityBand="weak"
        qualityReasons={['Google shows no sign of life since Jan 2024']}
        phone="4045551212"
        phoneSource="corroborated"
        now={new Date(AT)}
      />,
    )
    expect(container.querySelector('[data-phone-sources]')?.textContent).toBe('Stated by NPI registry, Google listing — corroborated')
    expect(container.querySelector('[data-signal="reviews"]')?.textContent).toContain('Stale')
    expect(container.querySelector('[data-signal="reviews"]')?.textContent).toContain('Google Places · checked Nov 10, 2026 · 09:05 UTC')
    cleanup()
    // V2: a caller-provided row whose listing states another number — the
    // card shows the trace the verify pass wrote.
    const typed = render(
      <VerificationCard
        verification={{
          phone: {
            ...base,
            status: 'well_formed',
            detail: 'Well-formed US number — the line check is off; Google lists (404) 555-9999 — kept the number you typed',
            sources: ['caller'],
            standing: 'single_source',
            lineCheck: 'off',
            alt: { number: '4045559999', source: 'places', at: AT },
          },
        }}
        verifiedAt={AT}
        qualityScore={60}
        qualityBand="good"
        qualityReasons={[]}
        phone="4045550000"
        phoneSource="single_source"
        now={new Date(AT)}
      />,
    )
    expect(typed.container.querySelector('[data-signal="phone"]')?.textContent).toContain('Google lists (404) 555-9999 — kept the number you typed')
  })
})

describe('the settings slider', () => {
  it('shows the recommended floor beside the value', () => {
    const quality = { best: 1, good: 2, weak: 3, parked: 4, unverified: 5, bestInQueue: 1, scoreBuckets: Array.from({ length: 21 }, () => 0) }
    const { container } = render(<QualityFloor floor={60} quality={quality} />)
    expect(container.querySelector('[data-recommended-floor]')?.textContent).toBe('recommended: 70')
    expect(PROSPECTING_DEFAULTS.qualityFloor).toBe(70)
    expect(container.textContent).toContain('70 is the recommended line')
  })
})

describe('the sources', () => {
  const read = (p: string) => readFileSync(p, 'utf8')
  it('the table carries the Chains chip with its count, hidden by default like Merged; the list row carries the pill', () => {
    const page = read('app/(default)/platform/prospecting/page.tsx')
    expect(page).toContain('count={funnel.chains}')
    expect(page).toContain("chain: filters.chain ? undefined : '1'")
    expect(page).toContain(`p.suppressedReason === 'chain'`)
    const svc = read('lib/services/prospecting.ts')
    expect(svc).toContain("ne(schema.prospect.suppressedReason, 'chain')")
  })
  it('no raw <button>, no hand-rolled pill, every tone from the registry, every await through runAction', () => {
    for (const f of ['app/(default)/platform/prospecting/fit-card.tsx', 'app/(default)/platform/prospecting/not-a-chain-button.tsx', 'app/(default)/platform/prospecting/hunt-panel.tsx']) {
      const src = read(f)
      expect(src, f).not.toMatch(/<button/)
      expect(src, f).not.toMatch(/rounded-full[^"']*(bg-(rose|amber|emerald|teal|violet)-)/)
      for (const m of Array.from(src.matchAll(/tone="([a-z]+)"/g))) expect(Object.keys(TONE_PILL), `${f}: tone ${m[1]}`).toContain(m[1])
      expect(src).not.toMatch(/coming soon/i)
    }
    // The early-refresh line's ink comes from the registry (J.2).
    expect(read('app/(default)/platform/prospecting/hunt-panel.tsx')).not.toMatch(/text-amber-700/)
    const button = read('app/(default)/platform/prospecting/not-a-chain-button.tsx')
    expect(button).toContain('runAction(() => clearChainFlagAction(prospectId))')
    expect(button.indexOf('await confirm(')).toBeLessThan(button.indexOf('startTransition('))
  })
})
