'use client'

import { useState } from 'react'
import {
  FAQ_CATEGORIES,
  DEFAULT_FAQ_ITEMS,
  type ClinicFaqItem,
} from '@/lib/types/clinic-content'
import { AddButton, EditorCard, Field, inputCls, selectCls, textareaCls } from '@/components/ui/editor-kit'

interface Props {
  name: string
  defaultValue?: ClinicFaqItem[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Clinic-level FAQ editor. Emits the same hidden-JSON-input shape every other
 * section editor uses, so it round-trips through saveFaq / updateClinicProfile
 * unchanged. Rows carry a category (grouped on the public /faq page) + question
 * + answer; reorder within the flat list. "Start from the basics" seeds the
 * warm-voice universal set.
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
      const swap = idx + dir
      if (swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }
  function seedDefaults() {
    setItems(DEFAULT_FAQ_ITEMS.map((f) => ({ ...f, id: uid() })))
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />

      {items.length === 0 && (
        <div className="v2-well p-5 text-center">
          <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400 mb-4">
            No questions yet. Patients are more likely to book when you answer their questions about
            insurance, anxiety, or a first visit up front.
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            “Start from the basics” loads {DEFAULT_FAQ_ITEMS.length} universal dental questions you
            can edit or delete.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((f, i) => (
          <EditorCard
            key={f.id}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            canMoveUp={i > 0}
            canMoveDown={i < items.length - 1}
            onRemove={() => remove(i)}
            headerExtra={
              <select
                value={FAQ_CATEGORIES.includes(f.category as never) ? f.category : FAQ_CATEGORIES[0]}
                onChange={(e) => update(i, { category: e.target.value })}
                className={`${selectCls} py-1 text-xs`}
                aria-label="Category"
              >
                {FAQ_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            }
          >
            <Field label="Question">
              <input
                type="text"
                value={f.question}
                onChange={(e) => update(i, { question: e.target.value })}
                className={`${inputCls} font-medium`}
                placeholder="Do you take my insurance?"
                maxLength={240}
              />
            </Field>
            <Field label="Answer">
              <textarea
                value={f.answer}
                onChange={(e) => update(i, { answer: e.target.value })}
                className={textareaCls}
                rows={3}
                placeholder="We accept most major PPO plans — message us your carrier and we'll verify before your visit."
                maxLength={1200}
              />
            </Field>
          </EditorCard>
        ))}
      </div>

      {items.length > 0 && <AddButton onClick={add}>Add question</AddButton>}
    </div>
  )
}
