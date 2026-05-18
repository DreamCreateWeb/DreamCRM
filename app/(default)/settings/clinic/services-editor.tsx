'use client'

import { useState } from 'react'
import type { ClinicService } from '@/lib/types/clinic-content'

interface Props {
  name: string
  defaultValue?: ClinicService[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export default function ServicesEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicService[]>(defaultValue ?? [])

  function update(idx: number, patch: Partial<ClinicService>) {
    setItems((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setItems((prev) => [...prev, { id: uid(), name: '', description: '', icon: '🦷' }])
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            No services yet — clinic site will show a default set until you add some.
          </p>
        )}
        {items.map((s, i) => (
          <div
            key={s.id}
            className="flex items-start gap-3 p-3 border border-gray-100 dark:border-gray-700/60 rounded-lg"
          >
            <input
              type="text"
              value={s.icon ?? ''}
              onChange={(e) => update(i, { icon: e.target.value })}
              className="form-input w-16 text-center text-lg"
              placeholder="🦷"
              aria-label="Icon"
              maxLength={4}
            />
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className="form-input w-full"
                placeholder="Service name (e.g. Teeth Whitening)"
              />
              <input
                type="text"
                value={s.description ?? ''}
                onChange={(e) => update(i, { description: e.target.value })}
                className="form-input w-full text-sm"
                placeholder="Short description (optional)"
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
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-3 btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
      >
        + Add Service
      </button>
    </div>
  )
}
