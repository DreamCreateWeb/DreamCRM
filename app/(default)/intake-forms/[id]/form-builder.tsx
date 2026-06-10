'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { FormTemplate } from '@/lib/db/schema/clinic'
import type {
  FormField,
  FormFieldType,
  FormSection,
  FormTemplateSchema,
} from '@/lib/types/forms'
import { archiveFormAction, saveFormAction } from '../actions'
import { ActionButton } from '@/components/ui/action-button'

interface Props {
  template: FormTemplate
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Text',
  textarea: 'Long text',
  email: 'Email',
  tel: 'Phone',
  date: 'Date',
  select: 'Dropdown',
  radio: 'Single choice',
  checkbox: 'Multiple choice',
  yes_no: 'Yes / No',
  signature: 'Signature',
}

function isChoiceField(type: FormFieldType): boolean {
  return type === 'select' || type === 'radio' || type === 'checkbox'
}

function newField(type: FormFieldType): FormField {
  const base = { id: uid(), label: 'Untitled question', required: false, help: null, systemKey: null }
  if (isChoiceField(type)) {
    return { ...base, type: type as 'select' | 'radio' | 'checkbox', options: ['Option 1'] }
  }
  if (type === 'yes_no') return { ...base, type: 'yes_no' }
  if (type === 'signature') return { ...base, type: 'signature' }
  return { ...base, type: type as 'text' | 'textarea' | 'email' | 'tel' | 'date', placeholder: null }
}

