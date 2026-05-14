'use client'

import { useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip,
} from 'chart.js'
import { chartColors } from '@/components/charts/chartjs-config'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

export interface MonthPoint { month: string; value: number }

interface Props {
  data: MonthPoint[]
  color?: string
  formatLabel?: (v: number) => string
}

function fmtMonth(yyyyMm: string) {
  const [y, m] = yyyyMm.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export default function MonthBarChart({ data, color = '#8b5cf6', formatLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const { theme } = useTheme()
  const dark = theme === 'dark'

  useEffect(() => {
    if (!canvasRef.current) return
    chartRef.current?.destroy()

    const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors
    const fmt = formatLabel ?? String

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map(d => fmtMonth(d.month)),
        datasets: [{
          data: data.map(d => d.value),
          backgroundColor: color,
          hoverBackgroundColor: color,
          barPercentage: 0.66,
          categoryPercentage: 0.66,
          borderRadius: 3,
        }],
      },
      options: {
        layout: { padding: { top: 12, bottom: 16, left: 20, right: 20 } },
        scales: {
          y: {
            border: { display: false },
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 5,
              color: dark ? textColor.dark : textColor.light,
              callback: (v) => fmt(+v),
            },
            grid: { color: dark ? gridColor.dark : gridColor.light },
          },
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: { color: dark ? textColor.dark : textColor.light },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label ?? '',
              label: (ctx) => fmt(ctx.parsed.y),
            },
            bodyColor: dark ? tooltipBodyColor.dark : tooltipBodyColor.light,
            backgroundColor: dark ? tooltipBgColor.dark : tooltipBgColor.light,
            borderColor: dark ? tooltipBorderColor.dark : tooltipBorderColor.light,
          },
        },
        interaction: { intersect: false, mode: 'nearest' },
        animation: { duration: 300 },
        maintainAspectRatio: false,
        resizeDelay: 200,
      },
    })
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [data, color, dark])

  return (
    <div className="grow">
      <canvas ref={canvasRef} width={595} height={248}></canvas>
    </div>
  )
}
