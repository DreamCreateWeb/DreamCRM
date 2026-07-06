import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

/**
 * Presenter mode — the guard contract (skin renders ONLY for platform
 * admin + demo mode; junk cookies die in the parser), the beats registry,
 * talk-track substitution, and the panel's keyboard-driven flow. Zero DB
 * writes anywhere in this feature.
 */

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}))

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// The panel's End-demo form posts this server action — stub the whole
// module so the test never drags in db/auth.
const { endWithOutcomeMock } = vi.hoisted(() => ({
  endWithOutcomeMock: vi.fn(async () => ({ ok: true, to: '/platform/prospecting/call-list?highlight=pros_1' })),
}))
vi.mock('@/app/(default)/ecommerce/customers/admin-actions', () => ({
  endBrandedDemoAction: vi.fn(),
  endBrandedDemoWithOutcomeAction: endWithOutcomeMock,
  exitDemoMode: vi.fn(),
}))

import { readDemoSkin, parseDemoSkin } from '@/lib/demo-skin'
import { DEMO_BEATS, DEMO_TRACKS, renderTalkTrack } from '@/lib/types/demo-script'
import PresenterPanel from '@/components/demo/presenter-panel'

const SKIN = JSON.stringify({ prospectId: 'pros_1', clinicName: 'Lone Star Dental', city: 'Dallas' })

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  cookieGet.mockReturnValue({ value: SKIN })
})

describe('readDemoSkin guards', () => {
  it('renders only for platform admin INSIDE demo mode', async () => {
    expect(await readDemoSkin({ isDemo: true, platformAdmin: true })).toMatchObject({
      clinicName: 'Lone Star Dental',
    })
    // A stale cookie must never brand a real clinic or leak to non-admins.
    expect(await readDemoSkin({ isDemo: false, platformAdmin: true })).toBeNull()
    expect(await readDemoSkin({ isDemo: true, platformAdmin: false })).toBeNull()
  })

  it('junk cookies die in the parser', () => {
    expect(parseDemoSkin('not json')).toBeNull()
    expect(parseDemoSkin('{}')).toBeNull()
    expect(parseDemoSkin(JSON.stringify({ prospectId: 'x', clinicName: '' }))).toBeNull()
    // Bad optional fields are dropped, not fatal.
    const skin = parseDemoSkin(
      JSON.stringify({
        prospectId: 'pros_1',
        clinicName: 'Smile Co',
        brandColor: 'javascript:alert(1)',
        logoUrl: 'http://insecure.example/logo.png',
      }),
    )
    expect(skin).toMatchObject({ clinicName: 'Smile Co' })
    expect(skin!.brandColor).toBeUndefined()
    expect(skin!.logoUrl).toBeUndefined()
  })

  it('parses the presenter-depth fields (websiteUrl, weaknesses, officialFirstName)', () => {
    const skin = parseDemoSkin(
      JSON.stringify({
        prospectId: 'pros_1',
        clinicName: 'Smile Co',
        websiteUrl: 'https://smileco.com',
        weaknesses: ['No online booking today', '', 42, 'x'.repeat(120), 'a', 'b', 'c'],
        officialFirstName: '  Maria  ',
      }),
    )
    expect(skin!.websiteUrl).toBe('https://smileco.com')
    expect(skin!.weaknesses).toHaveLength(4) // capped, junk filtered
    expect(skin!.weaknesses![1]).toHaveLength(80) // long entries truncated
    expect(skin!.officialFirstName).toBe('Maria')
    // track: valid ids survive, junk is dropped
    expect(
      parseDemoSkin(JSON.stringify({ prospectId: 'p', clinicName: 'X', track: 'website' }))!.track,
    ).toBe('website')
    expect(
      parseDemoSkin(JSON.stringify({ prospectId: 'p', clinicName: 'X', track: 'nonsense' }))!.track,
    ).toBeUndefined()
    // http website dropped
    expect(
      parseDemoSkin(
        JSON.stringify({ prospectId: 'p', clinicName: 'X', websiteUrl: 'http://x.com' }),
      )!.websiteUrl,
    ).toBeUndefined()
  })
})

