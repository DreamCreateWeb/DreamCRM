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

import { readDemoSkin, parseDemoSkin } from '@/lib/demo-skin'
import { DEMO_BEATS, renderTalkTrack } from '@/lib/types/demo-script'
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

describe('PresenterPanel', () => {
  it('shows the branded header + first beat, and Next advances via router.push', () => {
    render(<PresenterPanel skin={{ prospectId: 'pros_1', clinicName: 'Lone Star Dental', city: 'Dallas' }} />)
    expect(screen.getByText(/Presenting as Lone Star Dental/)).toBeTruthy()
    expect(screen.getByText(`1. ${DEMO_BEATS[0].title}`)).toBeTruthy()

    fireEvent.click(screen.getByText('Next →'))
    expect(pushMock).toHaveBeenCalledWith(DEMO_BEATS[1].href)
    expect(screen.getByText(`2. ${DEMO_BEATS[1].title}`)).toBeTruthy()
  })

  it('keyboard drive: n advances, ArrowLeft goes back, Esc collapses', () => {
    render(<PresenterPanel skin={null} />)
    fireEvent.keyDown(window, { key: 'n' })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[1].href)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_BEATS[0].href)
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
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('visited beats persist to sessionStorage (no DB anywhere)', () => {
    render(<PresenterPanel skin={null} />)
    fireEvent.click(screen.getByText('Next →'))
    const stored = JSON.parse(sessionStorage.getItem('dc.demo-visited-beats') ?? '[]') as string[]
    expect(stored).toContain(DEMO_BEATS[1].id)
  })
})
