'use client'

import type { FormField, FormSection } from '@/lib/types/forms'

/**
 * Live, read-only "what the patient sees" pane for the intake form builder.
 * Renders the current (unsaved) schema exactly as a patient would meet it —
 * section headings, every field's label / help / required marker, and a
 * disabled input matching each field type — so staff can build with the
 * patient's-eye view side-by-side instead of save → open a new tab → come back.
 *
 * Deliberately NOT the public IntakeFormRunner: that component is a submitting,
 * brand-themed, network-coupled patient flow. A preview only needs to MIRROR
 * its field rendering, read-only, with zero risk to the live submission path.
 */
export default function FormPreview({
  title,
  description,
  sections,
  className = '',
}: {
  title: string
  description: string
  sections: FormSection[]
  className?: string
}) {
  const fieldCount = sections.reduce((n, s) => n + s.fields.length, 0)
  return (
    <aside className={className} aria-label="Form preview">
      <div className="sticky top-20">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Live preview · what patients see
        </p>
        <div className="v2-card max-h-[calc(100vh-7rem)] overflow-y-auto p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title || 'Untitled form'}</h2>
          {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}

          {fieldCount === 0 ? (
            <p className="mt-4 text-sm italic text-gray-400 dark:text-gray-500">
              Add a question and it appears here, just as your patients will see it.
            </p>
          ) : (
            <div className="mt-5 space-y-6">
              {sections.map((s) => (
                <section key={s.id}>
                  {s.title && (
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{s.title}</h3>
                  )}
                  {s.description && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{s.description}</p>
                  )}
                  <div className="mt-3 space-y-4">
                    {s.fields.map((f) => (
                      <PreviewField key={f.id} field={f} />
                    ))}
                    {s.fields.length === 0 && (
                      <p className="text-xs italic text-gray-400 dark:text-gray-500">No questions in this section yet.</p>
                    )}
                  </div>
                </section>
              ))}
              {/* Echo the real form's submit affordance, inert in the preview. */}
              <button
                type="button"
                disabled
                aria-hidden="true"
                className="w-full cursor-default rounded-full bg-teal-600/60 py-3 text-sm font-semibold text-white"
              >
                Submit
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function PreviewField({ field }: { field: FormField }) {
  // A display-only instructions block: heading + body, no input/required marker.
  if (field.type === 'content') {
    return (
      <div className="rounded-[var(--r-sm)] bg-gray-50 dark:bg-gray-900/40 p-3">
        {field.label && <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{field.label}</p>}
        <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300">{field.body}</p>
      </div>
    )
  }
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
        {field.label || 'Untitled question'}
        {field.required && <span className="text-rose-500"> *</span>}
      </label>
      {field.help && <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{field.help}</p>}
      <PreviewControl field={field} />
    </div>
  )
}

function PreviewControl({ field }: { field: FormField }) {
  switch (field.type) {
    case 'textarea':
      return <textarea disabled rows={3} placeholder={field.placeholder ?? ''} className="form-textarea w-full bg-gray-50 dark:bg-gray-900/40" />
    case 'date':
      return <input type="date" disabled className="form-input w-full bg-gray-50 dark:bg-gray-900/40" />
    case 'text':
    case 'email':
    case 'tel':
    case 'number':
      return (
        <input
          type={field.type === 'number' ? 'number' : field.type}
          disabled
          placeholder={field.placeholder ?? ''}
          className="form-input w-full bg-gray-50 dark:bg-gray-900/40"
        />
      )
    case 'select':
      return (
        <select disabled className="form-select w-full bg-gray-50 dark:bg-gray-900/40">
          <option>{field.options[0] ?? 'Choose…'}</option>
        </select>
      )
    case 'radio':
      return (
        <div className="space-y-1.5">
          {field.options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="radio" disabled className="form-radio" />
              {opt}
            </label>
          ))}
        </div>
      )
    case 'checkbox':
      return (
        <div className="space-y-1.5">
          {field.options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" disabled className="form-checkbox" />
              {opt}
            </label>
          ))}
        </div>
      )
    case 'yes_no':
      return (
        <div className="flex gap-4">
          {['Yes', 'No'].map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="radio" disabled className="form-radio" />
              {opt}
            </label>
          ))}
        </div>
      )
    case 'signature':
      return (
        <div className="grid h-16 place-items-center rounded-[var(--r-sm)] border border-dashed border-[color:var(--color-hairline-strong)] text-xs italic text-gray-400 dark:text-gray-500">
          Signature
        </div>
      )
    case 'file':
      return (
        <div className="grid h-16 place-items-center rounded-[var(--r-sm)] border border-dashed border-[color:var(--color-hairline-strong)] text-xs italic text-gray-400 dark:text-gray-500">
          📎 {field.imagesOnly !== false ? 'Photo upload' : 'File upload'}
        </div>
      )
    case 'insurance_card':
      return (
        <div className="grid grid-cols-2 gap-2">
          {['Front', 'Back'].map((side) => (
            <div
              key={side}
              className="grid h-16 place-items-center rounded-[var(--r-sm)] border border-dashed border-[color:var(--color-hairline-strong)] text-xs italic text-gray-400 dark:text-gray-500"
            >
              📷 {side}
            </div>
          ))}
        </div>
      )
    case 'content':
      // Rendered by PreviewField (no labeled control).
      return null
  }
}
