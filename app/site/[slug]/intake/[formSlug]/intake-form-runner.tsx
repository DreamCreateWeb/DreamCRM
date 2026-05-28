'use client'

import { useMemo, useState } from 'react'
import type {
  FormField,
  FormFieldValue,
  FormSubmissionData,
  FormTemplateSchema,
} from '@/lib/types/forms'

export interface IntakeSubmitPayload {
  orgId: string
  templateId: string
  data: FormSubmissionData
  submitterName: string | null
  submitterEmail: string | null
  submitterPhone: string | null
}

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const SURFACE = '#FFFFFF'
const BG = '#FAF7F2'
const BORDER = '#E8E2D9'

interface Props {
  orgId: string
  templateId: string
  schema: FormTemplateSchema
  brand: string
  clinicName: string
  /** Server action that persists the submission. Public form passes the
   *  unauthenticated action; the patient portal passes one that attaches
   *  `patientId` from the session. */
  action: (payload: IntakeSubmitPayload) => Promise<void>
}

export default function IntakeFormRunner({ orgId, templateId, schema, brand, clinicName, action }: Props) {
  const [values, setValues] = useState<FormSubmissionData>({})
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Pull the "system" fields (name / email / phone) up to the submitter
  // record at submit time, so the clinic can see who filled the form
  // even when there's no patientId attached yet.
  const submitter = useMemo(() => {
    const first = values['first_name']
    const last = values['last_name']
    const name = [first, last].filter((x): x is string => typeof x === 'string' && !!x).join(' ')
    return {
      name: name || null,
      email: typeof values['email'] === 'string' ? (values['email'] as string) : null,
      phone: typeof values['phone'] === 'string' ? (values['phone'] as string) : null,
    }
  }, [values])

  function setValue(fieldId: string, value: FormFieldValue) {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
  }

  function validate(): string | null {
    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (!field.required) continue
        const v = values[field.id]
        if (
          v == null ||
          v === '' ||
          (Array.isArray(v) && v.length === 0) ||
          (field.type === 'yes_no' && typeof v !== 'boolean')
        ) {
          return `“${field.label}” is required.`
        }
      }
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setErrorMsg(validationError)
      setStatus('error')
      return
    }
    setStatus('pending')
    setErrorMsg('')
    try {
      await action({
        orgId,
        templateId,
        data: values,
        submitterName: submitter.name,
        submitterEmail: submitter.email,
        submitterPhone: submitter.phone,
      })
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not submit — try again.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div
        className="rounded-2xl p-10 text-center"
        style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
      >
        <div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
          style={{ backgroundColor: brand + '22' }}
        >
          <svg
            className="w-10 h-10"
            style={{ color: brand }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold tracking-[-0.02em] mb-3" style={{ color: INK }}>
          You&rsquo;re all set.
        </h2>
        <p className="leading-relaxed max-w-sm mx-auto" style={{ color: INK_MUTED }}>
          {clinicName} has your form. We&rsquo;ll see you at your appointment.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {schema.sections.map((section, si) => (
        <section
          key={section.id}
          className="rounded-2xl p-6 sm:p-8 space-y-5"
          style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-2"
              style={{ color: brand }}
            >
              {String(si + 1).padStart(2, '0')} · {section.title}
            </p>
            {section.description && (
              <p className="text-sm leading-relaxed" style={{ color: INK_MUTED }}>
                {section.description}
              </p>
            )}
          </div>
          <div className="space-y-5">
            {section.fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={values[field.id]}
                onChange={(v) => setValue(field.id, v)}
                brand={brand}
              />
            ))}
          </div>
        </section>
      ))}

      {status === 'error' && errorMsg && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'pending'}
        className="w-full py-4 rounded-full text-base font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
        style={{ backgroundColor: brand }}
      >
        {status === 'pending' ? 'Submitting…' : 'Submit'}
      </button>
      <p className="text-xs text-center" style={{ color: INK_MUTED }}>
        Your responses go directly to {clinicName} and are kept confidential.
      </p>
    </form>
  )
}

function FieldInput({
  field,
  value,
  onChange,
  brand,
}: {
  field: FormField
  value: FormFieldValue | undefined
  onChange: (v: FormFieldValue) => void
  brand: string
}) {
  const labelEl = (
    <label
      className="block text-sm font-medium mb-2"
      style={{ color: INK }}
      htmlFor={`f-${field.id}`}
    >
      {field.label}
      {field.required && <span style={{ color: '#E87B5E' }}> *</span>}
    </label>
  )
  const helpEl = field.help ? (
    <p className="text-xs mt-1.5" style={{ color: INK_MUTED }}>
      {field.help}
    </p>
  ) : null

  const inputStyle = {
    backgroundColor: BG,
    color: INK,
    border: `1px solid ${BORDER}`,
  } as React.CSSProperties

  switch (field.type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'date':
      return (
        <div>
          {labelEl}
          <input
            id={`f-${field.id}`}
            type={field.type}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            required={field.required}
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
            style={inputStyle}
          />
          {helpEl}
        </div>
      )
    case 'textarea':
      return (
        <div>
          {labelEl}
          <textarea
            id={`f-${field.id}`}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            required={field.required}
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2 resize-none"
            style={inputStyle}
          />
          {helpEl}
        </div>
      )
    case 'select':
      return (
        <div>
          {labelEl}
          <select
            id={`f-${field.id}`}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
            style={inputStyle}
          >
            <option value="">Select…</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {helpEl}
        </div>
      )
    case 'radio':
      return (
        <div>
          {labelEl}
          <div className="space-y-2">
            {field.options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2.5 text-[15px] cursor-pointer"
                style={{ color: INK }}
              >
                <input
                  type="radio"
                  name={field.id}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                  className="form-radio"
                  style={{ accentColor: brand }}
                />
                {opt}
              </label>
            ))}
          </div>
          {helpEl}
        </div>
      )
    case 'checkbox': {
      const selected = Array.isArray(value) ? value : []
      return (
        <div>
          {labelEl}
          <div className="space-y-2">
            {field.options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2.5 text-[15px] cursor-pointer"
                style={{ color: INK }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={(e) => {
                    onChange(
                      e.target.checked
                        ? [...selected, opt]
                        : selected.filter((x) => x !== opt),
                    )
                  }}
                  className="form-checkbox"
                  style={{ accentColor: brand }}
                />
                {opt}
              </label>
            ))}
          </div>
          {helpEl}
        </div>
      )
    }
    case 'yes_no':
      return (
        <div>
          {labelEl}
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => onChange(v)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                style={{
                  backgroundColor: value === v ? brand : SURFACE,
                  color: value === v ? 'white' : INK,
                  border: `1px solid ${value === v ? brand : BORDER}`,
                }}
                aria-pressed={value === v}
              >
                {v ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
          {helpEl}
        </div>
      )
    case 'signature':
      return (
        <div>
          {labelEl}
          <input
            id={`f-${field.id}`}
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type your full name to sign"
            required={field.required}
            className="w-full px-4 py-3 rounded-xl text-lg font-medium italic focus:outline-none focus:ring-2"
            style={{ ...inputStyle, fontFamily: 'cursive' }}
          />
          {helpEl}
        </div>
      )
  }
}
