import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The quality surfaces, the fix pass (P-01): the hunt panel's banner speaks
 * the registry's tones (C3); the refused-dial copy's door exists — the
 * drawer carries a phone editor (C11); the floor slider never disables
 * itself mid-adjust (C12); the legend reads the live floor (C19); the
 * session tally uses the plain labels (C20).
 */

const { phoneMock, floorMock, floorSaves, logMock, toastMock } = vi.hoisted(() => {
  // Each floor save is held open until the test releases it (React 19
  // entangles async transitions, so an unreleased one would keep every later
  // transition in the file pending too).
  const floorSaves: Array<(v: { ok: true; floor: number }) => void> = []
  return {
    phoneMock: vi.fn(async (_id: string, _phone: string): Promise<{ ok: true; phone: string } | { ok: false; reason: string }> => ({ ok: true, phone: '4045559999' })),
    floorMock: vi.fn((_floor: number) => new Promise<{ ok: true; floor: number }>((resolve) => floorSaves.push(resolve))),
    floorSaves,
    logMock: vi.fn(async () => {}),
    toastMock: vi.fn(),
  }
})
vi.mock('@/app/(default)/platform/prospecting/admin-actions', () => ({
  updateProspectPhoneAction: phoneMock,
  setQualityFloorAction: floorMock,
  logCallOutcomeAction: logMock,
  getCallScriptAction: vi.fn(async () => null),
  bookDemoForProspectAction: vi.fn(async () => ({ ok: true })),
  practiceReplyAction: vi.fn(async () => ({})),
  practiceFeedbackAction: vi.fn(async () => ({})),
  setKillSwitchAction: vi.fn(async () => {}),
  setDryRunAction: vi.fn(async () => {}),
  toggleStateAction: vi.fn(async () => {}),
  updateAutoEnrollAction: vi.fn(async () => {}),
  setDigestEnabledAction: vi.fn(async () => {}),
  setWatchdogEnabledAction: vi.fn(async () => {}),
  setBookingEnabledAction: vi.fn(async () => {}),
  updateBrainAction: vi.fn(async () => {}),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => toastMock }))

import HuntPanel from '@/app/(default)/platform/prospecting/hunt-panel'
import PhoneEditor from '@/app/(default)/platform/prospecting/phone-editor'
import { QualityFloor } from '@/app/(default)/platform/prospecting/settings/settings-panel'
import { qualityLegend, bandServedAt, QUALITY_LEGEND } from '@/app/(default)/platform/prospecting/quality-pills'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'
import CallSession from '@/app/(default)/platform/prospecting/call-mode/call-session'
import { TONE_PILL } from '@/lib/ui/encodings'
import { callWindowScore } from '@/lib/prospect-when'
import type { CallQueueItem } from '@/lib/services/prospecting'

afterEach(() => {
  cleanup()
  phoneMock.mockClear()
  floorMock.mockClear()
  logMock.mockClear()
  toastMock.mockClear()
})

describe('C3 — the verification-failures banner is the registry’s warn pill', () => {
  it('carries every class of TONE_PILL.warn and no hand-rolled wash/ink pair', () => {
    const stats = { sent24h: 0, dryRun24h: 0, opens24h: 0, clicks24h: 0, replies24h: 0, newCallList24h: 0, autoEnrolledToday: 0, hottest: [] } as never
    const config = { killSwitch: false, dryRun: false, watchdog: { trippedAt: null }, autoEnroll: { enabled: false }, qualityFloor: 60 } as never
    const { container } = render(
      <HuntPanel
        stats={stats}
        config={config}
        env={{ senderConfigured: true, gmailConfigured: false }}
        failures={[{ summary: 'Google refused the Places key', occurredAt: new Date('2026-11-10T09:05:00Z') }]}
      />,
    )
    const banner = container.querySelector('[data-verification-failures]') as HTMLElement
    expect(banner).toBeTruthy()
    for (const cls of TONE_PILL.warn.split(' ')) expect(banner.classList.contains(cls)).toBe(true)
    expect(banner.className).not.toMatch(/text-amber-200|bg-amber-500\/10/)
    expect(screen.getByText(/Google refused the Places key/)).toBeTruthy()
  })
})

