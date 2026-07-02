'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  FormField,
  FormFieldValue,
  FormFileRef,
  FormSubmissionData,
  FormTemplateSchema,
} from '@/lib/types/forms'
import { isDisplayOnlyField, isFieldVisible, localizeSchema, sanitizeFileRefs } from '@/lib/types/forms'
import type { FormTranslations } from '@/lib/types/forms'
import { uploadFileWithProgress } from '@/lib/upload-with-progress'

type Lang = 'en' | 'es'

/** UI-chrome strings (field labels come from the translated schema). */
const STR: Record<Lang, {
  submit: string; submitting: string; required: (l: string) => string; allSet: string
  received: (c: string) => string; confidential: (c: string) => string; welcomeBack: string
  select: string; yes: string; no: string; signPlaceholder: string
}> = {
  en: {
    submit: 'Submit', submitting: 'Submitting…',
    required: (l) => `“${l}” is required.`, allSet: 'You’re all set.',
    received: (c) => `${c} has your form. We’ll see you at your appointment.`,
    confidential: (c) => `Your responses go directly to ${c} and are kept confidential.`,
    welcomeBack: 'Welcome back. We filled in what you told us last time — just check everything is still right and update anything that’s changed.',
    select: 'Select…', yes: 'Yes', no: 'No', signPlaceholder: 'Type your full name to sign',
  },
  es: {
    submit: 'Enviar', submitting: 'Enviando…',
    required: (l) => `«${l}» es obligatorio.`, allSet: 'Todo listo.',
    received: (c) => `${c} ya tiene su formulario. Nos vemos en su cita.`,
    confidential: (c) => `Sus respuestas van directamente a ${c} y se mantienen confidenciales.`,
    welcomeBack: 'Bienvenido de nuevo. Completamos lo que nos dijo la última vez — solo confirme que todo sigue correcto y actualice lo que haya cambiado.',
    select: 'Seleccione…', yes: 'Sí', no: 'No', signPlaceholder: 'Escriba su nombre completo para firmar',
  },
}
import type { InsuranceCardFields } from '@/lib/services/insurance-ocr'

export type OcrAction = (
  orgId: string,
  imageUrls: string[],
) => Promise<{ ok: true; fields: InsuranceCardFields } | { ok: false; error: string }>

/** Map a `SystemFieldKey` → the extracted card field, for OCR auto-fill. */
const OCR_SYSTEM_KEY: Partial<Record<string, keyof InsuranceCardFields>> = {
  insurance_provider: 'provider',
  insurance_policy_number: 'memberId',
  insurance_group_number: 'groupNumber',
}

export interface IntakeSubmitPayload {
  orgId: string
  templateId: string
  data: FormSubmissionData
  submitterName: string | null
  submitterEmail: string | null
  submitterPhone: string | null
  /** Language the patient filled the form in ('es' stamps preferred language). */
  submittedLanguage?: 'en' | 'es'
}

const INK = 'var(--c-ink, #1C1A17)'
const INK_MUTED = 'var(--c-ink-muted, #6B635A)'
const SURFACE = 'var(--c-surface, #FFFFFF)'
const BG = 'var(--c-bg, #FAF7F2)'
const BORDER = 'var(--c-border, #E8E2D9)'

/** Shared upload bounds for the photo + insurance-card fields. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const UPLOAD_FOLDER = 'intake-uploads'

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
  /** Optional insurance-card OCR action — when present, an insurance_card field
   *  offers "Read my card" to auto-fill the insurance fields. */
  ocrAction?: OcrAction
  /** Return-visit pre-fill — a known patient's prior answers (portal). */
  initialValues?: FormSubmissionData
  /** Cached translations — when es exists, a language toggle appears. */
  translations?: FormTranslations | null
  /** Packet mode — when set, a successful submit calls this (to advance to the
   *  next form) instead of showing the single-form success screen. */
  onComplete?: () => void
  /** Optional progress label shown above the form (e.g. "Form 2 of 3"). */
  progressLabel?: string
  /** Kiosk mode (fill-at-the-desk tablet): the success screen says "hand it
   *  back" and auto-resets to a blank form for the next patient. */
  kioskMode?: boolean
}

