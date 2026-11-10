import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * THE HYGIENE SURFACES (P-03): the drawer's duplicate card (confirm BEFORE
 * the transition, runAction, the survivor's door), the merged banner and
 * the resting note, the hunt panel's hygiene tile (UTC marked), the
 * settings clocks (ActionButton pending, runAction), and the status
 * vocabulary — every tone from the registry.
 */

const actions = vi.hoisted(() => ({
  merge: vi.fn(async (_a: string, _b: string) => ({ ok: true as const, survivorId: 'pros_survivor', loserId: 'pros_1' })),
  hygiene: vi.fn(async (_i: unknown) => ({ ok: true as const })),
  confirm: vi.fn(async (_opts?: unknown) => true),
}))
vi.mock('@/app/(default)/platform/prospecting/admin-actions', () => ({
  mergeProspectAction: actions.merge,
  updateHygieneAction: actions.hygiene,
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
  setQualityFloorAction: vi.fn(async () => ({ ok: true, floor: 60 })),
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/ui/use-focus-trap', () => ({ useFocusTrap: () => {} }))

import DuplicateCard from '@/app/(default)/platform/prospecting/duplicate-card'
import ProspectDrawer from '@/app/(default)/platform/prospecting/prospect-drawer'
import HuntPanel from '@/app/(default)/platform/prospecting/hunt-panel'
import SettingsPanel from '@/app/(default)/platform/prospecting/settings/settings-panel'
import { MERGE_REFUSAL_WORDS, PROSPECTING_DEFAULTS, PROSPECT_STATUS_LABELS, type DuplicateCandidate } from '@/lib/types/prospecting'
import { PROSPECT_STATUSES } from '@/lib/db/schema/prospecting'
import type { ProspectDetail, HuntStats } from '@/lib/services/prospecting'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const CANDIDATE: DuplicateCandidate = {
  id: 'pros_2',
  name: 'Smile Dental, P.C.',
  city: 'Atlanta',
  state: 'GA',
  status: 'enriched',
  qualityScore: 60,
  reasons: ['same phone', 'same name and ZIP'],
  exact: true,
}

function detail(over: Partial<ProspectDetail['prospect']> = {}, extra: Partial<ProspectDetail> = {}): ProspectDetail {
  return {
    prospect: {
      id: 'pros_1',
      name: 'Smile Dental PC',
      status: 'enriched',
      addressLine1: '123 Main St',
      city: 'Atlanta',
      state: 'GA',
      postalCode: '30309',
      phone: '4045551212',
      email: null,
      websiteUrl: null,
      ...over,
    } as ProspectDetail['prospect'],
    contacts: [],
    touches: [],
    events: [],
    calls: [],
    assignedCaller: null,
    mergedInto: null,
    duplicates: [],
    ...extra,
  }
}

describe('the vocabulary', () => {
  it('every status has a label — resting reads "Resting", merged reads "Merged"', () => {
    for (const s of PROSPECT_STATUSES) expect(PROSPECT_STATUS_LABELS[s], s).toBeTruthy()
    expect(PROSPECT_STATUS_LABELS.dormant).toBe('Resting')
    expect(PROSPECT_STATUS_LABELS.merged).toBe('Merged')
  })
})

describe('DuplicateCard', () => {
  it('says "Possible duplicate of <name> · <why>", with a door to the other row and registry tones', () => {
    const { container } = render(<DuplicateCard prospectId="pros_1" prospectName="Smile Dental PC" candidates={[CANDIDATE]} />)
    expect(screen.getByText('Possible duplicate of')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Smile Dental, P.C.' }).getAttribute('href')).toBe('/platform/prospecting?prospect=pros_2')
    expect(screen.getByText(/same phone · same name and ZIP/)).toBeTruthy()
    const tones = Array.from(container.querySelectorAll('[data-tone]')).map((e) => e.getAttribute('data-tone'))
    expect(tones).toEqual(['warn', 'ok', 'neutral'])
    expect(screen.getByText('Exact match')).toBeTruthy()
  })

  it('renders nothing with no candidates', () => {
    const { container } = render(<DuplicateCard prospectId="pros_1" prospectName="x" candidates={[]} />)
    expect(container.querySelector('[data-duplicate-card]')).toBeNull()
  })

  it('asks BEFORE merging, then merges through the action with both ids; a refusal is a no-op', async () => {
    actions.confirm.mockResolvedValueOnce(false)
    render(<DuplicateCard prospectId="pros_1" prospectName="Smile Dental PC" candidates={[CANDIDATE]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(actions.confirm).toHaveBeenCalledTimes(1))
    expect(actions.confirm.mock.calls[0][0]).toMatchObject({ title: 'Merge Smile Dental, P.C. with Smile Dental PC?', confirmLabel: 'Merge' })
    expect(actions.merge).not.toHaveBeenCalled()

    const assign = vi.fn()
    const loc = window.location
    Object.defineProperty(window, 'location', { value: { ...loc, assign }, writable: true, configurable: true })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
      await waitFor(() => expect(actions.merge).toHaveBeenCalledWith('pros_1', 'pros_2'))
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/platform/prospecting?prospect=pros_survivor'))
    } finally {
      Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true })
    }
  })

  it('a refused merge says why, in plain words — never a reason code', async () => {
    actions.merge.mockResolvedValueOnce({ ok: false, reason: 'both_converted' } as never)
    render(<DuplicateCard prospectId="pros_1" prospectName="Smile Dental PC" candidates={[CANDIDATE]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Both of these are clinics already'))
    expect(screen.getByRole('alert').textContent).not.toMatch(/[a-z]_[a-z]/)
    cleanup()
    // Every reason the service can return has words; an unknown one still does.
    for (const reason of ['not_found', 'same_row', 'already_merged', 'loser_converted', 'loser_terminal', 'both_converted']) {
      expect(MERGE_REFUSAL_WORDS[reason], reason).toMatch(/^[A-Z].*\.$/)
    }
    actions.merge.mockResolvedValueOnce({ ok: false, reason: 'something_new' } as never)
    render(<DuplicateCard prospectId="pros_1" prospectName="Smile Dental PC" candidates={[CANDIDATE]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not merge these two'))
  })
})

describe('ProspectDrawer', () => {
  it('a merged row says where it went, with a door, and offers no actions', () => {
    const { container } = render(
      <ProspectDrawer detail={detail({ status: 'merged', mergedIntoProspectId: 'pros_s' }, { mergedInto: { id: 'pros_s', name: 'Smile Dental' } })} closeHref="/platform/prospecting" />,
    )
    expect(container.querySelector('[data-merged-banner]')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Smile Dental' }).getAttribute('href')).toBe('/platform/prospecting?prospect=pros_s')
    expect(screen.queryByRole('button', { name: /Suppress/ })).toBeNull()
    expect(container.querySelector('[data-duplicate-card]')).toBeNull()
  })

  it('a merged row is a folded shell: no contact adds, no re-verify, no phone editor, no demo drafter', () => {
    const merged = detail(
      { status: 'merged', mergedIntoProspectId: 'pros_s', phone: '4045551212', demoBrief: { summary: 'x' } as never },
      {
        mergedInto: { id: 'pros_s', name: 'Smile Dental' },
        contacts: [
          { id: 'pcon_1', prospectId: 'pros_1', email: 'office@smile.com', name: null, role: 'office', source: 'crawl', verifyStatus: 'deliverable', isPrimary: 1 } as never,
        ],
      },
    )
    render(<ProspectDrawer detail={merged} closeHref="/" />)
    expect(screen.getByText('office@smile.com')).toBeTruthy() // shown…
    expect(screen.queryByRole('button', { name: '+ Add' })).toBeNull() // …not operable
    expect(screen.queryByRole('button', { name: /Re-verify/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove contact' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Pin/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Fix number|Add number/ })).toBeNull()
    expect(screen.queryByText('✨ Draft a follow-up')).toBeNull()
    cleanup()
    // The same record, live: the controls are there.
    render(<ProspectDrawer detail={detail({ phone: '4045551212', demoBrief: { summary: 'x' } as never }, { contacts: merged.contacts })} closeHref="/" />)
    expect(screen.getByRole('button', { name: '+ Add' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Fix number/ })).toBeTruthy()
    expect(screen.getByText('✨ Draft a follow-up')).toBeTruthy()
  })

  it('V12: a merged row mounts no caller section — no "Pick a caller", no Assign, no "Not with a caller" — even with an active caller on the roster', () => {
    const callers = [{ id: 'pcal_1', name: 'Jo Caller' }]
    render(<ProspectDrawer detail={detail({ status: 'merged', mergedIntoProspectId: 'pros_s' }, { mergedInto: { id: 'pros_s', name: 'Smile Dental' } })} closeHref="/" callers={callers} />)
    expect(screen.queryByText('Caller')).toBeNull()
    expect(screen.queryByText('Not with a caller')).toBeNull()
    expect(screen.queryByRole('button', { name: /Assign/ })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    cleanup()
    // A merged row that still names a holder (a merge the hook has not caught yet) shows no control either.
    render(<ProspectDrawer detail={detail({ status: 'merged' }, { mergedInto: { id: 'pros_s', name: 'Smile Dental' }, assignedCaller: { id: 'pcal_1', name: 'Jo Caller', status: 'active' } as never })} closeHref="/" callers={callers} />)
    expect(screen.queryByText('Caller')).toBeNull()
    expect(screen.queryByRole('button', { name: /Unassign|Assign/ })).toBeNull()
    cleanup()
    // The same record, live: the control is there.
    render(<ProspectDrawer detail={detail()} closeHref="/" callers={callers} />)
    expect(screen.getByText('Caller')).toBeTruthy()
    expect(screen.getByText('Not with a caller')).toBeTruthy()
  })

  it('the verification headline reads the live re-verify clock, not the shipped 60', () => {
    const verifiedAt = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000) // the card reads the real clock
    const base = { verifiedAt, qualityScore: 70, qualityBand: 'good', qualityReasons: [], verification: {} } as never
    render(<ProspectDrawer detail={detail(base)} closeHref="/" reverifyAfterDays={120} />)
    expect(screen.queryByText(/due for another look/)).toBeNull()
    cleanup()
    render(<ProspectDrawer detail={detail(base)} closeHref="/" reverifyAfterDays={14} />)
    expect(screen.getByText(/due for another look/)).toBeTruthy()
  })

  it('a resting row explains itself and where it wakes to; a live row with a candidate shows the card', () => {
    const { container } = render(<ProspectDrawer detail={detail({ status: 'dormant', dormantFromStatus: 'contacted' })} closeHref="/" />)
    expect(container.querySelector('[data-resting-note]')?.textContent).toContain('(Contacted)')
    cleanup()
    const { container: c2 } = render(<ProspectDrawer detail={detail({}, { duplicates: [CANDIDATE] })} closeHref="/" />)
    expect(c2.querySelector('[data-duplicate-card]')).toBeTruthy()
  })
})

describe('the status chips (V13)', () => {
  it('Resting and Merged clear the quality chip exactly as Call list and Converted do — the count is the rows listed', () => {
    const src = readFileSync('app/(default)/platform/prospecting/page.tsx', 'utf8')
    for (const status of ['call_list', 'converted', 'dormant', 'merged']) {
      const chip = src.match(new RegExp(`buildQuery\\(params, \\{ status: filters\\.status === '${status}' \\? undefined : '${status}'[^}]*\\}\\)`))
      expect(chip, status).toBeTruthy()
      expect(chip![0], status).toContain('quality: undefined')
    }
  })
})

describe('HuntPanel — the hygiene tile', () => {
  const stats: HuntStats = { sinceIso: '2026-11-09T12:00:00.000Z', sent24h: 0, dryRun24h: 0, opens24h: 0, clicks24h: 0, replies24h: 0, newCallList24h: 0, autoEnrolledToday: 0, hottest: [] }
  const config = { ...PROSPECTING_DEFAULTS, killSwitch: false }
  const env = { senderConfigured: true, gmailConfigured: false }
  const quality = { best: 1, good: 2, weak: 3, parked: 4, unverified: 5, bestInQueue: 1, scoreBuckets: Array.from({ length: 21 }, () => 0) }

  it('"Merged 3 · Resting 41 · Refreshed TX 787xx" with the refresh stamp marked UTC', () => {
    const { container } = render(
      <HuntPanel stats={stats} config={config} env={env} quality={quality} hygiene={{ mergedToday: 3, resting: 41, lastRefresh: { state: 'TX', zipPrefix: '787', at: new Date('2026-11-10T06:05:00Z') } }} />,
    )
    const tile = container.querySelector('[data-hygiene-tile]')!
    expect(tile.textContent).toContain('Merged 3 · Resting 41 · Refreshed TX 787xx')
    expect(tile.textContent).toContain('Nov 10, 2026 · 06:05 UTC')
    // Not a heartbeat — the metrics suite counts those.
    expect(container.querySelector('[data-hygiene-tile] [data-heartbeat-line]')).toBeNull()
  })

  it('is honest before the first refresh — naming the LIVE refresh clock — and absent without the stats', () => {
    const { container } = render(
      <HuntPanel stats={stats} config={{ ...config, hygiene: { ...config.hygiene, discoveryRefreshDays: 90 } }} env={env} quality={quality} hygiene={{ mergedToday: 0, resting: 0, lastRefresh: null }} />,
    )
    expect(container.querySelector('[data-hygiene-tile]')?.textContent).toContain('No territory refreshed yet')
    expect(container.querySelector('[data-hygiene-tile]')?.textContent).toContain('once it is 90 days old')
    expect(container.querySelector('[data-hygiene-tile]')?.textContent).not.toContain('30 days')
    cleanup()
    const { container: c2 } = render(<HuntPanel stats={stats} config={config} env={env} quality={quality} hygiene={null} />)
    expect(c2.querySelector('[data-hygiene-tile]')).toBeNull()
  })
})

describe('SettingsPanel — the hygiene clocks', () => {
  const props = {
    config: { ...PROSPECTING_DEFAULTS },
    progress: [],
    usage: { placesUsed: 0, crawlsUsed: 0, aiUsed: 0, phoneValidateUsed: 0 },
    env: { senderConfigured: false, gmailConfigured: false, placesConfigured: false, phoneDriver: 'none' as const, phoneValidateRefusedToday: false },
    autoEnrolledToday: 0,
    quality: { best: 0, good: 0, weak: 0, parked: 0, unverified: 0, bestInQueue: 0, scoreBuckets: Array.from({ length: 21 }, () => 0) },
  }

  it('shows both clocks at their defaults, saves only once dirty, through the action', async () => {
    const { container } = render(<SettingsPanel {...props} />)
    const section = container.querySelector('[data-hygiene-knobs]')!
    const stale = screen.getByLabelText(/Rest after/) as HTMLInputElement
    const reverify = screen.getByLabelText(/Re-verify after/) as HTMLInputElement
    expect(stale.value).toBe('90')
    expect(reverify.value).toBe('60')
    const save = screen.getByRole('button', { name: 'Save the clocks' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(stale, { target: { value: '120' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await waitFor(() => expect(actions.hygiene).toHaveBeenCalledWith({ staleAfterDays: 120, reverifyAfterDays: 60 }))
    await waitFor(() => expect(section.textContent).toContain('Saved ✓'))
    expect(section.textContent).toContain('re-checked every 30 days')
    // The cadence is the engine tick, not a nightly job.
    expect(section.textContent).toContain('about every half hour')
    expect(section.textContent).not.toMatch(/every night/i)
  })

  it('a clock whose first digit is under 7 can be typed ("30" is 30, not 70); an out-of-range value is refused in words at save', async () => {
    render(<SettingsPanel {...props} />)
    const stale = screen.getByLabelText(/Rest after/) as HTMLInputElement
    fireEvent.change(stale, { target: { value: '3' } })
    expect(stale.value).toBe('3')
    fireEvent.change(stale, { target: { value: '30' } })
    expect(stale.value).toBe('30')
    fireEvent.click(screen.getByRole('button', { name: 'Save the clocks' }))
    await waitFor(() => expect(actions.hygiene).toHaveBeenCalledWith({ staleAfterDays: 30, reverifyAfterDays: 60 }))

    fireEvent.change(stale, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the clocks' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('from 7 to 730'))
    expect(actions.hygiene).toHaveBeenCalledTimes(1)
  })
})
