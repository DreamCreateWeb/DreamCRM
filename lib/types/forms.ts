// Client-safe types for intake form templates + submissions. Mirrors the
// JSON `schema` column on the `form_template` table. Used by both the
// admin builder UI and the public form-fill page.

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'yes_no'
  | 'signature'
  | 'file'
  | 'insurance_card'
  | 'content'

/** One uploaded file on a submission (image or document), stored in the
 *  submission `data` jsonb under the field id. Same shape as message
 *  attachments; `side` distinguishes the two insurance-card photos. */
export interface FormFileRef {
  url: string
  name: string
  contentType: string
  /** 'front' | 'back' for insurance_card; absent for generic file uploads. */
  side?: 'front' | 'back'
}

interface BaseField {
  id: string
  label: string
  required: boolean
  help?: string | null
  /** Pre-filled when this field is one of the well-known "system" fields
   * we'll auto-pull from the patient record on return visits. */
  systemKey?: SystemFieldKey | null
  /** Conditional visibility — the field shows only when another field's value
   *  matches. Evaluated in the preview + the public/portal renderer. (Phase 2.) */
  visibleWhen?: FieldCondition | null
}

/** Show this field only when `fieldId`'s value satisfies the condition.
 *  `equals` matches a string/boolean exactly; `includes` matches a member of a
 *  multi-select (checkbox) array; `answered` = any non-empty value. */
export interface FieldCondition {
  fieldId: string
  op: 'equals' | 'includes' | 'answered'
  value?: string
}

export interface TextField extends BaseField {
  type: 'text' | 'textarea' | 'email' | 'tel' | 'number' | 'date'
  placeholder?: string | null
}

export interface ChoiceField extends BaseField {
  type: 'select' | 'radio' | 'checkbox'
  options: string[]
}

export interface YesNoField extends BaseField {
  type: 'yes_no'
}

export interface SignatureField extends BaseField {
  type: 'signature'
}

/** A file/photo upload (e.g. a referral, an X-ray, a photo of a concern). */
export interface FileField extends BaseField {
  type: 'file'
  /** Restrict to images only (the upload route rejects non-images regardless
   *  unless docs are later allowed; default true = photos). */
  imagesOnly?: boolean
  /** Max files the patient can attach (default 1). */
  maxFiles?: number
}

/** Front + back photo of a dental insurance card. Phase 3 reads these with
 *  Claude vision to pre-fill the carrier/member-id/group fields. */
export interface InsuranceCardField extends BaseField {
  type: 'insurance_card'
}

/** A static instruction / notice block — no input, no stored value. Used for
 *  consent prose, section guidance, etc. `required` is always false. */
export interface ContentField extends BaseField {
  type: 'content'
  /** The text to display (plain text; newlines preserved). */
  body: string
}

export type FormField =
  | TextField
  | ChoiceField
  | YesNoField
  | SignatureField
  | FileField
  | InsuranceCardField
  | ContentField

/** Field types that carry no submitted value (display-only). */
export function isDisplayOnlyField(field: { type: FormFieldType }): boolean {
  return field.type === 'content'
}

export interface FormSection {
  id: string
  title: string
  description?: string | null
  fields: FormField[]
}

export interface FormTemplateSchema {
  sections: FormSection[]
}

/** Field IDs we recognize as "patient demographic" fields and can
 * prefill on a return visit. v1 set; extend as we add fields to the
 * patient table. */
export const SYSTEM_FIELD_KEYS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'email',
  'phone',
  'address_line1',
  'city',
  'state',
  'postal_code',
  'insurance_provider',
  'insurance_policy_number',
  'insurance_group_number',
] as const
export type SystemFieldKey = (typeof SYSTEM_FIELD_KEYS)[number]

export type FormSubmissionData = Record<string, FormFieldValue>
export type FormFieldValue = string | string[] | boolean | FormFileRef[] | null

/** True when a value is an array of file refs (vs a string[] of choice values). */
export function isFileRefArray(v: unknown): v is FormFileRef[] {
  return Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null && 'url' in (v[0] as object)
}

/**
 * Coerce an untrusted value into clean `FormFileRef[]` — the trust boundary for
 * file uploads on a submission (client-supplied + re-read from jsonb). Requires
 * an http(s) URL, trims display fields, caps the count. Pure (client + server).
 */
export function sanitizeFileRefs(value: unknown, max = 6): FormFileRef[] {
  if (!Array.isArray(value)) return []
  const out: FormFileRef[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const url = typeof r.url === 'string' ? r.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) continue
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 200) : ''
    const contentType = typeof r.contentType === 'string' ? r.contentType.trim().slice(0, 100) : ''
    const side = r.side === 'front' || r.side === 'back' ? r.side : undefined
    out.push({ url, name, contentType, ...(side ? { side } : {}) })
    if (out.length >= max) break
  }
  return out
}