export default function IntakeFormRunner({ orgId, templateId, schema, brand, clinicName, action, ocrAction, initialValues, translations, onComplete, progressLabel, kioskMode }: Props) {
  const [values, setValues] = useState<FormSubmissionData>(() => initialValues ?? {})
  const prefilled = !!initialValues && Object.keys(initialValues).length > 0
  const hasEs = !!translations?.es && Object.keys(translations.es).length > 0
  const [lang, setLang] = useState<Lang>('en')
  const t = STR[lang]
  // The schema used for DISPLAY (labels/options) + validation messages. Field
  // ids + types are preserved, so submitted values key the same in any language.
  const displaySchema = useMemo(
    () => (lang === 'es' && translations?.es ? localizeSchema(schema, translations.es) : schema),
    [lang, schema, translations],
  )
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // A STABLE setter (and a stable OCR-fill) so memoized FieldInputs only
  // re-render when THEIR own value changes — not every input on every keystroke.
  const setValue = useCallback((fieldId: string, value: FormFieldValue) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
  }, [])

  // Pre-fill the insurance text fields (matched by systemKey) from an OCR read.
  // Only writes a field we successfully read; the patient confirms/edits.
  const fillFromCard = useCallback(
    (fields: InsuranceCardFields) => {
      setValues((prev) => {
        const next = { ...prev }
        for (const section of schema.sections) {
          for (const f of section.fields) {
            const key = f.systemKey ? OCR_SYSTEM_KEY[f.systemKey] : undefined
            if (key && fields[key]) next[f.id] = fields[key] as string
          }
        }
        return next
      })
    },
    [schema],
  )

  function validate(): { fieldId: string; message: string } | null {
    for (const section of displaySchema.sections) {
      for (const field of section.fields) {
        // Display-only blocks carry no value; a conditionally-hidden field
        // isn't required while hidden.
        if (isDisplayOnlyField(field) || !field.required) continue
        if (field.visibleWhen && !isFieldVisible(field.visibleWhen, values)) continue
        const v = values[field.id]
        if (
          v == null ||
          v === '' ||
          (Array.isArray(v) && v.length === 0) ||
          (field.type === 'yes_no' && typeof v !== 'boolean')
        ) {
          return { fieldId: field.id, message: t.required(field.label) }
        }
      }
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setErrorMsg(validationError.message)
      setStatus('error')
      // Scroll the first missing field into view + focus it — on a long intake
      // form the inline error at the bottom is easy to miss.
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`f-${validationError.fieldId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // Focus after the scroll settles (focus alone can jump abruptly).
          window.setTimeout(() => {
            try {
              ;(el as HTMLElement).focus({ preventScroll: true })
            } catch {
              /* non-focusable container (e.g. radio group) — scroll is enough */
            }
          }, 350)
        }
      }
      return
    }
    setStatus('pending')
    setErrorMsg('')
    // System fields → the submitter record (so the clinic sees who filled the
    // form even before a patientId is attached). Computed once at submit, not
    // memoized on every keystroke.
    const first = values['first_name']
    const last = values['last_name']
    const submitterName =
      [first, last].filter((x): x is string => typeof x === 'string' && !!x).join(' ') || null
    try {
      await action({
        orgId,
        templateId,
        data: values,
        submitterName,
        submitterEmail: typeof values['email'] === 'string' ? (values['email'] as string) : null,
        submitterPhone: typeof values['phone'] === 'string' ? (values['phone'] as string) : null,
        // Filling in Spanish stamps the patient's preferred language (only
        // when not already set) — powers preferred-language messaging.
        submittedLanguage: lang,
      })
      // Packet mode: hand control back so the parent advances to the next form
      // (no single-form success screen between steps).
      if (onComplete) onComplete()
      else setStatus('success')
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
        {kioskMode && <KioskReset />}
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
          {t.allSet}
        </h2>
        <p className="leading-relaxed max-w-sm mx-auto" style={{ color: INK_MUTED }}>
          {kioskMode
            ? 'You can hand this back to the front desk — thanks!'
            : t.received(clinicName)}
        </p>
        {kioskMode && (
          <p className="mt-4 text-xs" style={{ color: INK_MUTED }}>
            Getting ready for the next patient…
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {progressLabel && (
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: brand }}>
          {progressLabel}
        </p>
      )}
      {hasEs && (
        <div className="flex justify-end">
          <div className="inline-flex overflow-hidden rounded-full text-xs font-semibold" style={{ border: `1px solid ${BORDER}` }}>
            {(['en', 'es'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className="px-3 py-1.5"
                style={lang === l ? { backgroundColor: brand, color: 'white' } : { backgroundColor: SURFACE, color: INK_MUTED }}
                aria-pressed={lang === l}
              >
                {l === 'en' ? 'English' : 'Español'}
              </button>
            ))}
          </div>
        </div>
      )}
      {prefilled && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, color: INK_MUTED }}>
          {t.welcomeBack}
        </div>
      )}
      {displaySchema.sections.map((section, si) => (
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
            {section.fields
              .filter((field) => isFieldVisible(field.visibleWhen, values))
              .map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  onChange={setValue}
                  brand={brand}
                  orgId={orgId}
                  ocrAction={ocrAction}
                  onOcrFill={fillFromCard}
                  t={t}
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
        {status === 'pending' ? t.submitting : t.submit}
      </button>
      <p className="text-xs text-center" style={{ color: INK_MUTED }}>
        {t.confidential(clinicName)}
      </p>
    </form>
  )
}

const FieldInput = memo(function FieldInput({
  field,
  value,
  onChange: onChangeField,
  brand,
  orgId,
  ocrAction,
  onOcrFill,
  t,
}: {
  field: FormField
  value: FormFieldValue | undefined
  /** Stable (fieldId, value) setter — lets this component memoize. */
  onChange: (fieldId: string, v: FormFieldValue) => void
  brand: string
  orgId: string
  ocrAction?: OcrAction
  onOcrFill?: (fields: InsuranceCardFields) => void
  t: (typeof STR)[Lang]
}) {
  // Narrow the stable setter to this field's value-only onChange so the entire
  // switch below + the upload sub-components stay unchanged.
  const onChange = (v: FormFieldValue) => onChangeField(field.id, v)
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
    case 'content':
      return (
        <div className="rounded-xl p-4" style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}>
          {field.label && (
            <p className="text-sm font-semibold mb-1" style={{ color: INK }}>
              {field.label}
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: INK_MUTED }}>
            {field.body}
          </p>
        </div>
      )
    case 'text':
    case 'email':
    case 'tel':
    case 'number':
    case 'date':
      return (
        <div>
          {labelEl}
          <input
            id={`f-${field.id}`}
            type={field.type}
            inputMode={field.type === 'number' ? 'numeric' : undefined}
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
            <option value="">{t.select}</option>
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
      const selected = Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
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
                {v ? t.yes : t.no}
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
            placeholder={t.signPlaceholder}
            required={field.required}
            className="w-full px-4 py-3 rounded-xl text-lg font-medium italic focus:outline-none focus:ring-2"
            // An italic-serif stack reads as a "signature" reliably across
            // platforms — the bare `cursive` keyword falls back to Comic Sans
            // on many systems. Georgia/Times anchor it with the site's serif.
            style={{ ...inputStyle, fontFamily: 'Georgia, "Times New Roman", "Apple Garamond", serif' }}
          />
          {helpEl}
        </div>
      )
    case 'file':
      return (
        <div>
          {labelEl}
          <PhotoUploadInput
            fieldId={field.id}
            value={sanitizeFileRefs(value)}
            onChange={onChange}
            maxFiles={field.maxFiles ?? 1}
            imagesOnly={field.imagesOnly !== false}
            brand={brand}
          />
          {helpEl}
        </div>
      )
    case 'insurance_card':
      return (
        <div>
          {labelEl}
          <InsuranceCardInput
            value={sanitizeFileRefs(value)}
            onChange={onChange}
            brand={brand}
            orgId={orgId}
            ocrAction={ocrAction}
            onOcrFill={onOcrFill}
          />
          {helpEl}
        </div>
      )
  }
})

/** Upload-to-S3 photo/file field. Stores a `FormFileRef[]`. */
function PhotoUploadInput({
  fieldId,
  value,
  onChange,
  maxFiles,
  imagesOnly,
  brand,
}: {
  fieldId: string
  value: FormFileRef[]
  onChange: (v: FormFieldValue) => void
  maxFiles: number
  imagesOnly: boolean
  brand: string
}) {
  const [uploading, setUploading] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // All writes to this field route through `valueRef` so concurrent upload
  // completions merge instead of clobbering a stale `value` closure.
  const valueRef = useRef<FormFileRef[]>(value)
  valueRef.current = value
  const commit = (next: FormFileRef[]) => {
    valueRef.current = next
    onChange(next)
  }

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return
    setErr(null)
    const room = maxFiles - valueRef.current.length
    if (room <= 0) {
      setErr(`Up to ${maxFiles} file${maxFiles === 1 ? '' : 's'}.`)
      return
    }
    for (const file of Array.from(files).slice(0, room)) {
      if (imagesOnly && !file.type.startsWith('image/')) {
        setErr('Please choose an image.')
        continue
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setErr(`"${file.name}" is over 8MB.`)
        continue
      }
      setUploading((n) => n + 1)
      uploadFileWithProgress(file, UPLOAD_FOLDER)
        .promise.then((url) => {
          commit([...valueRef.current, { url, name: file.name, contentType: file.type }])
        })
        .catch(() => setErr(`Couldn't upload "${file.name}".`))
        .finally(() => setUploading((n) => Math.max(0, n - 1)))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((f) => (
          <div key={f.url} className="relative h-20 w-20 overflow-hidden rounded-lg" style={{ border: `1px solid ${BORDER}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- patient upload preview */}
            <img src={f.url} alt={f.name || 'upload'} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => commit(valueRef.current.filter((x) => x.url !== f.url))}
              className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
        {uploading > 0 &&
          Array.from({ length: uploading }).map((_, i) => (
            <div key={i} className="h-20 w-20 animate-pulse rounded-lg" style={{ backgroundColor: '#EFEAE2' }} aria-label="Uploading" />
          ))}
        {value.length + uploading < maxFiles && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid h-20 w-20 place-items-center rounded-lg text-2xl"
            style={{ border: `1px dashed ${BORDER}`, color: brand, backgroundColor: BG }}
            aria-label="Add a photo"
          >
            +
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        id={`f-${fieldId}`}
        type="file"
        accept={imagesOnly ? 'image/*' : 'image/*,application/pdf'}
        multiple={maxFiles > 1}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  )
}

/** Front + back insurance-card capture. Stores two `FormFileRef`s tagged
 *  `side: 'front' | 'back'` (read by the Phase-3 OCR auto-fill). */
function InsuranceCardInput({
  value,
  onChange,
  brand,
  orgId,
  ocrAction,
  onOcrFill,
}: {
  value: FormFileRef[]
  onChange: (v: FormFieldValue) => void
  brand: string
  orgId: string
  ocrAction?: OcrAction
  onOcrFill?: (fields: InsuranceCardFields) => void
}) {
  const [uploading, setUploading] = useState<'front' | 'back' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [readMsg, setReadMsg] = useState<string | null>(null)
  const frontRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLInputElement>(null)

  function readCard() {
    if (!ocrAction || reading) return
    const urls = value.map((f) => f.url)
    if (urls.length === 0) return
    setReading(true)
    setReadMsg(null)
    setErr(null)
    void ocrAction(orgId, urls)
      .then((res) => {
        if (res.ok) {
          onOcrFill?.(res.fields)
          const got = Object.values(res.fields).filter(Boolean).length
          setReadMsg(
            got > 0
              ? '✓ We filled in what we could read — please double-check below.'
              : "We couldn't read the card clearly — please type your details below.",
          )
        } else {
          setErr(res.error)
        }
      })
      .catch(() => setErr('We couldn’t read the card — please type your details.'))
      .finally(() => setReading(false))
  }
  // Front + back can upload concurrently — route both through a ref so one
  // completion never drops the other's photo.
  const valueRef = useRef<FormFileRef[]>(value)
  valueRef.current = value
  const commit = (next: FormFileRef[]) => {
    valueRef.current = next
    onChange(next)
  }

  function side(s: 'front' | 'back') {
    return value.find((f) => f.side === s) ?? null
  }

  function upload(s: 'front' | 'back', files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setErr(null)
    if (!file.type.startsWith('image/')) {
      setErr('Please take a photo of the card.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setErr('That image is over 8MB.')
      return
    }
    setUploading(s)
    uploadFileWithProgress(file, UPLOAD_FOLDER)
      .promise.then((url) => {
        const others = valueRef.current.filter((f) => f.side !== s)
        commit([...others, { url, name: `${s}.jpg`, contentType: file.type, side: s }])
      })
      .catch(() => setErr(`Couldn't upload the ${s}.`))
      .finally(() => setUploading(null))
  }

  const slots: Array<{ s: 'front' | 'back'; label: string; ref: React.RefObject<HTMLInputElement | null> }> = [
    { s: 'front', label: 'Front', ref: frontRef },
    { s: 'back', label: 'Back', ref: backRef },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {slots.map(({ s, label, ref }) => {
          const f = side(s)
          return (
            <div key={s}>
              <input
                ref={ref}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  upload(s, e.target.files)
                  e.target.value = ''
                }}
              />
              {f ? (
                <div className="relative h-28 overflow-hidden rounded-xl" style={{ border: `1px solid ${BORDER}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- patient upload preview */}
                  <img src={f.url} alt={`Insurance card ${label}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => commit(valueRef.current.filter((x) => x.side !== s))}
                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
                    style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                    aria-label={`Remove ${label}`}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => ref.current?.click()}
                  disabled={uploading === s}
                  className="grid h-28 w-full place-items-center rounded-xl text-sm font-medium"
                  style={{ border: `1px dashed ${BORDER}`, color: brand, backgroundColor: BG }}
                >
                  {uploading === s ? 'Uploading…' : `📷 ${label} of card`}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {/* AI auto-fill — reads the uploaded card and pre-fills the insurance
          fields for the patient to confirm. Only when an OCR action is wired
          (the public + portal forms) + at least one photo is up. */}
      {ocrAction && value.length > 0 && (
        <button
          type="button"
          onClick={readCard}
          disabled={reading}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: brand }}
        >
          <span aria-hidden="true">✨</span>
          {reading ? 'Reading your card…' : 'Read my card & fill it in'}
        </button>
      )}
      {readMsg && <p className="mt-1.5 text-xs" style={{ color: INK_MUTED }}>{readMsg}</p>}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  )
}

/** Kiosk-mode reset: after a submission the tablet returns itself to a blank
 *  form so the front desk never has to touch it between patients. */
function KioskReset() {
  useEffect(() => {
    const id = window.setTimeout(() => window.location.reload(), 8000)
    return () => window.clearTimeout(id)
  }, [])
  return null
}
