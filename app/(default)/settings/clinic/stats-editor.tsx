'use client'

import { useState } from 'react'
import type { ClinicStat } from '@/lib/types/clinic-content'

interface Props {
  name: string
  defaultValue?: ClinicStat[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const PLACEHOLDERS: { value: string; label: string }[] = [
  { value: '8,000+', label: 'five-star reviews' },
  { value: 'Same-week', label: 'appointments available' },
  { value: 'Most', label: 'insurance accepted' },
]

export default function StatsEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicStat[]>(defaultValue ?? [])

  function update(idx: number, patch: Partial<ClinicStat>) {
    setItems((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setItems((prev) => [...prev, { id: uid(), value: '', label: '' }])
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            No stats yet. Add 3 short trust signals — they sit just below your hero on the website.
          </p>
        )}
        {items.map((s, i) => {
          const ph = PLACEHOLDERS[i] ?? PLACEHOLDERS[0]
          return (
            <div
              key={s.id}
              className="flex items-start gap-3 p-3 border border-gray-100 dark:border-gray-700/60 rounded-lg"
            >
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2">
                <input
                  type="text"
                  value={s.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                  className="form-input text-base font-semibold"
                  placeholder={ph.value}
                  aria-label="Headline value"
                  maxLength={32}
                />
                <input
                  type="text"
                  value={s.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  className="form-input text-sm"
                  placeholder={ph.label}
                  aria-label="Label"
                  maxLength={64}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs text-red-500 hover:text-red-600 mt-2"
              >
                Remove
              </button>
            </div>
          )
        })}
      </div>
      {items.length < 4 && (
        <button
          type="button"
          onClick={add}
          className="mt-3 btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
        >
          + Add Stat
        </button>
      )}
    </div>
  )
}
