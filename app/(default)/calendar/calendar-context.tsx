'use client'

import { createContext, useContext, useState } from 'react'

export type CalendarView = 'month' | 'week' | 'day'

interface CalendarContextProps {
  today: Date
  view: CalendarView
  setView: (view: CalendarView) => void
  /** Anchor date used by all views. For month view the day-of-month doesn't
   *  matter (only month/year); for week view it picks the week containing
   *  this date; for day view it's the day shown. */
  anchor: Date
  setAnchor: (d: Date) => void
  /** Convenience: jump-to-today resets anchor to now. */
  goToToday: () => void
}

const CalendarContext = createContext<CalendarContextProps | undefined>(undefined)

export const CalendarProvider = ({ children }: { children: React.ReactNode }) => {
  const [today] = useState(() => new Date())
  const [view, setView] = useState<CalendarView>('month')
  const [anchor, setAnchor] = useState<Date>(() => new Date())

  function goToToday() {
    setAnchor(new Date())
  }

  return (
    <CalendarContext.Provider value={{ today, view, setView, anchor, setAnchor, goToToday }}>
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
