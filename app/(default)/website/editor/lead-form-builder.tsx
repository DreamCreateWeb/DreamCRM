'use client'

import { useState } from 'react'
import type { LeadFormField, LeadFormFieldType, LeadFormKey } from '@/lib/types/lead-forms'
import { AddButton, EditorCard, Field, inputCls, selectCls, textareaCls } from '@/components/ui/editor-kit'

const TYPE_OPTIONS: { value: LeadFormFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'date', label: 'Date' },
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

  // Mirror the server rules (saveLeadForm) client-side so the owner sees the
  // problem before saving, not after a round-trip: keep ≥1 field, ≥1 reachable
  // (email/phone) field, and no blank labels.
  const hasFields = fields.length > 0
  const hasContact = fields.some((f) => f.systemKey === 'email' || f.systemKey === 'phone')
  const hasBlankLabel = fields.some((f) => !f.label.trim())
  const validationError = !hasFields
    ? 'Add at least one field.'
    : !hasContact
      ? 'Keep at least an email or phone field so leads are reachable.'
      : hasBlankLabel
        ? 'Every field needs a label.'
        : null

  return (
    <div>
      <input type="hidden" name="formKey" value={formKey} />
      <input type="hidden" name="fields" value={JSON.stringify(fields)} />

      {validationError && (
        <p
          className="mb-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md px-2.5 py-1.5"
          role="alert"
        >
          {validationError}
        </p>
      )}

      <div className="space-y-3">
        {fields.map((f, i) => (
          <EditorCard
            key={f.id}
            label={`Field ${i + 1}`}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            canMoveUp={i > 0}
            canMoveDown={i < fields.length - 1}
            onRemove={() => remove(i)}
          >
            <Field label="Label">
              <input
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Field label"
                className={inputCls}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-300">
              <label className="flex items-center gap-1.5">
                <span className="font-medium">Type</span>
                <select
                  value={f.type}
                  disabled={locked(f)}
                  onChange={(e) => update(i, { type: e.target.value as LeadFormFieldType })}
                  className={`${selectCls} py-1 text-xs disabled:opacity-60`}
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
                  className="form-checkbox rounded"
                />
                <span className="font-medium">Required</span>
              </label>
              {f.systemKey && <span className="text-gray-500 dark:text-gray-400">→ saves to {f.systemKey}</span>}
              {f.dynamicOptions && (
                <span className="text-gray-500 dark:text-gray-400">
                  options from your {f.dynamicOptions === 'carriers' ? 'insurance carriers' : 'services'}
                </span>
              )}
            </div>

            {f.type === 'select' && !f.dynamicOptions && (
              <Field label="Options" hint="One per line.">
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
                  placeholder={'Option one\nOption two'}
                  className={textareaCls}
                />
              </Field>
            )}
            {(f.type === 'text' || f.type === 'textarea' || f.type === 'email' || f.type === 'tel') && (
              <Field label="Placeholder" hint="Optional grey hint text shown inside the field.">
                <input
                  value={f.placeholder ?? ''}
                  onChange={(e) => update(i, { placeholder: e.target.value })}
                  placeholder="e.g. jane@example.com"
                  className={inputCls}
                />
              </Field>
            )}
          </EditorCard>
        ))}
      </div>

      <AddButton onClick={add}>Add field</AddButton>
    </div>
  )
}
