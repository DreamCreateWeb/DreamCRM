'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveTrack, type DemoTrackId } from '@/lib/types/demo-script'
import type { DemoSkin } from '@/lib/types/demo-skin'
import {
  clearPresenterSession,
  ensureDemoStartedAt,
  ensurePresenterScope,
  readAllBeatNotes,
  readDemoStartedAt,
  writeBeatNote,
} from './presenter-session'
import {
  openDemoRemoteChannel,
  parseDemoRemoteMessage,
  type DemoRemoteState,
} from '@/lib/demo-remote'

/**
 * The demo conductor — the INVISIBLE presenter brain in the demo tab (the
 * screen the prospect watches). It renders NOTHING: the whole script UI
 * lives in the pop-out /demo/script window (the presenter's second
 * screen), which mirrors this tab's state over a BroadcastChannel and
 * sends commands back. This tab owns the state (beat index, track,
 * visited, notes, clock — sessionStorage scoped per prospect), navigates
 * on `goto`, and still answers the keyboard (→ / n next · ← back ·
 * digits jump) so the presenter can drive without glancing away. When
 * the script window logs the outcome and ends the demo, the `ended`
 * command lands here and this tab clears its session and moves to the
 * call list. The audience only ever sees the product.
 */

const VISITED_KEY = 'dc.demo-visited-beats'
const INDEX_KEY = 'dc.demo-beat-index'
const TRACK_KEY = 'dc.demo-track'

/** One named window — reopening focuses the existing script. */
export function openDemoScriptWindow(): Window | null {
  try {
    return window.open('/demo/script', 'dcDemoScript', 'width=440,height=780')
  } catch {
    return null
  }
}

function readVisited(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(VISITED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function readIndex(beatCount: number): number {
  try {
    const raw = Number(sessionStorage.getItem(INDEX_KEY))
    return Number.isInteger(raw) && raw >= 0 && raw < beatCount ? raw : 0
  } catch {
    return 0
  }
}

function readTrackOverride(): string | null {
  try {
    return sessionStorage.getItem(TRACK_KEY)
  } catch {
    return null
  }
}

export default function DemoConductor({ skin }: { skin: DemoSkin | null }) {
  const router = useRouter()
  const [trackId, setTrackId] = useState<DemoTrackId>(resolveTrack(skin?.track).id)
  const [index, setIndex] = useState(0)
  const [wrapup, setWrapup] = useState(false)
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const channelRef = useRef<BroadcastChannel | null>(null)

  const beats = resolveTrack(trackId).beats

  // A new prospect = a fresh demo: reset the scoped session (clock, beat,
  // notes, track override), start the clock, THEN resume this demo's state.
  useEffect(() => {
    ensurePresenterScope(skin?.prospectId ?? 'generic')
    ensureDemoStartedAt()
    const activeTrack = resolveTrack(readTrackOverride() ?? skin?.track)
    setTrackId(activeTrack.id)
    setVisited(readVisited())
    setIndex(readIndex(activeTrack.beats.length))
  }, [skin?.prospectId, skin?.track])

  const goTo = useCallback(
    (nextIndex: number) => {
      // Past the last beat = the wrap-up (shown in the script window).
      if (nextIndex >= beats.length) {
        setWrapup(true)
        return
      }
      const clamped = Math.max(0, nextIndex)
      const beat = beats[clamped]
      setWrapup(false)
      setIndex(clamped)
      setVisited((prev) => {
        const next = new Set(prev).add(beat.id)
        try {
          sessionStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(next)))
          sessionStorage.setItem(INDEX_KEY, String(clamped))
        } catch {
          /* private mode — progress just doesn't persist */
        }
        return next
      })
      router.push(beat.href)
    },
    [router, beats],
  )

  const switchTrack = useCallback(
    (id: DemoTrackId) => {
      const track = resolveTrack(id)
      try {
        sessionStorage.setItem(TRACK_KEY, track.id)
      } catch {
        /* private mode */
      }
      setTrackId(track.id)
      setWrapup(false)
      setIndex(0)
      const first = track.beats[0]
      setVisited((prev) => {
        const next = new Set(prev).add(first.id)
        try {
          sessionStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(next)))
          sessionStorage.setItem(INDEX_KEY, '0')
        } catch {
          /* private mode */
        }
        return next
      })
      router.push(first.href)
    },
    [router],
  )

  const postState = useCallback(() => {
    const ch = channelRef.current
    if (!ch) return
    const state: DemoRemoteState = {
      kind: 'state',
      index,
      trackId,
      wrapup,
      startedAt: readDemoStartedAt(),
      notes: readAllBeatNotes(),
      visited: Array.from(visited),
    }
    try {
      ch.postMessage(state)
    } catch {
      /* channel closed */
    }
  }, [index, trackId, wrapup, visited])

  // The channel authority: answer the script window's commands.
  useEffect(() => {
    const ch = openDemoRemoteChannel()
    channelRef.current = ch
    if (!ch) return
    const onMessage = (e: MessageEvent) => {
      const msg = parseDemoRemoteMessage(e.data)
      if (!msg) return
      if (msg.kind === 'hello') postState()
      else if (msg.kind === 'goto') goTo(msg.index)
      else if (msg.kind === 'switch-track') switchTrack(msg.trackId)
      else if (msg.kind === 'wrapup') setWrapup(true)
      else if (msg.kind === 'note') writeBeatNote(msg.beatId, msg.value)
      else if (msg.kind === 'ended') {
        // The script window logged the outcome + cleared the demo cookies —
        // this tab just cleans up and lands on the call list.
        clearPresenterSession()
        window.location.assign(msg.to)
      }
    }
    ch.addEventListener('message', onMessage)
    return () => {
      ch.removeEventListener('message', onMessage)
      ch.close()
      channelRef.current = null
    }
  }, [goTo, switchTrack, postState])

  // Mirror every state change out to the script window.
  useEffect(() => {
    postState()
  }, [postState])

  // Keyboard drive stays in this tab — the presenter can advance without
  // touching the script window. No Esc/collapse: there's nothing to hide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      if (e.key === 'ArrowRight' || e.key === 'n') {
        e.preventDefault()
        goTo(index + 1)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(index - 1)
      }
      const digit = Number(e.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= beats.length) {
        e.preventDefault()
        goTo(digit - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, index, beats.length])

  return null
}
