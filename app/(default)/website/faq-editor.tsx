'use client'

import { useState } from 'react'
import {
  FAQ_CATEGORIES,
  DEFAULT_FAQ_ITEMS,
  type ClinicFaqItem,
} from '@/lib/types/clinic-content'

interface Props {
  name: string
  defaultValue?: ClinicFaqItem[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Clinic-level FAQ editor — fills the long-standing gap where `clinic_profile.faq`
 * had a column + universal defaults but no UI. Emits the same hidden-JSON-input
 * shape every other section editor uses, so it round-trips through saveFaq /
 * updateClinicProfile unchanged. Rows carry a category (grouped on the public
 * /faq page) + question + answer; reorder within the flat list, group is by the
 * category field. "Start from the basics" seeds the warm-voice universal set.
 */
export default function FaqEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicFaqItem[]>(defaultValue ?? [])

  function update(idx: number, patch: Partial<ClinicFaqItem>) {
    setItems((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setItems((prev) => [
      ...prev,
      { id: uid(), category: FAQ_CATEGORIES[0], question: '', answer: '' },
    ])
  }
  function move(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }
  function seedDefaults() {
    // Fresh ids so they're treated as this clinic's own rows.
    setItems(DEFAULT_FAQ_ITEMS.map((f) => ({ ...f, id: uid() })))
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            No FAQ yet. Patients with questions about insurance, anxiety, or their
            first visit convert better when you answer them up front.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={seedDefaults}
              className="btn-sm bg-violet-600 hover:bg-violet-700 text-white"
            >
              ✨ Start from the basics
            </button>
            <button
              type="button"
              onClick={add}
              className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
            >
              + Add blank question
            </button>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
            &ldquo;Start from the basics&rdquo; loads {DEFAULT_FAQ_ITEMS.length} universal dental
            questions you can edit or delete.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((f, i) => (
          <div
            key={f.id}
            className="p-3 border border-gray-100 dark:border-gray-700/60 rounded-lg space-y-2"
          >
            <div className="flex items-center gap-2">
              <select
                value={FAQ_CATEGORIES.includes(f.category as never) ? f.category : FAQ_CATEGORIES[0]}
                onChange={(e) => update(i, { category: e.target.value })}
                className="form-select text-xs py-1 w-40"
                aria-label="Category"
              >
                {FAQ_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="grow" />
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs text-red-500 hover:text-red-600 ml-1"
              >
                Remove
              </button>
            </div>
            <input
              type="text"
              value={f.question}
              onChange={(e) => update(i, { question: e.target.value })}
              className="form-input w-full text-sm font-medium"
              placeholder="Do you take my insurance?"
              aria-label="Question"
              maxLength={240}
            />
            <textarea
              value={f.answer}
              onChange={(e) => update(i, { answer: e.target.value })}
              className="form-textarea w-full text-sm"
              rows={2}
              placeholder="We accept most major PPO plans — message us your carrier and we'll verify before your visit."
              aria-label="Answer"
              maxLength={1200}
            />
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <button
          type="button"
          onClick={add}
          className="mt-3 btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
        >
          + Add Question
        </button>
      )}
    </div>
  )
}
