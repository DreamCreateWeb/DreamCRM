import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import React from 'react'

/**
 * The pop-out presenter remote — protocol parsing (cross-window input is
 * untrusted) + the two-window contract: the demo tab OWNS state and
 * collapses on connect (the talk tracks leave the shared screen); the
 * script window mirrors state and drives beats/track/wrap-up/notes.
 */

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/app/(default)/ecommerce/customers/admin-actions', () => ({
  endBrandedDemoAction: vi.fn(),
  endBrandedDemoWithOutcomeAction: vi.fn(async () => ({ ok: true, to: '/x' })),
  exitDemoMode: vi.fn(),
}))

import { parseDemoRemoteMessage, DEMO_REMOTE_CHANNEL } from '@/lib/demo-remote'
import { DEMO_TRACKS } from '@/lib/types/demo-script'
import PresenterPanel from '@/components/demo/presenter-panel'
import ScriptRemote from '@/components/demo/script-remote'

// A same-process BroadcastChannel: instances sharing a name form a hub;
// postMessage reaches every OTHER instance (per spec, never the sender).
class FakeBroadcastChannel {
  static hubs = new Map<string, Set<FakeBroadcastChannel>>()
  name: string
  private listeners = new Set<(e: { data: unknown }) => void>()
  constructor(name: string) {
    this.name = name
    let hub = FakeBroadcastChannel.hubs.get(name)
    if (!hub) {
      hub = new Set()
      FakeBroadcastChannel.hubs.set(name, hub)
    }
    hub.add(this)
  }
  postMessage(data: unknown) {
    for (const peer of FakeBroadcastChannel.hubs.get(this.name) ?? []) {
      if (peer !== this) peer.listeners.forEach((fn) => fn({ data }))
    }
  }
  addEventListener(_type: string, fn: (e: { data: unknown }) => void) {
    this.listeners.add(fn)
  }
  removeEventListener(_type: string, fn: (e: { data: unknown }) => void) {
    this.listeners.delete(fn)
  }
  close() {
    FakeBroadcastChannel.hubs.get(this.name)?.delete(this)
  }
}

const SKIN = {
  prospectId: 'pros_1',
  clinicName: 'Lone Star Dental',
  weaknesses: ['No online booking today'],
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  FakeBroadcastChannel.hubs.clear()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseDemoRemoteMessage', () => {
  it('accepts every protocol kind and rejects junk', () => {
    expect(parseDemoRemoteMessage({ kind: 'hello' })).toEqual({ kind: 'hello' })
    expect(parseDemoRemoteMessage({ kind: 'goto', index: 3 })).toEqual({ kind: 'goto', index: 3 })
    expect(parseDemoRemoteMessage({ kind: 'goto', index: -1 })).toBeNull()
    expect(parseDemoRemoteMessage({ kind: 'goto', index: 'x' })).toBeNull()
    expect(parseDemoRemoteMessage({ kind: 'switch-track', trackId: 'website' })).toEqual({
      kind: 'switch-track',
      trackId: 'website',
    })
    expect(parseDemoRemoteMessage({ kind: 'wrapup' })).toEqual({ kind: 'wrapup' })
    expect(parseDemoRemoteMessage({ kind: 'note', beatId: 'huddle', value: 'x' })).toEqual({
      kind: 'note',
      beatId: 'huddle',
      value: 'x',
    })
    expect(parseDemoRemoteMessage(null)).toBeNull()
    expect(parseDemoRemoteMessage('state')).toBeNull()
    expect(parseDemoRemoteMessage({ kind: 'nonsense' })).toBeNull()
  })

  it('parses state and tolerates junk notes/startedAt', () => {
    const state = parseDemoRemoteMessage({
      kind: 'state',
      index: 2,
      trackId: 'website',
      wrapup: false,
      startedAt: 'not-a-number',
      notes: { huddle: 'good', bad: 42 },
    })
    expect(state).toMatchObject({ kind: 'state', index: 2, trackId: 'website', startedAt: null })
    expect((state as { notes: Record<string, string> }).notes).toEqual({ huddle: 'good' })
  })
})

