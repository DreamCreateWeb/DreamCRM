'use client'

import { useState } from 'react'
import type { LeadFormField, LeadFormFieldType, LeadFormKey } from '@/lib/types/lead-forms'

const TYPE_OPTIONS: { value: LeadFormFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'select', label: 'Dropdown' },
]

function newId() {
  return `field_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Builder for an editable site lead-capture form (Website Studio). Manages the
 * field list (add / remove / reorder / edit) and serialises it into hidden
 * inputs the section modal posts via FormData. Fields that map to a lead column
 * (`systemKey`) or pull live options (`dynamicOptions`) keep those bindings —
 * their label/required/order are editable, but the type/options are locked so
 * the lead mapping and live carrier/service lists stay intact.
 */
export default function LeadFormBuilder({
  formKey,
  defaultValue,
}: {
  formKey: LeadFormKey
  defaultValue: LeadFormField[]
}) {
  const [fields, setFields] = useState<LeadFormField[]>(defaultValue)

  function update(i: number, patch: Partial<LeadFormField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  function remove(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i))
  }
  function move(i: number, dir: -1 | 1) {
    setFields((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function add() {
    setFields((prev) => [
      ...prev,
      { id: newId(), type: 'text', label: 'New field', required: false },
    ])
  }

  const locked = (f: LeadFormField) => Boolean(f.systemKey) || Boolean(f.dynamicOptions)

  return (
    <div>
      <input type="hidden" name="formKey" value={formKey} />
      <input type="hidden" name="fields" value={JSON.stringify(fields)} />

      <div className="space-y-3">
        {fields.map((f, i) => (
          <div
            key={f.id}
            className="rounded-xl border border-stone-200 dark:border-stone-700/60 p-3 bg-stone-50/60 dark:bg-stone-800/40"
          >
            <div className="flex items-center gap-2 mb-2">
              <input
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Field label"
                className="form-input flex-1 text-sm py-1.5"
              />
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-stone-400 hover:text-stone-700 disabled:opacity-30 leading-none text-xs"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === fields.length - 1}
                  className="text-stone-400 hover:text-stone-700 disabled:opacity-30 leading-none text-xs"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-rose-500 hover:text-rose-700 text-sm px-1"
                aria-label="Remove field"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[12px] text-stone-600 dark:text-stone-300">
              <label className="flex items-center gap-1.5">
                <span>Type</span>
                <select
                  value={f.type}
                  disabled={locked(f)}
                  onChange={(e) => update(i, { type: e.target.value as LeadFormFieldType })}
                  className="form-select text-[12px] py-1 disabled:opacity-60"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={Boolean(f.required)}
                  onChange={(e) => update(i, { required: e.target.checked })}
                  className="form-checkbox"
                />
                <span>Required</span>
              </label>
              {f.systemKey && (
                <span className="text-stone-400">→ saves to {f.systemKey}</span>
              )}
              {f.dynamicOptions && (
                <span className="text-stone-400">
                  options from your {f.dynamicOptions === 'carriers' ? 'insurance carriers' : 'services'}
                </span>
              )}
            </div>

            {f.type === 'select' && !f.dynamicOptions && (
              <textarea
                value={(f.options ?? []).join('\n')}
                onChange={(e) =>
                  update(i, {
                    options: e.target.value
                      .split('\n')
                      .map((o) => o.trim())
                      .filter(Boolean),
                  })
                }
                rows={3}
                placeholder={'One option per line'}
                className="form-textarea w-full text-[12px] mt-2"
              />
            )}
            {(f.type === 'text' || f.type === 'textarea' || f.type === 'email' || f.type === 'tel') && (
              <input
                value={f.placeholder ?? ''}
                onChange={(e) => update(i, { placeholder: e.target.value })}
                placeholder="Placeholder (optional)"
                className="form-input w-full text-[12px] py-1.5 mt-2"
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-3 text-[13px] font-semibold text-stone-700 dark:text-stone-200 hover:underline"
      >
        + Add field
      </button>
    </div>
  )
}
