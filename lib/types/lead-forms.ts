// Client-safe types for the editable site lead-capture forms (the homepage
// contact form + the insurance verifier). A clinic can edit/add/remove/reorder
// fields in the Website Studio; the renderer + submit map values back to a lead.

export type LeadFormFieldType = 'text' | 'textarea' | 'email' | 'tel' | 'date' | 'select'

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
  systemKey?: 'name' | 'email' | 'phone' | 'preferredDate' | 'message'
}

export type LeadFormKey = 'contact' | 'insurance_verifier'

/** Stored shape on clinic_profile.lead_forms. */
export type LeadFormsConfig = Partial<Record<LeadFormKey, LeadFormField[]>>

export const DEFAULT_LEAD_FORMS: Record<LeadFormKey, LeadFormField[]> = {
  contact: [
    { id: 'name', type: 'text', label: 'Full name', required: true, systemKey: 'name' },
    { id: 'phone', type: 'tel', label: 'Phone', required: true, systemKey: 'phone' },
    { id: 'email', type: 'email', label: 'Email', required: false, systemKey: 'email' },
    {
      id: 'preferredDate',
      type: 'date',
      label: 'Preferred date',
      required: false,
      systemKey: 'preferredDate',
    },
    {
      id: 'message',
      type: 'textarea',
      label: 'Message or reason for visit',
      placeholder: 'e.g. Annual cleaning, tooth pain, new patient…',
      required: false,
      systemKey: 'message',
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
  'date',
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

// ── Carrier matching (the public verifier's "are you in network?") ──────────

/** Words that do not tell one carrier from another ("Delta Dental Insurance"). */
const CARRIER_NOISE = new Set(['insurance', 'ins', 'dental', 'plan', 'plans', 'of', 'the', 'and', 'inc', 'co', 'company', 'health', 'ppo', 'hmo'])

function carrierTokens(name: string): string[] {
  const all = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  const meaningful = all.filter((t) => !CARRIER_NOISE.has(t))
  // "Dental Health" would vanish entirely — fall back to what was typed.
  return meaningful.length > 0 ? meaningful : all
}

/**
 * Is the carrier a visitor picked/typed one the practice lists as accepted?
 * Returns the ACCEPTED entry's own name (so the page says it the way the
 * practice does), or null. Forgiving on case, punctuation and noise words
 * ("Delta Dental Insurance" = "delta dental"), and one side's meaningful
 * words must all appear in the other's. A FACT ABOUT THE LIST, never a
 * promise about the visitor's plan: callers must say the plan is confirmed
 * later.
 */
export function matchCarrier(submitted: string | null | undefined, accepted: readonly string[] | null | undefined): string | null {
  const typed = (submitted ?? '').trim()
  if (!typed || typed === '__other__' || !accepted || accepted.length === 0) return null
  const a = carrierTokens(typed)
  if (a.length === 0 || a.join('').length < 3) return null
  for (const entry of accepted) {
    if (typeof entry !== 'string' || !entry.trim()) continue
    const b = carrierTokens(entry)
    if (b.length === 0 || b.join('').length < 3) continue
    const aInB = a.every((t) => b.includes(t))
    const bInA = b.every((t) => a.includes(t))
    if (aInB || bInA) return entry.trim()
  }
  return null
}

/** The parseable first line the verifier writes on a lead: "Carrier: X". */
export const LEAD_CARRIER_PREFIX = 'Carrier: '

/** Read the carrier back off a lead's message (first line only); null when absent. */
export function carrierFromLeadMessage(message: string | null | undefined): string | null {
  if (!message) return null
  const first = message.split(/\r?\n/, 1)[0] ?? ''
  if (!first.startsWith(LEAD_CARRIER_PREFIX)) return null
  const v = first.slice(LEAD_CARRIER_PREFIX.length).trim()
  return v || null
}
