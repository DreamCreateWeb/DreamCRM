'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The Home Team template's two living-data pieces. Both render their FINAL
 * value on the server (the stacked, no-JS and reduced-motion page is the
 * finished picture) and only add motion or a mark on the client.
 */

/**
 * A scoreboard digit that counts up to its value when the board scrolls into
 * view. The value is whatever the clinic typed ("20+", "4.9", "1 day",
 * "240+"): the first number in it counts, everything around it stays. No
 * number in the string → rendered as-is. Reduced motion → static.
 */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)

  useEffect(() => {
    const m = /^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value)
    if (!m) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof IntersectionObserver === 'undefined') return
    const node = ref.current
    if (!node) return
    const [, prefix, numText, suffix] = m
    const target = Number(numText.replace(/,/g, ''))
    const decimals = (numText.split('.')[1] ?? '').length
    const grouped = numText.includes(',')
    if (!Number.isFinite(target)) return
    const fmt = (n: number) =>
      grouped ? n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals)

    let raf = 0
    const run = () => {
      const start = performance.now()
      const dur = 1100
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur)
        const eased = 1 - Math.pow(1 - t, 3)
        setShown(`${prefix}${fmt(target * eased)}${suffix}`)
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          obs.disconnect()
          setShown(`${prefix}${fmt(0)}${suffix}`)
          run()
        }
      },
      { threshold: 0.4 },
    )
    obs.observe(node)
    return () => {
      obs.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value])

  return <span ref={ref}>{shown}</span>
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** The clinic-local weekday key ('mon' … 'sun'), or null before mount /
 *  when the browser cannot resolve the zone. */
function useClinicToday(timeZone: string | null | undefined): (typeof DAY_KEYS)[number] | null {
  const [day, setDay] = useState<(typeof DAY_KEYS)[number] | null>(null)
  useEffect(() => {
    try {
      const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timeZone ?? undefined }).format(new Date())
      const key = wd.slice(0, 3).toLowerCase() as (typeof DAY_KEYS)[number]
      if ((DAY_KEYS as readonly string[]).includes(key)) setDay(key)
    } catch {
      /* unknown zone → no mark */
    }
  }, [timeZone])
  return day
}

/**
 * The scoreboard's "today" readout: the clinic-local weekday and that day's
 * hours as the server already phrased them. Server-side it renders nothing
 * (there is no "today" the server can honestly claim for a cached page),
 * so the board is complete without it and gains it on the client.
 */
export function TodayReadout({
  timeZone,
  hoursByDay,
}: {
  timeZone: string | null | undefined
  /** Display string per weekday key, as `hoursEntryDisplay` phrases it. */
  hoursByDay: Record<string, string>
}) {
  const day = useClinicToday(timeZone)
  if (!day || !(day in hoursByDay)) return null
  const text = hoursByDay[day]
  const closed = /closed/i.test(text)
  return (
    <span>
      Today · {closed ? 'Closed' : text}
    </span>
  )
}

/** Marks a row of the hours grid when it is today in the clinic's zone. */
export function TodayRow({
  day,
  timeZone,
  children,
  className,
  style,
  todayStyle,
}: {
  day: string
  timeZone: string | null | undefined
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  todayStyle?: React.CSSProperties
}) {
  const today = useClinicToday(timeZone)
  const isToday = today === day
  return (
    <li className={className} style={isToday ? { ...style, ...todayStyle } : style} data-today={isToday ? '' : undefined}>
      {children}
    </li>
  )
}
