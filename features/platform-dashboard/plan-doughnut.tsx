'use client'

export interface DoughnutSlice {
  label: string
  value: number
  color: string
}

export default function PlanDoughnut({ slices }: { slices: DoughnutSlice[] }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0)
  if (total === 0) return null

  return (
    <div className="grow flex flex-col justify-center px-5 py-6 gap-4">
      {/* Stacked bar */}
      <div className="flex h-5 rounded-full overflow-hidden">
        {slices.map((sl) => (
          <div
            key={sl.label}
            style={{ width: `${(sl.value / total) * 100}%`, backgroundColor: sl.color }}
            title={`${sl.label}: ${sl.value}`}
          />
        ))}
      </div>

      {/* Rows */}
      <ul className="space-y-2.5">
        {slices.map((sl) => (
          <li key={sl.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: sl.color }}
              />
              {sl.label}
            </span>
            <span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
              {sl.value}
              <span className="ml-1 text-xs font-normal text-gray-400">
                ({Math.round((sl.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
