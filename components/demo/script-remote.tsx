'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEMO_GROUP_LABELS,
  DEMO_TRACK_LIST,
  resolveTrack,
  renderTalkTrack,
  type DemoTrackId,
} from '@/lib/types/demo-script'
import type { DemoSkin } from '@/lib/types/demo-skin'
import { groupGapsByBeat } from '@/lib/demo-gaps'
import {
  openDemoRemoteChannel,
  parseDemoRemoteMessage,
  type DemoRemoteCommand,
} from '@/lib/demo-remote'

/**
 * The pop-out presenter script — the SECOND-SCREEN view of a live demo.
 * The main tab (the screen the prospect watches) owns all state; this
 * window mirrors it over a BroadcastChannel and sends commands back, so
 * the presenter reads talk tracks, gaps, and moves HERE while the shared
 * screen shows only the product. Keyboard works in this window too:
 * → / n next · ← back · digits jump.
 */

export default function ScriptRemote({ skin }: { skin: DemoSkin | null }) {
  const [connected, setConnected] = useState(false)
  const [index, setIndex] = useState(0)
  const [trackId, setTrackId] = useState<DemoTrackId>(
    (skin?.track as DemoTrackId | undefined) ?? 'full',
  )
  const [wrapup, setWrapup] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [elapsed, setElapsed] = useState('0:00')
  const channelRef = useRef<BroadcastChannel | null>(null)

  const track = resolveTrack(trackId)
  const beats = track.beats
  const safeIndex = Math.min(index, beats.length - 1)
  const gapsByBeat = useMemo(() => groupGapsByBeat(skin?.weaknesses ?? []), [skin?.weaknesses])

  const send = useCallback((cmd: DemoRemoteCommand) => {
    try {
      channelRef.current?.postMessage(cmd)
    } catch {
      /* channel closed */
    }
  }, [])

  // Connect + mirror. The main tab replies to 'hello' with full state.
  useEffect(() => {
    const ch = openDemoRemoteChannel()
    channelRef.current = ch
    if (!ch) return
    const onMessage = (e: MessageEvent) => {
      const msg = parseDemoRemoteMessage(e.data)
      if (msg?.kind !== 'state') return
      setConnected(true)
      setIndex(msg.index)
      setTrackId(msg.trackId)
      setWrapup(msg.wrapup)
      setStartedAt(msg.startedAt)
      setNotes(msg.notes)
    }
    ch.addEventListener('message', onMessage)
    ch.postMessage({ kind: 'hello' } satisfies DemoRemoteCommand)
    return () => {
      ch.removeEventListener('message', onMessage)
      ch.close()
      channelRef.current = null
    }
  }, [])

  // Local clock from the main tab's start time.
  useEffect(() => {
    const tick = () => {
      if (!startedAt) return setElapsed('0:00')
      const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      setElapsed(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  // Keyboard drive from this window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (e.key === 'ArrowRight' || e.key === 'n') {
        e.preventDefault()
        send(safeIndex + 1 >= beats.length ? { kind: 'wrapup' } : { kind: 'goto', index: safeIndex + 1 })
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        send({ kind: 'goto', index: Math.max(0, safeIndex - 1) })
      }
      const digit = Number(e.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= beats.length) {
        e.preventDefault()
        send({ kind: 'goto', index: digit - 1 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [send, safeIndex, beats.length])

  const overMinutes =
    startedAt != null && Date.now() - startedAt > track.targetMinutes * 60_000

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-5">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-teal-300">
            🎬 {skin ? `Presenting to ${skin.clinicName}` : 'Presenter script'}
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
              overMinutes ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-gray-300'
            }`}
            title={`Target ~${track.targetMinutes} min`}
          >
            ⏱ {elapsed} / ~{track.targetMinutes}m
          </span>
        </div>

        {!connected && (
          <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Waiting for the demo tab… keep the dashboard window open — this script drives it.
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="remote-track"
            className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-gray-500"
          >
            Story
          </label>
          <select
            id="remote-track"
            value={trackId}
            onChange={(e) => send({ kind: 'switch-track', trackId: e.target.value as DemoTrackId })}
            className="w-full rounded-md bg-white/5 px-2 py-1 text-xs text-gray-200 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-white/25"
          >
            {DEMO_TRACK_LIST.map((t) => (
              <option key={t.id} value={t.id} className="bg-gray-900">
                {t.emoji} {t.label} · {t.beats.length} beats · ~{t.targetMinutes}m
              </option>
            ))}
          </select>
        </div>

        {wrapup ? (
          <div className="mt-4 rounded-lg bg-white/5 p-4 ring-1 ring-inset ring-white/10">
            <div className="text-sm font-semibold">Wrapping up on the demo screen</div>
            <p className="mt-1 text-xs leading-relaxed text-gray-300">{track.planPitch}</p>
            <p className="mt-2 text-[11px] text-gray-500">
              Log the outcome in the panel on the demo window.
            </p>
          </div>
        ) : (
          <ol className="mt-4 space-y-1.5">
            {beats.map((b, i) => {
              const current = i === safeIndex
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => send({ kind: 'goto', index: i })}
                    className={`w-full rounded-lg p-3 text-left ring-1 ring-inset transition-colors ${
                      current
                        ? 'bg-white/10 ring-white/20'
                        : 'ring-white/5 hover:bg-white/5 text-gray-400'
                    }`}
                    style={
                      current
                        ? { boxShadow: 'inset 2px 0 0 0 var(--demo-accent, #2dd4bf)' }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold ${current ? 'text-gray-100' : ''}`}>
                        {i + 1}. {b.title}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-gray-600">
                        {DEMO_GROUP_LABELS[b.group]}
                      </span>
                    </div>
                    {current && (
                      <div className="mt-1.5">
                        <p className="text-xs leading-relaxed text-gray-300">
                          {renderTalkTrack(b.talkTrack, skin)}
                        </p>
                        {b.moves && b.moves.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {b.moves.map((m) => (
                              <li key={m} className="flex items-start gap-1.5 text-[11px] text-teal-300/90">
                                <span aria-hidden="true">▸</span>
                                <span>{m}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {(gapsByBeat[b.id] ?? []).slice(0, 2).map((g) => (
                          <p key={g} className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-300/90">
                            <span aria-hidden="true">⚠</span>
                            <span>
                              Their practice today: <span className="font-medium">{g}</span>
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </button>
                  {current && (
                    <textarea
                      rows={2}
                      value={notes[b.id] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value
                        setNotes((prev) => ({ ...prev, [b.id]: value }))
                        send({ kind: 'note', beatId: b.id, value })
                      }}
                      placeholder="What they said, what to circle back on…"
                      className="mt-1 w-full rounded-md bg-white/5 px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-white/25"
                    />
                  )}
                </li>
              )
            })}
          </ol>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-600">→ next · ← back · digits jump</span>
          <button
            type="button"
            onClick={() => send({ kind: 'wrapup' })}
            className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-gray-900"
            style={{ background: 'var(--demo-accent, #2dd4bf)' }}
          >
            Wrap up →
          </button>
        </div>
      </div>
    </div>
  )
}
