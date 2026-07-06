'use client'

import { useEffect, useState } from 'react'
import { DEMO_START_KEY as START_KEY } from './presenter-session'

/** mm:ss elapsed since the demo started (sessionStorage — survives reloads,
 *  dies with the tab; a new demo session starts a fresh clock). */
export function useDemoElapsed(): string {
  const [label, setLabel] = useState('0:00')
  useEffect(() => {
    let start: number
    try {
      const stored = Number(sessionStorage.getItem(START_KEY))
      start = Number.isFinite(stored) && stored > 0 ? stored : Date.now()
      sessionStorage.setItem(START_KEY, String(start))
    } catch {
      start = Date.now()
    }
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - start) / 1000))
      setLabel(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return label
}

export default function DemoTimer() {
  const elapsed = useDemoElapsed()
  return (
    <span
      className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-gray-300"
      title="Demo elapsed time"
    >
      ⏱ {elapsed}
    </span>
  )
}
