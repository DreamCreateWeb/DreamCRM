// Client-safe types for the editable site lead-capture forms (the homepage
// contact form + the insurance verifier). A clinic can edit/add/remove/reorder
// fields in the Website Studio; the renderer + submit map values back to a lead.

export type LeadFormFieldType = 'text' | 'textarea' | 'email' | 'tel' | 'select'

export interface LeadFormField {
  /** Stable id; also the form field `name`. */
  id: string
  type: LeadFormFieldType
  label: string
  placeholder?: string
  required?: boolean
  /** Static options for a `select` (ignored when `dynamicOptions` is set). */
  options?: string[]
  /** A select whose options come from live clinic data, not the stored list. */
  dynamicOptions?: 'services' | 'carriers'
  /** Maps the value to a real lead column. Unset → folded into the lead message. */
  systemKey?: 'name' | 'email' | 'phone'
}

export type LeadFormKey = 'contact' | 'insurance_verifier'

/** Stored shape on clinic_profile.lead_forms. */
export type LeadFormsConfig = Partial<Record<LeadFormKey, LeadFormField[]>>

export const DEFAULT_LEAD_FORMS: Record<LeadFormKey, LeadFormField[]> = {
  contact: [
    { id: 'name', type: 'text', label: 'Name', required: true, systemKey: 'name' },
    { id: 'email', type: 'email', label: 'Email', required: true, systemKey: 'email' },
    { id: 'phone', type: 'tel', label: 'Phone', required: false, systemKey: 'phone' },
    {
      id: 'message',
      type: 'textarea',
      label: 'How can we help?',
      placeholder: 'Tell us a little about what you need…',
      required: false,
    },
  ],
  insurance_verifier: [
    { id: 'email', type: 'email', label: 'Email', required: true, systemKey: 'email' },
    { id: 'phone', type: 'tel', label: 'Phone', required: true, systemKey: 'phone' },
    {
      id: 'service',
      type: 'select',
      label: 'What brought you in?',
      required: false,
      dynamicOptions: 'services',
    },
    {
      id: 'carrier',
      type: 'select',
      label: 'Insurance carrier',
      required: false,
      dynamicOptions: 'carriers',
    },
  ],
}

const VALID_TYPES: ReadonlySet<string> = new Set([
  'text',
  'textarea',
  'email',
  'tel',
  'select',
])

/**
 * Resolve the fields to render for a form: the clinic's stored config when it
 * has at least one field, otherwise the built-in default. Defensive against
 * malformed stored data (drops rows missing an id/label/valid type).
 */
export function resolveLeadForm(
  stored: LeadFormsConfig | null | undefined,
  key: LeadFormKey,
): LeadFormField[] {
  const rows = stored?.[key]
  if (Array.isArray(rows)) {
    const clean = rows.filter(
      (f): f is LeadFormField =>
        !!f &&
        typeof f.id === 'string' &&
        f.id.trim() !== '' &&
        typeof f.label === 'string' &&
        f.label.trim() !== '' &&
        VALID_TYPES.has(f.type),
    )
    if (clean.length > 0) return clean
  }
  return DEFAULT_LEAD_FORMS[key]
}

export const LEAD_FORM_LABELS: Record<LeadFormKey, string> = {
  contact: 'Contact form',
  insurance_verifier: 'Insurance check form',
}