/**
 * Returns the label of the first required field missing a value, or null when
 * every required field is satisfied. Both the public and patient-portal submit
 * actions re-check this server-side so a direct action call can't persist
 * partial data (the client runner validates too, but that can be bypassed).
 */
export function firstMissingRequiredField(
  schema: FormTemplateSchema,
  data: FormSubmissionData,
): string | null {
  for (const section of schema?.sections ?? []) {
    for (const field of section.fields ?? []) {
      // Display-only blocks (content) never require a value.
      if (isDisplayOnlyField(field) || !field.required) continue
      // A conditionally-hidden field isn't required while hidden.
      if (field.visibleWhen && !isFieldVisible(field.visibleWhen, data)) continue
      const v = data?.[field.id]
      const empty =
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (Array.isArray(v) && v.length === 0)
      if (empty) return field.label
    }
  }
  return null
}

/**
 * Evaluate a field's `visibleWhen` condition against the current answers. Pure;
 * shared by the public renderer, the preview, and server-side validation so a
 * hidden required field is never enforced. Returns true (visible) when there's
 * no condition.
 */
export function isFieldVisible(
  cond: FieldCondition | null | undefined,
  data: FormSubmissionData,
): boolean {
  if (!cond) return true
  const v = data?.[cond.fieldId]
  switch (cond.op) {
    case 'answered':
      return v !== undefined && v !== null && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0)
    case 'includes':
      return Array.isArray(v) && (v as unknown[]).some((x) => x === cond.value)
    case 'equals':
    default: {
      if (typeof v === 'boolean') return String(v) === cond.value
      return v === cond.value
    }
  }
}

/**
 * Render a submission's answers as a "Label: value" transcript — used for the
 * AI summary input and the Open Dental chart mirror. Skips display-only blocks,
 * uploads, and signatures (no transcribable clinical signal). Pure.
 */
export function buildIntakeTranscript(schema: FormTemplateSchema, data: FormSubmissionData): string {
  const lines: string[] = []
  for (const section of schema?.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (
        isDisplayOnlyField(field) ||
        field.type === 'signature' ||
        field.type === 'file' ||
        field.type === 'insurance_card'
      ) {
        continue
      }
      const v = data?.[field.id]
      if (v === undefined || v === null || v === '' || isFileRefArray(v)) continue
      let text: string
      if (Array.isArray(v)) text = v.join(', ')
      else if (typeof v === 'boolean') text = v ? 'Yes' : 'No'
      else text = String(v)
      if (text.trim() === '') continue
      lines.push(`${field.label}: ${text}`)
    }
  }
  return lines.join('\n')
}

/**
 * Build return-visit pre-fill values from a patient's prior submission. Copies
 * every answer EXCEPT the ones that should always be re-done in person:
 * file/insurance uploads (a fresh photo) and signatures (re-signed each visit).
 * Pure + client-safe.
 */
export function prefillFromPriorData(
  schema: FormTemplateSchema,
  priorData: FormSubmissionData,
): FormSubmissionData {
  const skip = new Set<string>()
  for (const section of schema?.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (field.type === 'file' || field.type === 'insurance_card' || field.type === 'signature' || field.type === 'content') {
        skip.add(field.id)
      }
    }
  }
  const out: FormSubmissionData = {}
  for (const [key, value] of Object.entries(priorData ?? {})) {
    if (skip.has(key)) continue
    if (value === null || value === undefined) continue
    out[key] = value as FormFieldValue
  }
  return out
}

/**
 * Server-side cleanup of a submission before persistence. For file/insurance
 * fields it clamps the value to clean `FormFileRef[]` (the trust boundary —
 * a client could POST arbitrary URLs); other field values pass through. Pure.
 */
export function sanitizeSubmissionData(
  schema: FormTemplateSchema,
  data: FormSubmissionData,
): FormSubmissionData {
  const byId = new Map<string, FormField>()
  for (const section of schema?.sections ?? []) {
    for (const field of section.fields ?? []) byId.set(field.id, field)
  }
  const out: FormSubmissionData = {}
  for (const [key, value] of Object.entries(data ?? {})) {
    const field = byId.get(key)
    if (field && (field.type === 'file' || field.type === 'insurance_card')) {
      out[key] = sanitizeFileRefs(value)
    } else if (field && isDisplayOnlyField(field)) {
      // Display-only blocks never store a value.
      continue
    } else {
      out[key] = value as FormFieldValue
    }
  }
  return out
}

/** A reasonable starter form clinics inherit on day one. The standard
 * dental intake: patient info, insurance, medical, dental history,
 * consent. Editable from /settings/clinic/intake-forms. */
