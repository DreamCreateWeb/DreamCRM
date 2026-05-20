// Client-safe types for intake form templates + submissions. Mirrors the
// JSON `schema` column on the `form_template` table. Used by both the
// admin builder UI and the public form-fill page.

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'yes_no'
  | 'signature'

interface BaseField {
  id: string
  label: string
  required: boolean
  help?: string | null
  /** Pre-filled when this field is one of the well-known "system" fields
   * we'll auto-pull from the patient record on return visits. */
  systemKey?: SystemFieldKey | null
}

export interface TextField extends BaseField {
  type: 'text' | 'textarea' | 'email' | 'tel' | 'date'
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

export type FormField = TextField | ChoiceField | YesNoField | SignatureField

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
export type FormFieldValue = string | string[] | boolean | null

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
        { id: 'allergies', type: 'textarea', label: 'Allergies (medications, latex, etc.)', required: false, placeholder: 'List anything we should avoid.' },
        { id: 'medications', type: 'textarea', label: 'Medications you take regularly', required: false, placeholder: 'Including supplements.' },
      ],
    },
    {
      id: 'dental',
      title: 'Dental history',
      fields: [
        { id: 'last_visit', type: 'text', label: 'When was your last dental visit?', required: false, placeholder: 'Approximate is fine.' },
        { id: 'concerns', type: 'textarea', label: 'Anything specific you’d like us to look at?', required: false, placeholder: 'A tooth that’s sensitive, a chipped molar, whitening interest — anything.' },
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
