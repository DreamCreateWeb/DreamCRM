// The presenter-remote protocol — a BroadcastChannel between the demo tab
// (the shared screen the prospect watches) and the pop-out script window
// (the presenter's second screen). The MAIN tab owns all state; the remote
// mirrors it and sends commands. Client-safe, no DB, defensive everywhere:
// no BroadcastChannel support → null, and both sides degrade to solo mode.

import type { DemoTrackId } from '@/lib/types/demo-script'

export const DEMO_REMOTE_CHANNEL = 'dc-demo-script'

/** Remote → main: drive the demo. */
export type DemoRemoteCommand =
  | { kind: 'hello' } // remote connected — main replies with state
  | { kind: 'goto'; index: number }
  | { kind: 'switch-track'; trackId: DemoTrackId }
  | { kind: 'wrapup' }
  | { kind: 'note'; beatId: string; value: string }

/** Main → remote: mirror the demo. */
export interface DemoRemoteState {
  kind: 'state'
  index: number
  trackId: DemoTrackId
  wrapup: boolean
  /** Epoch ms the demo clock started (main tab's sessionStorage) — the
   *  remote computes elapsed locally so the channel stays quiet. */
  startedAt: number | null
  /** Per-beat notes snapshot — the remote edits, the main tab stores. */
  notes: Record<string, string>
}

export type DemoRemoteMessage = DemoRemoteCommand | DemoRemoteState

/** null when the browser doesn't support BroadcastChannel — callers stay solo. */
export function openDemoRemoteChannel(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null
    return new BroadcastChannel(DEMO_REMOTE_CHANNEL)
  } catch {
    return null
  }
}

/** Junk-tolerant message parse — cross-window input is untrusted. */
export function parseDemoRemoteMessage(data: unknown): DemoRemoteMessage | null {
  if (!data || typeof data !== 'object') return null
  const m = data as Record<string, unknown>
  switch (m.kind) {
    case 'hello':
      return { kind: 'hello' }
    case 'goto':
      return typeof m.index === 'number' && Number.isInteger(m.index) && m.index >= 0
        ? { kind: 'goto', index: m.index }
        : null
    case 'switch-track':
      return typeof m.trackId === 'string' ? { kind: 'switch-track', trackId: m.trackId as DemoTrackId } : null
    case 'wrapup':
      return { kind: 'wrapup' }
    case 'note':
      return typeof m.beatId === 'string' && typeof m.value === 'string'
        ? { kind: 'note', beatId: m.beatId, value: m.value.slice(0, 2000) }
        : null
    case 'state': {
      if (typeof m.index !== 'number' || typeof m.trackId !== 'string') return null
      return {
        kind: 'state',
        index: m.index,
        trackId: m.trackId as DemoTrackId,
        wrapup: m.wrapup === true,
        startedAt: typeof m.startedAt === 'number' ? m.startedAt : null,
        notes:
          m.notes && typeof m.notes === 'object'
            ? Object.fromEntries(
                Object.entries(m.notes as Record<string, unknown>).filter(
                  (e): e is [string, string] => typeof e[1] === 'string',
                ),
              )
            : {},
      }
    }
    default:
      return null
  }
}
