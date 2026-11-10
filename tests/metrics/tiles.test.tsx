/**
 * ML-38 (commit 3) — the tiles read the snapshot through the chart kit: the
 * spark appears at >=2 points, the honest "tracked since" copy under the
 * floor, and nothing at all when nothing was recorded (never a fabricated
 * zero line).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import React from 'react'
import { KpiStat } from '@/components/ui/kpi-stat'
import { HeartbeatLine } from '@/components/ui/heartbeat-line'
import HuntPanel from '@/app/(default)/platform/prospecting/hunt-panel'
import { hourlyHeartbeat, heartbeatFor, bucketLabel, shiftDayKey, type SeriesPoint } from '@/lib/metric-series'

afterEach(cleanup)

function hours(n: number): SeriesPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const key = `2026-11-08T${String(i).padStart(2, '0')}`
    return { key, bucket: bucketLabel(key), value: i }
  })
}
function days(n: number): SeriesPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const key = shiftDayKey('2026-10-01', i)
    return { key, bucket: bucketLabel(key), value: i + 1 }
  })
}

describe('KpiStat heartbeat from a snapshot series', () => {
  it('draws the kit spark at 2 points with the since-copy under the floor', () => {
    const beat = heartbeatFor(days(2), 'flow', { noun: 'left' })
    const { container } = render(
      <KpiStat label="Reviews left" value={3} sub={<HeartbeatLine line={beat.line} />} spark={beat.spark ?? undefined} />,
    )
    expect(container.querySelectorAll('[data-chart^="mini-"]').length).toBe(1)
    expect(screen.getByText('tracked since Oct 1')).toBeTruthy()
  })

  it('draws no spark at one point, and says nothing with no history', () => {
    const one = heartbeatFor(days(1), 'flow')
    const a = render(<KpiStat label="x" value={1} sub={<HeartbeatLine line={one.line} />} spark={one.spark ?? undefined} />)
    expect(a.container.querySelectorAll('[data-chart^="mini-"]').length).toBe(0)
    expect(screen.getByText('tracked since Oct 1')).toBeTruthy()
    cleanup()
    const none = heartbeatFor([], 'flow')
    const b = render(<KpiStat label="x" value={1} sub={<HeartbeatLine line={none.line} />} spark={none.spark ?? undefined} />)
    expect(b.container.querySelectorAll('[data-heartbeat-line]').length).toBe(0)
    expect(b.container.querySelectorAll('[data-chart^="mini-"]').length).toBe(0)
  })

  it('a tile that already shows a delta says only the history disclaimer (onlySince)', () => {
    const { container } = render(<HeartbeatLine line="up 4 vs 14 days ago" onlySince />)
    expect(container.querySelectorAll('[data-heartbeat-line]').length).toBe(0)
    cleanup()
    render(<HeartbeatLine line="tracked since Nov 9" onlySince />)
    expect(screen.getByText('tracked since Nov 9')).toBeTruthy()
  })
})

describe('the hunt panel (hourly, platform, UTC)', () => {
  const stats = {
    sent24h: 40, dryRun24h: 0, opens24h: 3, clicks24h: 1, replies24h: 0, newCallList24h: 0, autoEnrolledToday: 0, hottest: [],
  } as never
  const config = {
    killSwitch: false, dryRun: false, watchdog: { trippedAt: null }, autoEnroll: { enabled: false },
  } as never
  const env = { senderConfigured: true, gmailConfigured: false }

  it('hourlyHeartbeat: spark at 2+ points; since-copy until a full day of hours', () => {
    expect(hourlyHeartbeat(hours(0))).toEqual({ spark: null, line: null })
    expect(hourlyHeartbeat(hours(1))).toEqual({ spark: null, line: 'tracked since Nov 8, 12 AM' })
    expect(hourlyHeartbeat(hours(5)).spark).toHaveLength(5)
    expect(hourlyHeartbeat(hours(24)).line).toBeNull()
  })

  it('renders the spark and says the hours are UTC', () => {
    const { container } = render(<HuntPanel stats={stats} config={config} env={env} sentByHour={hourlyHeartbeat(hours(5))} />)
    expect(container.querySelectorAll('[data-chart^="mini-"]').length).toBe(1)
    expect(screen.getByText(/Days and hours are UTC/)).toBeTruthy()
  })

  it('renders no heartbeat at all without a series', () => {
    const { container } = render(<HuntPanel stats={stats} config={config} env={env} sentByHour={null} />)
    expect(container.querySelectorAll('[data-chart^="mini-"]').length).toBe(0)
    expect(container.querySelectorAll('[data-heartbeat-line]').length).toBe(0)
  })
})

describe('ML-38b — the five formerly tile-less metrics render through the kit', () => {
  const metrics = ['reviews_requested', 'visits', 'bookings', 'revenue_collected', 'active_clinics'] as const
  for (const m of metrics) {
    const kind = m === 'active_clinics' ? 'stock' : 'flow'
    it(`${m}: spark presence at 2 points + the "tracked since" state`, () => {
      const beat = heartbeatFor(days(2), kind)
      const { container } = render(
        <KpiStat label={m} value={3} sub={<HeartbeatLine line={beat.line} />} spark={beat.spark ?? undefined} />,
      )
      expect(container.querySelectorAll('[data-chart^="mini-"]').length).toBe(1)
      expect(screen.getByText('tracked since Oct 1')).toBeTruthy()
      cleanup()
    })
    it(`${m}: nothing is drawn or said with no recorded history (never zero-filled)`, () => {
      const beat = heartbeatFor([], kind)
      const { container } = render(<KpiStat label={m} value={3} sub={<HeartbeatLine line={beat.line} />} spark={beat.spark ?? undefined} />)
      expect(container.querySelectorAll('[data-chart^="mini-"]').length).toBe(0)
      expect(container.querySelectorAll('[data-heartbeat-line]').length).toBe(0)
      cleanup()
    })
  }

  it('each tile is wired on the page that owns the number', async () => {
    const { readFileSync } = await import('node:fs')
    const wires: Array<[string, string]> = [
      ['app/(default)/growth/reviews/page.tsx', 'reviews_requested'],
      ['app/(default)/dashboard/clinic-overview.tsx', "'visits'"],
      ['app/(default)/website/page.tsx', "'bookings'"],
      ['app/(default)/payments/page.tsx', 'revenue_collected'],
      ['app/(default)/dashboard/platform-overview.tsx', "'active_clinics'"],
    ]
    for (const [file, key] of wires) expect(readFileSync(file, 'utf8'), `${file} never reads ${key}`).toContain(key)
    // Platform tenant: the UTC note rides the active-clinics line.
    expect(readFileSync('app/(default)/dashboard/platform-overview.tsx', 'utf8')).toMatch(/clinicsBeat[\s\S]{0,400}PLATFORM_BUCKET_NOTE/)
  })
})