export const DEFAULT_INTAKE_TEMPLATE: FormTemplateSchema = {
  sections: [
    {
      id: 'patient_info',
      title: 'About you',
      description: 'The basics — we use this to start your chart.',
      fields: [
        { id: 'first_name', type: 'text', label: 'First name', required: true, systemKey: 'first_name' },
        { id: 'last_name', type: 'text', label: 'Last name', required: true, systemKey: 'last_name' },
        { id: 'date_of_birth', type: 'date', label: 'Date of birth', required: true, systemKey: 'date_of_birth' },
        { id: 'email', type: 'email', label: 'Email', required: false, systemKey: 'email' },
        { id: 'phone', type: 'tel', label: 'Phone', required: true, systemKey: 'phone' },
        { id: 'address_line1', type: 'text', label: 'Address', required: false, systemKey: 'address_line1' },
        { id: 'city', type: 'text', label: 'City', required: false, systemKey: 'city' },
        { id: 'state', type: 'text', label: 'State', required: false, systemKey: 'state' },
        { id: 'postal_code', type: 'text', label: 'ZIP', required: false, systemKey: 'postal_code' },
      ],
    },
    {
      id: 'insurance',
      title: 'Insurance',
      description: 'Skip if you’re paying out of pocket — we’ll work it out at the visit.',
      fields: [
        { id: 'insurance_card', type: 'insurance_card', label: 'Snap a photo of your insurance card', required: false, help: 'Front and back — we’ll pull the details from it so you don’t have to type them.' },
        { id: 'insurance_provider', type: 'text', label: 'Insurance provider', required: false, systemKey: 'insurance_provider' },
        { id: 'insurance_policy_number', type: 'text', label: 'Policy / member number', required: false, systemKey: 'insurance_policy_number' },
        { id: 'insurance_group_number', type: 'text', label: 'Group number', required: false, systemKey: 'insurance_group_number' },
      ],
    },
    {
      id: 'medical',
      title: 'Medical history',
      description: 'Anything we should know about before treating you.',
      fields: [
        {
          id: 'conditions',
          type: 'checkbox',
          label: 'Do you currently have any of the following?',
          required: false,
          options: [
            'Diabetes',
            'High blood pressure',
            'Heart condition',
            'Pregnant',
            'Anxiety or panic',
            'None of the above',
          ],
        },
        { id: 'has_allergies', type: 'yes_no', label: 'Do you have any allergies?', required: false },
        {
          id: 'allergies',
          type: 'textarea',
          label: 'What are you allergic to? (medications, latex, etc.)',
          required: false,
          placeholder: 'List anything we should avoid.',
          // Conditional: only ask for detail when they said yes.
          visibleWhen: { fieldId: 'has_allergies', op: 'equals', value: 'true' },
        },
        { id: 'medications', type: 'textarea', label: 'Medications you take regularly', required: false, placeholder: 'Including supplements.' },
      ],
    },
    {
      id: 'dental',
      title: 'Dental history',
      fields: [
        { id: 'last_visit', type: 'text', label: 'When was your last dental visit?', required: false, placeholder: 'Approximate is fine.' },
        { id: 'concerns', type: 'textarea', label: 'Anything specific you’d like us to look at?', required: false, placeholder: 'A tooth that’s sensitive, a chipped molar, whitening interest — anything.' },
        { id: 'concern_photo', type: 'file', label: 'Have a photo of what’s bothering you?', required: false, imagesOnly: true, maxFiles: 3, help: 'Optional — a quick photo helps us prepare for your visit.' },
        {
          id: 'anxiety_level',
          type: 'radio',
          label: 'How do you generally feel about dental visits?',
          required: false,
          options: ['Totally comfortable', 'A little nervous', 'Anxious — go slow with me', 'I dread it'],
          help: 'No judgment — this helps us pace your visit.',
        },
      ],
    },
    {
      id: 'consent',
      title: 'Consent',
      description: 'Standard acknowledgment so we can treat you.',
      fields: [
        {
          id: 'privacy_notice',
          type: 'content',
          label: 'Notice of Privacy Practices',
          required: false,
          body: 'We protect your health information under HIPAA and only share it to coordinate your care, handle billing, or where the law requires. You can ask for a full copy of our Notice of Privacy Practices at any time.',
        },
        {
          id: 'hipaa',
          type: 'yes_no',
          label: 'I acknowledge receipt of the practice’s Notice of Privacy Practices (HIPAA).',
          required: true,
        },
        {
          id: 'signature',
          type: 'signature',
          label: 'Signature',
          required: true,
          help: 'Type your full name to sign.',
        },
      ],
    },
  ],
}