describe('demo script registry', () => {
  it('every beat has a title, a two-line talk track, and a real dashboard href', () => {
    expect(DEMO_BEATS.length).toBeGreaterThanOrEqual(5)
    for (const beat of DEMO_BEATS) {
      expect(beat.title.length).toBeGreaterThan(2)
      expect(beat.talkTrack.length).toBeGreaterThan(20)
      expect(beat.href.startsWith('/')).toBe(true)
    }
  })

  it('talk tracks substitute the skin (and degrade without one)', () => {
    expect(renderTalkTrack('Welcome to {clinicName} in {city}.', { clinicName: 'Lone Star', city: 'Dallas' }))
      .toBe('Welcome to Lone Star in Dallas.')
    expect(renderTalkTrack('Welcome to {clinicName}.', null)).toBe('Welcome to this practice.')
  })
})

const FULL_SKIN = {
  prospectId: 'pros_1',
  clinicName: 'Lone Star Dental',
  city: 'Dallas',
  officialFirstName: 'Maria',
  websiteUrl: 'https://lonestardental.com',
  weaknesses: ['No online booking today', 'Footer says 2019'],
}

describe('PresenterPanel v3', () => {
  it('shows the branded header, group label, first beat; Next advances via router.push', () => {
    render(<PresenterPanel skin={FULL_SKIN} />)
    expect(screen.getByText(/Presenting to Lone Star Dental/)).toBeTruthy()
    expect(screen.getByText(`1. ${DEMO_BEATS[0].title}`)).toBeTruthy()
    expect(screen.getByText(/Open · beat 1 of/)).toBeTruthy()

    fireEvent.click(screen.getByText('Next →'))
    expect(pushMock).toHaveBeenCalledWith(DEMO_BEATS[1].href)
    expect(screen.getByText(`2. ${DEMO_BEATS[1].title}`)).toBeTruthy()
  })

  it('keyboard drive: n advances, ArrowLeft back, digits jump, Esc collapses (timer pill stays)', () => {
    render(<PresenterPanel skin={null} />)
    fireEvent.keyDown(window, { key: 'n' })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[1].href)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[0].href)
    // Digit jump — straight to the last beat.
    fireEvent.keyDown(window, { key: String(DEMO_BEATS.length) })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[DEMO_BEATS.length - 1].href)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('presenter-panel')).toBeNull()
    expect(screen.getByText(/🎬/)).toBeTruthy() // collapsed pill remains
  })

  it('never steals keys from form fields', () => {
    render(
      <div>
        <input aria-label="field" />
        <PresenterPanel skin={null} />
      </div>,
    )
    const input = screen.getByLabelText('field')
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: '3' })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('visited beats + current index persist to sessionStorage (no DB anywhere)', () => {
    render(<PresenterPanel skin={null} />)
    fireEvent.click(screen.getByText('Next →'))
    const stored = JSON.parse(sessionStorage.getItem('dc.demo-visited-beats') ?? '[]') as string[]
    expect(stored).toContain(DEMO_BEATS[1].id)
    expect(sessionStorage.getItem('dc.demo-beat-index')).toBe('1')
  })

  it('gap callouts inline only on the beat they map to', () => {
    render(<PresenterPanel skin={FULL_SKIN} />)
    // Beat 1 (huddle): no gaps mapped there.
    expect(screen.queryByText(/No online booking today/)).toBeNull()
    // Jump to the appointments beat — its gap appears.
    const apptIndex = DEMO_BEATS.findIndex((b) => b.id === 'appointments')
    fireEvent.keyDown(window, { key: String(apptIndex + 1) })
    expect(screen.getByText(/No online booking today/)).toBeTruthy()
    expect(screen.queryByText(/Footer says 2019/)).toBeNull() // website gap stays on website
  })

  it('talk tracks substitute {firstName} and the compare beat exists', () => {
    render(<PresenterPanel skin={FULL_SKIN} />)
    const compareIndex = DEMO_BEATS.findIndex((b) => b.id === 'compare')
    expect(compareIndex).toBeGreaterThan(0)
    fireEvent.keyDown(window, { key: String(compareIndex + 1) })
    expect(pushMock).toHaveBeenLastCalledWith('/demo/compare')
    expect(screen.getByText(/Maria, this is Lone Star Dental/)).toBeTruthy()
  })

  it('per-beat notes persist to sessionStorage', () => {
    render(<PresenterPanel skin={null} />)
    fireEvent.click(screen.getByText(/Notes/))
    const textarea = screen.getByPlaceholderText(/What they said/)
    fireEvent.change(textarea, { target: { value: 'They loved the huddle.' } })
    expect(sessionStorage.getItem(`dc.demo-notes.${DEMO_BEATS[0].id}`)).toBe('They loved the huddle.')
  })

  it('shows the ↗ their-current-site link only with a websiteUrl, and the End-demo control', () => {
    render(<PresenterPanel skin={FULL_SKIN} />)
    const link = screen.getByText(/their current site/)
    expect(link.closest('a')!.getAttribute('href')).toBe('https://lonestardental.com')
    expect(screen.getByText(/End demo/)).toBeTruthy()
  })

  it('the demo ENDS: Next on the last beat opens the wrap-up (never a dead disabled button)', () => {
    render(<PresenterPanel skin={FULL_SKIN} />)
    fireEvent.keyDown(window, { key: String(DEMO_BEATS.length) }) // jump to last
    fireEvent.click(screen.getByText('Wrap up →'))
    expect(screen.getByTestId('demo-wrapup')).toBeTruthy()
    expect(screen.getByText(/That’s the pitch for Lone Star Dental/)).toBeTruthy()
    // Esc backs out of the wrap-up to the script (not straight to collapse).
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('demo-wrapup')).toBeNull()
    expect(screen.getByTestId('presenter-panel')).toBeTruthy()
  })

  it('the header chip event opens the wrap-up even when collapsed', () => {
    render(<PresenterPanel skin={FULL_SKIN} />)
    fireEvent.keyDown(window, { key: 'Escape' }) // collapse
    expect(screen.queryByTestId('presenter-panel')).toBeNull()
    fireEvent(window, new CustomEvent('dc:demo-wrapup'))
    expect(screen.getByTestId('demo-wrapup')).toBeTruthy()
  })

  it('logs the outcome and hard-assigns to the returned path', async () => {
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: { ...original, assign },
      writable: true,
      configurable: true,
    })
    try {
      render(<PresenterPanel skin={FULL_SKIN} />)
      fireEvent.click(screen.getByText(/End demo/))
      fireEvent.click(screen.getByText(/They’re in/))
      fireEvent.click(screen.getByText('Log & end demo'))
      await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/platform/prospecting/call-list?highlight=pros_1'))
      expect(endWithOutcomeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'won' }),
      )
      // The presenter session is wiped — the NEXT demo starts fresh.
      expect(sessionStorage.getItem('dc.demo-beat-index')).toBeNull()
      expect(sessionStorage.getItem('dc.demo-started-at')).toBeNull()
    } finally {
      Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
    }
  })

  it('switches the story mid-demo: track select resets to the new first beat', () => {
    render(<PresenterPanel skin={FULL_SKIN} />)
    fireEvent.change(screen.getByLabelText('Story'), { target: { value: 'website' } })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_TRACKS.website.beats[0].href)
    expect(screen.getByText(`1. ${DEMO_TRACKS.website.beats[0].title}`)).toBeTruthy()
    expect(sessionStorage.getItem('dc.demo-track')).toBe('website')
  })

  it('a NEW prospect never resumes the last demo (scoped session reset)', () => {
    const first = render(<PresenterPanel skin={FULL_SKIN} />)
    fireEvent.click(screen.getByText('Next →'))
    expect(sessionStorage.getItem('dc.demo-beat-index')).toBe('1')
    first.unmount()
    render(<PresenterPanel skin={{ ...FULL_SKIN, prospectId: 'pros_2', clinicName: 'River Bend Dental' }} />)
    expect(screen.getByText(`1. ${DEMO_BEATS[0].title}`)).toBeTruthy()
    expect(sessionStorage.getItem('dc.demo-beat-index')).toBeNull()
  })

  it('a skin track leads the demo with that story', () => {
    render(<PresenterPanel skin={{ ...FULL_SKIN, track: 'frontdesk' }} />)
    expect(screen.getByText(`1. ${DEMO_TRACKS.frontdesk.beats[0].title}`)).toBeTruthy()
  })
})
