'use client'

import { useMemo } from 'react'
import DoughnutChart from '@/components/charts/doughnut-chart'
import type { ChartData } from 'chart.js'

export interface DoughnutSlice {
  label: string
  value: number
  color: string
}

export default function PlanDoughnut({ slices }: { slices: DoughnutSlice[] }) {
  const chartData = useMemo<ChartData>(() => ({
    labels: slices.map(s => s.label),
    datasets: [{
      data: slices.map(s => s.value),
      backgroundColor: slices.map(s => s.color),
      hoverBackgroundColor: slices.map(s => s.color),
      borderWidth: 0,
    }],
  }), [slices])

  return <DoughnutChart data={chartData} width={389} height={260} />
}
