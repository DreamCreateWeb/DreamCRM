/**
 * Server-rendered SVG sparkline / sparkbar — zero JS, zero deps.
 *
 * Used by the Platform Metrics dashboard to plot weekly / monthly trends
 * without dragging chart.js into a server component.
 */

interface SparklineProps {
  data: Array<{ bucket: string; value: number }>
  /** 'line' draws a polyline; 'bar' draws a column chart. */
  variant?: 'line' | 'bar'
  /** Hex/CSS color for the stroke or bar fill. */
  color?: string
  height?: number
  width?: number
  /** Show the value at each point as a tooltip via <title>. */
  labels?: boolean
}

export default function Sparkline({
  data,
  variant = 'line',
  color = '#8b5cf6',
  height = 48,
  width = 240,
  labels = true,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className="text-xs text-gray-400 dark:text-gray-500 italic flex items-center justify-center"
        style={{ height, width }}
      >
        No data yet
      </div>
    )
  }

  const values = data.map((d) => d.value)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)

  const padding = 2
  const w = width - padding * 2
  const h = height - padding * 2
  const stepX = data.length > 1 ? w / (data.length - 1) : 0
  const y = (v: number) => padding + h - ((v - min) / range) * h

  if (variant === 'bar') {
    const barW = w / data.length - 2
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
        {data.map((d, i) => {
          const yTop = y(d.value)
          const barH = padding + h - yTop
          return (
            <rect
              key={d.bucket}
              x={padding + i * (w / data.length) + 1}
              y={yTop}
              width={barW}
              height={Math.max(barH, 1)}
              fill={color}
              opacity={0.85}
              rx={1}
            >
              {labels && <title>{`${d.bucket}: ${d.value}`}</title>}
            </rect>
          )
        })}
      </svg>
    )
  }

  // Line variant
  const points = data.map((d, i) => `${padding + i * stepX},${y(d.value)}`).join(' ')
  const areaPath =
    data.length > 1
      ? `M ${padding},${padding + h} L ${points.split(' ').join(' L ')} L ${padding + (data.length - 1) * stepX},${padding + h} Z`
      : ''

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      {areaPath && <path d={areaPath} fill={color} opacity={0.12} />}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle
          key={d.bucket}
          cx={padding + i * stepX}
          cy={y(d.value)}
          r={1.5}
          fill={color}
        >
          {labels && <title>{`${d.bucket}: ${d.value}`}</title>}
        </circle>
      ))}
    </svg>
  )
}
