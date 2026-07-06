import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

/**
 * Presenter mode — the guard contract (skin renders ONLY for platform
 * admin + demo mode; junk cookies die in the parser), the beats registry,
 * talk-track substitution, and the INVISIBLE demo conductor's keyboard
 * flow (all script UI lives in the pop-out /demo/script window — the
 * shared screen shows only the product). Zero DB writes anywhere.
 */

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}))

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// The wrap-up (pop-out window) posts this server action — stub the whole
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
import DemoConductor from '@/components/demo/demo-conductor'

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

describe('DemoConductor (the invisible presenter brain)', () => {
  it('renders NOTHING on the shared screen', () => {
    const { container } = render(<DemoConductor skin={FULL_SKIN} />)
    expect(container.innerHTML).toBe('')
  })

  it('keyboard drive: n advances, ArrowLeft back, digits jump — via router.push', () => {
    render(<DemoConductor skin={null} />)
    fireEvent.keyDown(window, { key: 'n' })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[1].href)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[0].href)
    fireEvent.keyDown(window, { key: String(DEMO_BEATS.length) })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[DEMO_BEATS.length - 1].href)
    // Past the end = the wrap-up flag (shown in the script window) — no nav.
    pushMock.mockClear()
    fireEvent.keyDown(window, { key: 'n' })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('never steals keys from form fields', () => {
    render(
      <div>
        <input aria-label="field" />
        <DemoConductor skin={null} />
      </div>,
    )
    const input = screen.getByLabelText('field')
    fireEvent.keyDown(input, { key: 'n' })
    fireEvent.keyDown(input, { key: '3' })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('visited beats + current index persist to sessionStorage (no DB anywhere)', () => {
    render(<DemoConductor skin={null} />)
    fireEvent.keyDown(window, { key: 'n' })
    const stored = JSON.parse(sessionStorage.getItem('dc.demo-visited-beats') ?? '[]') as string[]
    expect(stored).toContain(DEMO_BEATS[1].id)
    expect(sessionStorage.getItem('dc.demo-beat-index')).toBe('1')
    // The demo clock started on mount.
    expect(Number(sessionStorage.getItem('dc.demo-started-at'))).toBeGreaterThan(0)
  })

  it('a NEW prospect never resumes the last demo (scoped session reset)', () => {
    const first = render(<DemoConductor skin={FULL_SKIN} />)
    fireEvent.keyDown(window, { key: 'n' })
    expect(sessionStorage.getItem('dc.demo-beat-index')).toBe('1')
    first.unmount()
    render(<DemoConductor skin={{ ...FULL_SKIN, prospectId: 'pros_2', clinicName: 'River Bend Dental' }} />)
    expect(sessionStorage.getItem('dc.demo-beat-index')).toBeNull()
    fireEvent.keyDown(window, { key: 'n' })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[1].href)
  })

  it('a skin track leads the demo with that story', () => {
    render(<DemoConductor skin={{ ...FULL_SKIN, track: 'frontdesk' }} />)
    fireEvent.keyDown(window, { key: 'n' })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_TRACKS.frontdesk.beats[1].href)
  })
})