describe('PresenterPanel as the remote-driven main window', () => {
  function connectRemote() {
    const remote = new FakeBroadcastChannel(DEMO_REMOTE_CHANNEL)
    const received: unknown[] = []
    remote.addEventListener('message', (e) => received.push(e.data))
    return { remote, received }
  }

  it('hello → replies with state AND collapses (talk tracks leave the shared screen)', () => {
    render(<PresenterPanel skin={SKIN} />)
    const { remote, received } = connectRemote()
    act(() => remote.postMessage({ kind: 'hello' }))
    const state = received.find((m) => (m as { kind?: string }).kind === 'state')
    expect(state).toMatchObject({ kind: 'state', index: 0, trackId: 'full', wrapup: false })
    // Collapsed to the pill — only the 🎬 pill remains, no panel.
    expect(screen.queryByTestId('presenter-panel')).toBeNull()
    expect(screen.getByText(/🎬/)).toBeTruthy()
  })

  it('goto drives navigation; switch-track resets to the new story; note lands in storage', () => {
    render(<PresenterPanel skin={SKIN} />)
    const { remote } = connectRemote()
    act(() => remote.postMessage({ kind: 'goto', index: 2 }))
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_TRACKS.full.beats[2].href)
    act(() => remote.postMessage({ kind: 'switch-track', trackId: 'website' }))
    expect(pushMock).toHaveBeenLastCalledWith(DEMO_TRACKS.website.beats[0].href)
    act(() => remote.postMessage({ kind: 'note', beatId: 'compare', value: 'They gasped.' }))
    expect(sessionStorage.getItem('dc.demo-notes.compare')).toBe('They gasped.')
  })

  it('wrapup command opens the wrap-up view', () => {
    render(<PresenterPanel skin={SKIN} />)
    const { remote } = connectRemote()
    act(() => remote.postMessage({ kind: 'wrapup' }))
    expect(screen.getByTestId('demo-wrapup')).toBeTruthy()
  })
})

describe('ScriptRemote as the second-screen script', () => {
  function fakeMain() {
    const main = new FakeBroadcastChannel(DEMO_REMOTE_CHANNEL)
    const commands: unknown[] = []
    main.addEventListener('message', (e) => {
      commands.push(e.data)
      if ((e.data as { kind?: string }).kind === 'hello') {
        main.postMessage({
          kind: 'state',
          index: 1,
          trackId: 'website',
          wrapup: false,
          startedAt: Date.now() - 60_000,
          notes: { website: 'Loved the editor' },
        })
      }
    })
    return { main, commands }
  }

  it('mirrors the main state: current beat expanded with talk track, moves, and the note', () => {
    const { main } = fakeMain()
    render(<ScriptRemote skin={SKIN} />)
    void main
    const beat = DEMO_TRACKS.website.beats[1] // website beat
    expect(screen.getByText(`2. ${beat.title}`)).toBeTruthy()
    expect(screen.getByText(/edit it live, right here/)).toBeTruthy()
    expect(screen.getByText(beat.moves![0])).toBeTruthy()
    expect(screen.getByDisplayValue('Loved the editor')).toBeTruthy()
    // No "waiting" banner once connected.
    expect(screen.queryByText(/Waiting for the demo tab/)).toBeNull()
  })

  it('drives the main window: beat click sends goto, the button sends wrapup, notes send note', () => {
    const { commands } = fakeMain()
    render(<ScriptRemote skin={SKIN} />)
    fireEvent.click(screen.getByText(`1. ${DEMO_TRACKS.website.beats[0].title}`))
    expect(commands).toContainEqual({ kind: 'goto', index: 0 })
    fireEvent.click(screen.getByText('Wrap up →'))
    expect(commands).toContainEqual({ kind: 'wrapup' })
    fireEvent.change(screen.getByDisplayValue('Loved the editor'), {
      target: { value: 'Loved the editor. Asked about price.' },
    })
    expect(commands).toContainEqual({
      kind: 'note',
      beatId: 'website',
      value: 'Loved the editor. Asked about price.',
    })
  })

  it('keyboard in the remote drives the main window (→ past the end = wrap up)', () => {
    const { commands } = fakeMain()
    render(<ScriptRemote skin={SKIN} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(commands).toContainEqual({ kind: 'goto', index: 2 })
    fireEvent.keyDown(window, { key: '7' }) // last beat of the 7-beat website track
    expect(commands).toContainEqual({ kind: 'goto', index: 6 })
  })
})
