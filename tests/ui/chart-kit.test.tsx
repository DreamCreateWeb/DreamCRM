/**
 * The chart kit (components/ui/charts) — the Recharts rollout (2026-07-26).
 * The old hand-rolled polylines had no hover, no axes, no numbers; the kit is
 * the single home for what a DreamCRM graph is. Proves:
 *  - TrendChart renders a real chart: plot, axis ticks (thinned, first+last
 *    kept), gridlines, an AT label — in all three kinds;
 *  - MiniTrend renders the plot + a tooltip layer at spark size;
 *  - both degrade to an honest "No data yet" (never a broken 0-size chart);
 *  - the series tokens are the validated fixed order (never cycled, never an
 *    ad-hoc hex) and the legacy Sparkline wrapper delegates to the kit;
 *  - no surface outside the kit hand-rolls a chart anymore (the polyline
 *    guard).
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import React from 'react'
import TrendChart from '@/components/ui/charts/trend-chart'
import MiniTrend from '@/components/ui/charts/mini-trend'
import Sparkline from '@/components/ui/sparkline'
import { CHART_SERIES, tickIndices } from '@/components/ui/charts/chart-theme'

const WEEKS = Array.from({ length: 12 }, (_, i) => ({ bucket: `W${i + 1}`, value: (i % 5) + 1 }))

describe('TrendChart', () => {
  it('renders a real area chart: curve, gridlines, thinned axis ticks, AT label', () => {
    const { container } = render(
      <TrendChart data={WEEKS} ariaLabel="New patients per week over the last 12 weeks" />,
    )
    const root = container.querySelector('[data-chart="trend-area"]')!
    expect(root).toBeTruthy()
    expect(root.getAttribute('role')).toBe('img')
    expect(root.getAttribute('aria-label')).toContain('New patients')
    expect(root.querySelectorAll('.recharts-area-curve').length).toBe(1)
    expect(root.querySelectorAll('.recharts-cartesian-grid line').length).toBeGreaterThan(0)
    // Tick thinning: 12 buckets → ~6 labeled, first + last always kept.
    const tickText = Array.from(root.querySelectorAll('.recharts-cartesian-axis-tick-value'))
      .map((t) => t.textContent)
      .filter(Boolean)
    expect(tickText).toContain('W1')
    expect(tickText).toContain('W12')
  })

  it('renders line and bar kinds through the same contract', () => {
    const line = render(<TrendChart data={WEEKS} kind="line" ariaLabel="x" />).container
    expect(line.querySelectorAll('.recharts-line-curve').length).toBe(1)
    const bar = render(<TrendChart data={WEEKS} kind="bar" ariaLabel="x" />).container
    expect(bar.querySelectorAll('.recharts-bar-rectangle').length).toBe(WEEKS.length)
  })

  it('empty data degrades to the honest empty state', () => {
    const { container } = render(<TrendChart data={[]} ariaLabel="x" />)
    expect(container.querySelector('[data-chart="trend-empty"]')!.textContent).toContain(
      'No data yet',
    )
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('MiniTrend + the Sparkline compat wrapper', () => {
  it('renders the plot and a tooltip layer at spark size', () => {
    const { container } = render(<MiniTrend data={WEEKS.slice(0, 8)} width={104} height={26} />)
    const root = container.querySelector('[data-chart="mini-line"]')!
    expect(root.querySelectorAll('.recharts-line-curve').length).toBe(1)
    expect(root.querySelector('.recharts-tooltip-wrapper')).toBeTruthy()
  })

  it('Sparkline delegates to the kit (the 8 legacy call sites upgrade in place)', () => {
    const { container } = render(<Sparkline data={WEEKS.slice(0, 8)} variant="bar" />)
    expect(container.querySelector('[data-chart="mini-bar"]')).toBeTruthy()
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBe(8)
  })

  it('empty data degrades honestly', () => {
    const { container } = render(<MiniTrend data={[]} />)
    expect(container.querySelector('[data-chart="mini-empty"]')!.textContent).toContain(
      'No data yet',
    )
  })
})

describe('the series tokens', () => {
  it('are the validated fixed-order custom properties (see app/css/style.css)', () => {
    expect(CHART_SERIES).toEqual([
      'var(--color-chart-1)',
      'var(--color-chart-2)',
      'var(--color-chart-3)',
      'var(--color-chart-4)',
    ])
  })

  it('tickIndices keeps first + last and hits the target count', () => {
    expect(tickIndices(4)).toEqual([0, 1, 2, 3])
    const t = tickIndices(30)
    expect(t[0]).toBe(0)
    expect(t[t.length - 1]).toBe(29)
    expect(t.length).toBeLessThanOrEqual(7)
  })
})

/**
 * THE GUARD: nobody hand-rolls a chart again. A raw SVG <polyline> in the
 * dashboard surface is exactly the no-hover no-numbers decoration this
 * rollout deleted — new trends go through the kit.
 */
describe('no hand-rolled charts outside the kit', () => {
  const ROOT = resolve(__dirname, '../..')
  const SCAN = [join(ROOT, 'app/(default)'), join(ROOT, 'app/(double-sidebar)'), join(ROOT, 'components/ui')]

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx$/.test(full)) out.push(full)
    }
    return out
  }

  it('no raw <polyline in dashboard surfaces', () => {
    const offenders: string[] = []
    for (const full of SCAN.flatMap((d) => walk(d))) {
      const rel = full.slice(ROOT.length + 1)
      if (rel.startsWith('components/ui/charts/')) continue
      if (/<polyline/.test(readFileSync(full, 'utf8'))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
