'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { CalendarApi } from '@fullcalendar/core'

export type CalendarView = 'month' | 'week' | 'day' | 'list'

interface CalendarContextProps {
  today: Date
  view: CalendarView
  setView: (view: CalendarView) => void
  /** Anchor date used by all views. Updated via prev/next/today nav. */
  anchor: Date
  setAnchor: (d: Date) => void
  /** Convenience: jump-to-today resets anchor to now. */
  goToToday: () => void
  /** Handle to the FullCalendar API for imperative calls (next/prev/today).
   *  CalendarTable sets it on mount; nav uses it via the helpers below. */
  setApi: (api: CalendarApi | null) => void
  /** Imperative prev. Calls FullCalendar's API if mounted, else mutates
   *  `anchor` by a sensible delta for the current view. */
  prev: () => void
  next: () => void
}

const CalendarContext = createContext<CalendarContextProps | undefined>(undefined)

export const CalendarProvider = ({ children }: { children: React.ReactNode }) => {
  const [today] = useState(() => new Date())
  const [view, setViewState] = useState<CalendarView>('month')
  const [anchor, setAnchorState] = useState<Date>(() => new Date())
  const apiRef = useRef<CalendarApi | null>(null)

  const setApi = useCallback((api: CalendarApi | null) => {
    apiRef.current = api
  }, [])

  const setView = useCallback((v: CalendarView) => {
    setViewState(v)
  }, [])

  const setAnchor = useCallback((d: Date) => {
    setAnchorState(d)
  }, [])

  const goToToday = useCallback(() => {
    const now = new Date()
    setAnchorState(now)
    apiRef.current?.today()
  }, [])

  const prev = useCallback(() => {
    apiRef.current?.prev()
    // Mirror to anchor so it stays in sync (the FullCalendar API moves the
    // grid, but our nav title reads from anchor).
    const api = apiRef.current
    if (api) setAnchorState(api.getDate())
  }, [])

  const next = useCallback(() => {
    apiRef.current?.next()
    const api = apiRef.current
    if (api) setAnchorState(api.getDate())
  }, [])

  return (
    <CalendarContext.Provider value={{ today, view, setView, anchor, setAnchor, goToToday, setApi, prev, next }}>
      {children}
    </CalendarContext.Provider>
  )
}

export const useCalendarContext = () => {
  const context = useContext(CalendarContext)
  if (!context) throw new Error('useCalendarContext must be used within a CalendarProvider')
  return context
}

// ---------- Date helpers shared by the views ----------

/** Returns the Sunday on or before the given date (week start in US conv). */
export function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setDate(d.getDate() - d.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(d.getDate() + n)
  return r
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatWeekRange(start: Date): string {
  const end = addDays(start, 6)
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
  }
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