export default function FormBuilder({ template }: Props) {
  const initialSchema = template.schema as FormTemplateSchema
  const [title, setTitle] = useState(template.title)
  const [description, setDescription] = useState(template.description ?? '')
  const [isDefault, setIsDefault] = useState(template.isDefault === 1)
  const [sections, setSections] = useState<FormSection[]>(
    initialSchema.sections ?? [],
  )
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateSection(idx: number, patch: Partial<FormSection>) {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function removeSection(idx: number) {
    setSections((prev) => prev.filter((_, i) => i !== idx))
  }
  function addSection() {
    setSections((prev) => [
      ...prev,
      { id: uid(), title: 'New section', description: null, fields: [] },
    ])
  }
  function moveSection(idx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy
    })
  }

  function addField(sectionIdx: number, type: FormFieldType) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx ? { ...s, fields: [...s.fields, newField(type)] } : s,
      ),
    )
  }
  function updateField(sectionIdx: number, fieldIdx: number, patch: Partial<FormField>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              fields: s.fields.map((f, j) =>
                j === fieldIdx ? ({ ...f, ...patch } as FormField) : f,
              ),
            }
          : s,
      ),
    )
  }
  function removeField(sectionIdx: number, fieldIdx: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? { ...s, fields: s.fields.filter((_, j) => j !== fieldIdx) }
          : s,
      ),
    )
  }
  function moveField(sectionIdx: number, fieldIdx: number, dir: -1 | 1) {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sectionIdx) return s
        const next = fieldIdx + dir
        if (next < 0 || next >= s.fields.length) return s
        const copy = [...s.fields]
        ;[copy[fieldIdx], copy[next]] = [copy[next], copy[fieldIdx]]
        return { ...s, fields: copy }
      }),
    )
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await saveFormAction(template.id, {
          title: title.trim() || 'Untitled form',
          description: description.trim() || null,
          schema: { sections },
          isDefault,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save')
      }
    })
  }

  async function handleArchive() {
    if (!confirm('Archive this form? Existing submissions are kept; the form stops accepting new ones.')) return
    startTransition(async () => {
      try {
        await archiveFormAction(template.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not archive')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/intake-forms"
          className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          ← All intake forms
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Form title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="form-input w-full text-lg font-semibold"
            placeholder="New Patient Intake"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Description (shown to patients)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="form-textarea w-full"
            rows={2}
            placeholder="Optional context that appears above the form."
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="form-checkbox"
          />
          <span className="text-gray-700 dark:text-gray-200">
            Default form — sent automatically with booking confirmations
          </span>
        </label>
      </div>

      {/* Sections */}
      {sections.map((section, si) => (
        <div
          key={section.id}
          className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5 space-y-4 border border-gray-100 dark:border-gray-700/60"
        >
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-1 mt-1">
              <button
                type="button"
                onClick={() => moveSection(si, -1)}
                disabled={si === 0}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
                aria-label="Move section up"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveSection(si, 1)}
                disabled={si === sections.length - 1}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
                aria-label="Move section down"
              >
                ▼
              </button>
            </div>
            <div className="flex-1 space-y-3">
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSection(si, { title: e.target.value })}
                className="form-input w-full text-base font-semibold"
                placeholder="Section title"
              />
              <input
                type="text"
                value={section.description ?? ''}
                onChange={(e) => updateSection(si, { description: e.target.value || null })}
                className="form-input w-full text-sm"
                placeholder="Optional section description"
              />
            </div>
            <button
              type="button"
              onClick={() => removeSection(si)}
              className="text-xs text-red-500 hover:text-red-600 mt-2"
            >
              Remove section
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-3 pl-6 border-l-2 border-gray-100 dark:border-gray-700/60 ml-2">
            {section.fields.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">No fields yet — add one below.</p>
            )}
            {section.fields.map((field, fi) => (
              <FieldRow
                key={field.id}
                field={field}
                onChange={(patch) => updateField(si, fi, patch)}
                onRemove={() => removeField(si, fi)}
                onMoveUp={fi > 0 ? () => moveField(si, fi, -1) : undefined}
                onMoveDown={fi < section.fields.length - 1 ? () => moveField(si, fi, 1) : undefined}
              />
            ))}
          </div>

          {/* Add field menu */}
          <FieldTypeMenu onPick={(type) => addField(si, type)} />
        </div>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-200"
      >
        + Add Section
      </button>

      {/* Save bar */}
      <div className="sticky bottom-4 bg-white dark:bg-gray-800 shadow-lg rounded-xl px-5 py-4 flex items-center justify-between border border-gray-100 dark:border-gray-700/60">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {error && <span className="text-red-600">{error}</span>}
          {saved && <span className="text-emerald-600">Saved ✓</span>}
          {!error && !saved && (
            <span>
              {sections.length} section{sections.length === 1 ? '' : 's'} ·{' '}
              {sections.reduce((n, s) => n + s.fields.length, 0)} field
              {sections.reduce((n, s) => n + s.fields.length, 0) === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleArchive}
            disabled={pending}
            className="text-sm text-rose-600 hover:text-rose-700 dark:text-rose-400 disabled:opacity-50"
          >
            Archive
          </button>
          <ActionButton type="button" variant="primary" onClick={handleSave} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function FieldRow({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  field: FormField
  onChange: (patch: Partial<FormField>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 mt-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
            aria-label="Move field up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none"
            aria-label="Move field down"
          >
            ▼
          </button>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs font-semibold uppercase tracking-wider bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
              {FIELD_TYPE_LABELS[field.type]}
            </span>
            <label className="text-xs flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="form-checkbox"
              />
              Required
            </label>
          </div>
          <input
            type="text"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="form-input w-full"
            placeholder="Question text"
          />
          <input
            type="text"
            value={field.help ?? ''}
            onChange={(e) => onChange({ help: e.target.value || null })}
            className="form-input w-full text-sm"
            placeholder="Help text (optional)"
          />

          {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
            <div className="space-y-1.5 mt-1">
              {field.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...field.options]
                      next[i] = e.target.value
                      onChange({ options: next })
                    }}
                    className="form-input flex-1 text-sm"
                    placeholder={`Option ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = field.options.filter((_, j) => j !== i)
                      onChange({ options: next.length ? next : ['Option 1'] })
                    }}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onChange({ options: [...field.options, `Option ${field.options.length + 1}`] })}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                + Add option
              </button>
            </div>
          )}

          {(field.type === 'text' ||
            field.type === 'textarea' ||
            field.type === 'email' ||
            field.type === 'tel' ||
            field.type === 'date') && (
            <input
              type="text"
              value={field.placeholder ?? ''}
              onChange={(e) => onChange({ placeholder: e.target.value || null })}
              className="form-input w-full text-sm"
              placeholder="Placeholder (optional)"
            />
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-600 mt-2"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function FieldTypeMenu({ onPick }: { onPick: (type: FormFieldType) => void }) {
  const types: FormFieldType[] = [
    'text',
    'textarea',
    'email',
    'tel',
    'date',
    'select',
    'radio',
    'checkbox',
    'yes_no',
    'signature',
  ]
  return (
    <details className="ml-8">
      <summary className="text-sm text-violet-600 dark:text-violet-400 cursor-pointer hover:underline list-none">
        + Add field
      </summary>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-2">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-left"
          >
            {FIELD_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </details>
  )
}