describe('C11 — the refused-dial copy names a door that exists', () => {
  it('the drawer carries the phone editor the call card points at', () => {
    const drawer = readFileSync(resolve(process.cwd(), 'app/(default)/platform/prospecting/prospect-drawer.tsx'), 'utf8')
    expect(drawer).toMatch(/<PhoneEditor prospectId=\{p\.id\} phone=\{p\.phone\} \/>/)
    const card = readFileSync(resolve(process.cwd(), 'app/(default)/platform/prospecting/call-list/call-card.tsx'), 'utf8')
    expect(card).toMatch(/the right number from the drawer/)
  })

  it('opens on "Fix number", saves through the action, says so, and closes', async () => {
    render(<PhoneEditor prospectId="pros_1" phone="4045551212" />)
    fireEvent.click(screen.getByRole('button', { name: /Fix number/ }))
    const input = screen.getByLabelText('Phone number') as HTMLInputElement
    expect(input.value).toBe('(404) 555-1212')
    fireEvent.change(input, { target: { value: '(404) 555-9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(phoneMock).toHaveBeenCalledWith('pros_1', '(404) 555-9999'))
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.stringMatching(/\(404\) 555-9999 is the dial target again/)))
    await waitFor(() => expect(screen.queryByLabelText('Phone number')).toBeNull())
  })

  it('a number that cannot ring is refused in plain words, and the editor stays open', async () => {
    phoneMock.mockResolvedValueOnce({ ok: false, reason: 'fictional_555' })
    render(<PhoneEditor prospectId="pros_1" phone={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Add number/ }))
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '(404) 555-0100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('555-01xx numbers are reserved for fiction')
    expect(screen.getByLabelText('Phone number')).toBeTruthy()
    expect(toastMock).not.toHaveBeenCalled()
  })
})

describe('C12 — the floor slider never disables itself mid-adjust, and saves are serialized', () => {
  const quality = { best: 1, good: 2, weak: 3, parked: 4, unverified: 5, bestInQueue: 1, scoreBuckets: Array.from({ length: 21 }, () => 0) }

  it('stays enabled while the save is pending, keeps taking input, and says "Saving"', async () => {
    render(<QualityFloor floor={60} quality={quality} />)
    const slider = screen.getByRole('slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '65' } })
    expect(slider.value).toBe('65')
    await waitFor(() => expect(floorMock).toHaveBeenCalledWith(65), { timeout: 2000 })
    // The save is in flight (the mock never settles): still a live control.
    expect(screen.getByText('Saving')).toBeTruthy()
    expect(slider.disabled).toBe(false)
    expect(slider.getAttribute('aria-busy')).toBe('true')
    fireEvent.change(slider, { target: { value: '70' } })
    expect(slider.value).toBe('70')
    expect(slider.disabled).toBe(false)
    // The second value waits behind the first: ONE save in flight.
    await new Promise((r) => setTimeout(r, 600))
    expect(floorMock).toHaveBeenCalledTimes(1)
    floorSaves.splice(0).forEach((release) => release({ ok: true, floor: 65 }))
    await waitFor(() => expect(floorMock).toHaveBeenCalledWith(70), { timeout: 2000 })
    for (const release of floorSaves.splice(0)) release({ ok: true, floor: 70 })
    await waitFor(() => expect(screen.getByText('Saved ✓')).toBeTruthy())
  })

  it('an older value can never land after a newer one: the queued value is the LATEST, sent only once the in-flight save settles, and "Saved ✓" means the value on the slider', async () => {
    render(<QualityFloor floor={60} quality={quality} />)
    const slider = screen.getByRole('slider') as HTMLInputElement
    // ArrowRight 60→65: save A fires after the debounce.
    fireEvent.change(slider, { target: { value: '65' } })
    await waitFor(() => expect(floorMock).toHaveBeenCalledWith(65), { timeout: 2000 })
    // Two more steps while A is in flight: 70 is overtaken by 75 before
    // anything is sent — 70 is never sent at all.
    fireEvent.change(slider, { target: { value: '70' } })
    await new Promise((r) => setTimeout(r, 500))
    fireEvent.change(slider, { target: { value: '75' } })
    await new Promise((r) => setTimeout(r, 600))
    expect(floorMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Saving')).toBeTruthy()
    // A settles (with 65): only now does the latest value go out.
    floorSaves.splice(0).forEach((release) => release({ ok: true, floor: 65 }))
    await waitFor(() => expect(floorMock).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(floorMock.mock.calls.map((c) => c[0])).toEqual([65, 75])
    // Between the two saves the note is honest: not "Saved ✓" for 75.
    expect(screen.queryByText('Saved ✓')).toBeNull()
    floorSaves.splice(0).forEach((release) => release({ ok: true, floor: 75 }))
    await waitFor(() => expect(screen.getByText('Saved ✓')).toBeTruthy())
    expect(slider.value).toBe('75')
  })

  it('the counts beside the slider say what is SERVED: at or above the floor, below it, and the parked rows that are never served', () => {
    const buckets = Array.from({ length: 21 }, () => 0)
    buckets[13] = 3 // 65–69 (servable)
    buckets[17] = 2 // 85–89
    render(<QualityFloor floor={70} quality={{ ...quality, parked: 9, scoreBuckets: buckets }} />)
    const slider = screen.getByRole('slider') as HTMLInputElement
    expect(slider.getAttribute('aria-valuetext')).toBe('70 — 2 prospects served at or above, 3 below the floor, 9 parked')
    expect(screen.getByText('served at or above').previousSibling?.textContent ?? screen.getByText('served at or above').textContent).toContain('2')
    expect(screen.getByText(/parked — never served/)).toHaveTextContent('9')
  })
})

describe('C19 — the legend reads the live floor', () => {
  it('says which bands the floor actually serves', () => {
    expect(bandServedAt('weak', 40)).toBe('served (floor 40)')
    expect(bandServedAt('weak', 60)).toBe('under the floor of 60 — not served')
    expect(bandServedAt('good', 85)).toBe('under the floor of 85 — not served')
    expect(bandServedAt('best', 85)).toBe('served only from 85 up')
    expect(bandServedAt('parked', 0)).toBe('not served at any floor')
    const at40 = qualityLegend(40)
    expect(at40.map((l) => l.label)).toEqual(['Best', 'Good', 'Weak', 'Parked'])
    expect(at40.find((l) => l.label === 'Weak')!.meaning).toMatch(/served \(floor 40\)/)
    expect(at40.find((l) => l.label === 'Weak')!.meaning).not.toMatch(/under the floor/)
    const at85 = qualityLegend(85)
    expect(at85.find((l) => l.label === 'Good')!.meaning).toMatch(/under the floor of 85 — not served/)
    expect(at85.find((l) => l.label === 'Parked')!.meaning).toMatch(/not served at any floor/)
    // The default-floor export is the same function at the shipped default
    // (70 since P-04).
    expect(QUALITY_LEGEND).toEqual(qualityLegend(PROSPECTING_DEFAULTS.qualityFloor))
    expect(QUALITY_LEGEND).toEqual(qualityLegend(70))
  })
})

describe('C20 — the end-of-session tally uses the plain labels', () => {
  function item(over: Partial<CallQueueItem> = {}): CallQueueItem {
    return {
      id: 'pros_1',
      name: 'Smile Dental',
      city: 'Atlanta',
      state: 'GA',
      phone: '4045551212',
      timezone: 'America/New_York',
      authorizedOfficialName: 'Jane Doe',
      scoreBand: 'hot',
      reviewCount: 20,
      googleRatingTenths: 47,
      websiteUrl: null,
      intentSignal: null,
      intentSummary: null,
      talkingPoints: [],
      followUpReason: null,
      lastCallOutcome: null,
      source: 'phone_first',
      opens: 0,
      clicks: 0,
      callWindow: callWindowScore('America/New_York', new Date('2026-11-10T15:00:00Z')),
      phoneStatus: 'valid',
      phoneLineType: 'landline',
      qualityScore: 85,
      qualityBand: 'best',
      ...over,
    }
  }

  it('"Reached the desk" and "Practice closed / retired" — never "Gatekeeper" or "Closed"', async () => {
    // Transitions settle slowly under a loaded suite — every wait is generous.
    const slow = { timeout: 8000 }
    const { container } = render(<CallSession items={[item(), item({ id: 'pros_2', name: 'Bright Smiles' })]} />)
    fireEvent.keyDown(window, { key: '9' })
    await waitFor(() => expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ prospectId: 'pros_1', outcome: 'gatekeeper' })), slow)
    await waitFor(() => expect(screen.getByText('Bright Smiles')).toBeTruthy(), slow)
    // The transition's pending flag settles only OUTSIDE act (waitFor wraps
    // its callback in act, where the flip never flushes) — poll with real
    // timers until the dock comes back, then log the second call.
    const closedButton = () => screen.getByRole('button', { name: /Practice closed/ }) as HTMLButtonElement
    for (let i = 0; i < 80 && closedButton().disabled; i++) await new Promise((r) => setTimeout(r, 100))
    expect(closedButton().disabled).toBe(false)
    fireEvent.click(closedButton())
    await waitFor(() => expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ prospectId: 'pros_2', outcome: 'closed' })), slow)
    const desk = await waitFor(() => {
      const row = container.querySelector('[data-tally-row="gatekeeper"]')
      if (!row) throw new Error('not done yet')
      return row
    }, slow)
    expect(desk.textContent).toContain('Reached the desk')
    expect(desk.textContent).toContain('1')
    const closed = container.querySelector('[data-tally-row="closed"]')!
    expect(closed.textContent).toContain('Practice closed / retired')
    expect(container.textContent).not.toMatch(/\bGatekeeper\b/)
  })
})
