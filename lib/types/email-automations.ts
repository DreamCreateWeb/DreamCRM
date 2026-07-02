// Client-safe registry + types + resolver for the clinic-editable automated
// patient emails (Settings → Automations → Emails).
//
// Stored as a single jsonb column `clinic_profile.email_automations`; null =
// every email uses its built-in default copy. Same merge-over-defaults pattern
// as resolveReminderSettings (lib/types/reminders.ts) / resolvePortalSettings —
// a partial / legacy stored blob merges over the registry defaults on read, so
// adding a new email or slot never needs a backfill.
//
// This column is CONTENT ONLY (subject + body slots) plus an `enabled` flag for
// the auto-firing emails that don't already have one (booking confirmation,
// cancellation, contact-form ack). Reminder timing/on-off still lives in
// `reminder_settings`; review auto-send in `clinic_review_config` — the hub
// surfaces/links those but never duplicates the flag here.
//
// The render + send wiring lives in lib/services/email-automations.ts (which
// applies `{{tokens}}` via applyMergeFields). email.ts's templated senders fall
// back to their in-code literal when a slot isn't overridden, so a clinic that
// never touches the hub gets byte-for-byte the current emails.

export type EmailAutomationKey =
  | 'booking_confirmation'
  | 'appointment_reminder'
  | 'appointment_reminder_confirmed'
  | 'intake_request'
  | 'cancellation'
  | 'portal_invite'
  | 'review_request'
  | 'contact_ack'
  | 'balance_pay_link'

export type EmailSlotKey = 'subject' | 'heading' | 'body' | 'closing'

/** The editable text of an email. subject + body always present; heading /
 *  closing only for the emails that have them (see each spec's slotFields). */
export interface EmailSlots {
  subject: string
  heading?: string
  body: string
  closing?: string
}

export type EmailCategory = 'appointments' | 'forms' | 'portal' | 'reviews' | 'website' | 'billing'

/** A `{{token}}` a clinic can drop into this email's copy. */
export interface TokenSpec {
  token: string
  label: string
}

/** One editable field in the hub UI. `rows === 1` → single-line input. */
export interface SlotFieldSpec {
  slot: EmailSlotKey
  label: string
  rows: number
  hint?: string
}

export interface EmailAutomationSpec {
  key: EmailAutomationKey
  /** Human name shown as the card title + the "Edit … email" button target. */
  label: string
  description: string
  category: EmailCategory
  /**
   * Where this email's on/off switch lives:
   *  - 'email_automations' → the `enabled` flag in THIS column (default on); the
   *    hub renders a toggle and the send site skips when off.
   *  - 'reminder_settings' / 'review_config' → managed in their own store; the
   *    hub surfaces/links it (see `timingHint`) but never writes it here.
   *  - null → on-demand (staff explicitly sends it) → no on/off.
   */
  enableSource: 'email_automations' | 'reminder_settings' | 'review_config' | null
  /** The module page this email relates to (drives the per-module deep link). */
  moduleHref: string
  moduleLabel: string
  tokens: TokenSpec[]
  slotFields: SlotFieldSpec[]
  slotDefaults: EmailSlots
  /** The fixed blocks we always add — shown so staff know what's NOT editable. */
  includesNote: string[]
  /** For reminder/review: a one-liner + link to where timing/on-off lives. */
  timingHint?: { text: string; href: string; linkLabel: string }
}

export const EMAIL_SUBJECT_MAX = 200
export const EMAIL_SLOT_MAX = 4000

// ── Shared token catalogs ─────────────────────────────────────────────────
const T_FIRST: TokenSpec = { token: '{{firstName}}', label: "Patient's first name" }
const T_FULL: TokenSpec = { token: '{{patientName}}', label: "Patient's full name" }
const T_CLINIC: TokenSpec = { token: '{{clinicName}}', label: 'Your clinic name' }
const T_PHONE: TokenSpec = { token: '{{clinicPhone}}', label: 'Your clinic phone number' }
const T_TYPE: TokenSpec = { token: '{{appointmentType}}', label: 'Visit type (e.g. cleaning)' }
const T_DATE: TokenSpec = { token: '{{appointmentDate}}', label: 'Visit date (e.g. Monday, Jan 5)' }
const T_TIME: TokenSpec = { token: '{{appointmentTime}}', label: 'Visit date & time' }

/**
 * The registry — single source of truth for both the send-time defaults and the
 * hub UI. Default copy reproduces the current wording verbatim (choosing
 * {{patientName}} vs {{firstName}} to match each function's current literal), so
 * default output is unchanged.
 */
export const EMAIL_AUTOMATION_SPECS: Record<EmailAutomationKey, EmailAutomationSpec> = {
  booking_confirmation: {
    key: 'booking_confirmation',
    label: 'Appointment confirmation',
    description: 'Sent to a patient right after a visit is booked.',
    category: 'appointments',
    enableSource: 'email_automations',
    moduleHref: '/appointments',
    moduleLabel: 'Appointments',
    tokens: [T_FIRST, T_FULL, T_CLINIC, T_PHONE, T_TYPE, T_TIME],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'heading', label: 'Headline', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
      { slot: 'closing', label: 'Closing line', rows: 2 },
    ],
    slotDefaults: {
      subject: 'Appointment confirmed at {{clinicName}}',
      heading: 'Your appointment is set',
      body: 'Hi {{patientName}}, your {{appointmentType}} visit at {{clinicName}} is booked.',
      closing: "We'll be in touch to confirm. Need to change your time? Just give us a call.",
    },
    includesNote: [
      'A box with the appointment date and time (in your clinic timezone)',
      "When you have a default intake form, a “Fill out your intake form” button",
    ],
  },

  appointment_reminder: {
    key: 'appointment_reminder',
    label: 'Appointment reminder',
    description: 'Sent automatically before an upcoming visit that isn’t confirmed yet.',
    category: 'appointments',
    enableSource: 'reminder_settings',
    moduleHref: '/appointments',
    moduleLabel: 'Appointments',
    tokens: [T_FIRST, T_CLINIC, T_TYPE, T_DATE, T_TIME],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
    ],
    slotDefaults: {
      subject: 'Reminder: your {{appointmentType}} on {{appointmentDate}}',
      body: 'Hi {{firstName}} — just a quick reminder of your {{appointmentType}} appointment at {{clinicName}} on {{appointmentTime}}. Tap the button below to confirm — or if the time no longer works, just reply and we’ll find a better one.',
    },
    includesNote: [
      'A one-click “Confirm my visit” button (patients confirm right from the email)',
      'Any prep instructions you’ve set for the visit type (Settings → Practice → Visit types)',
      'A short greeting and your clinic name signature',
    ],
    timingHint: {
      text: 'When reminders send (and whether they send at all) is set just below.',
      href: '#reminder-timing',
      linkLabel: 'Reminder timing',
    },
  },

  appointment_reminder_confirmed: {
    key: 'appointment_reminder_confirmed',
    label: 'Reminder — already confirmed',
    description:
      'The gentler heads-up sent before a visit the patient has ALREADY confirmed — no confirm ask, just “see you soon.” Rides the same reminder schedule.',
    category: 'appointments',
    enableSource: 'email_automations',
    moduleHref: '/appointments',
    moduleLabel: 'Appointments',
    tokens: [T_FIRST, T_CLINIC, T_TYPE, T_DATE, T_TIME],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
    ],
    slotDefaults: {
      subject: 'See you {{appointmentDate}} — {{appointmentType}} at {{clinicName}}',
      body: 'Hi {{firstName}} — you’re all set for your {{appointmentType}} at {{clinicName}} on {{appointmentTime}}. Nothing to do — this is just a friendly heads-up. If something’s come up, reply to this email and we’ll find a new time.',
    },
    includesNote: [
      'Any prep instructions you’ve set for the visit type (Settings → Practice → Visit types)',
      'A short greeting and your clinic name signature',
    ],
    timingHint: {
      text: 'Sends on the same reminder schedule as the appointment reminder.',
      href: '#reminder-timing',
      linkLabel: 'Reminder timing',
    },
  },

  intake_request: {
    key: 'intake_request',
    label: 'Intake form request',
    description: 'Sent when you click “Send intake” — and used for the automatic forms reminder.',
    category: 'forms',
    enableSource: null,
    moduleHref: '/intake-forms',
    moduleLabel: 'Intake forms',
    tokens: [T_FIRST, T_CLINIC],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'heading', label: 'Headline', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
      { slot: 'closing', label: 'Closing line', rows: 2 },
    ],
    slotDefaults: {
      subject: '{{clinicName}} — quick intake form before your visit',
      heading: 'Hi {{firstName}},',
      body: 'Before your visit at {{clinicName}}, please take a few minutes to fill out our intake form. It saves time at the front desk and helps us take better care of you.',
      closing: 'Have questions? Just reply to this email — it goes straight to our front desk.',
    },
    includesNote: ['A “Fill out intake form” button linking to your form'],
  },

  cancellation: {
    key: 'cancellation',
    label: 'Appointment cancellation',
    description: 'Sent to a patient when their appointment is cancelled.',
    category: 'appointments',
    enableSource: 'email_automations',
    moduleHref: '/appointments',
    moduleLabel: 'Appointments',
    tokens: [T_FIRST, T_FULL, T_CLINIC, T_PHONE, T_TYPE, T_TIME],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'heading', label: 'Headline', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
    ],
    slotDefaults: {
      subject: 'Your appointment at {{clinicName}} was cancelled',
      heading: 'Appointment cancelled',
      body: 'Hi {{patientName}}, this confirms your {{appointmentType}} at {{clinicName}} has been cancelled. No problem at all — life happens.',
    },
    includesNote: [
      'The cancelled date and time (crossed out)',
      'A “Find a new time” button (or a “call us” line on the Basic plan)',
    ],
  },

  portal_invite: {
    key: 'portal_invite',
    label: 'Patient portal invite',
    description: 'Sent when you invite a patient to their online portal.',
    category: 'portal',
    enableSource: null,
    moduleHref: '/patients',
    moduleLabel: 'Patients',
    tokens: [T_FIRST, T_CLINIC],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'heading', label: 'Headline', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
      { slot: 'closing', label: 'Closing line', rows: 2 },
    ],
    slotDefaults: {
      subject: '{{clinicName}} — set up your patient portal',
      heading: 'Hi {{firstName}},',
      body: '{{clinicName}} set up a patient portal for you — where you can see your upcoming appointments, book a visit, message the office, and fill out forms ahead of time.',
      closing: "Weren't expecting this? You can ignore this email.",
    },
    includesNote: ['A “Set up my portal” button with the patient’s secure link'],
  },

  review_request: {
    key: 'review_request',
    label: 'Review request',
    description: 'Sent after a completed visit to ask the patient for a review.',
    category: 'reviews',
    enableSource: 'review_config',
    moduleHref: '/reviews',
    moduleLabel: 'Reviews',
    tokens: [T_FIRST, T_CLINIC],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'heading', label: 'Greeting', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
      { slot: 'closing', label: 'Sign-off', rows: 2 },
    ],
    slotDefaults: {
      subject: 'Quick favor from {{clinicName}}',
      heading: 'Hi {{firstName}},',
      body: 'Thanks for coming in. Quick favor — would you take a minute to share how it went? It really helps other people find us, and your honest take (good, bad, or in-between) is what we want.',
      closing: 'Thank you,\nThe team at {{clinicName}}',
    },
    includesNote: ['A “Leave a review” button linking to your review page'],
    timingHint: {
      text: 'Whether this sends automatically after a completed visit (and how soon) is set in the Reviews module.',
      href: '/reviews',
      linkLabel: 'Open Reviews',
    },
  },

  balance_pay_link: {
    key: 'balance_pay_link',
    label: 'Balance & pay link',
    description:
      'Sent when you email a patient their balance with a secure pay link — and by the automatic balance reminder, if you turn that on.',
    category: 'billing',
    enableSource: null,
    moduleHref: '/shop/payments',
    moduleLabel: 'Online payments',
    tokens: [
      T_FIRST,
      T_CLINIC,
      T_PHONE,
      { token: '{{balance}}', label: 'Their current balance (e.g. $135.00)' },
    ],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
    ],
    slotDefaults: {
      subject: 'Your balance at {{clinicName}} — pay online in a minute',
      body: 'Hi {{firstName}} — you have a balance of {{balance}} with {{clinicName}}. No rush and no judgment — life gets busy. You can take care of it online in about a minute, or reply to this email if something looks off and we’ll sort it out together.',
    },
    includesNote: [
      'A secure “Pay my balance” button (their personal pay page — no sign-in needed)',
      'A short greeting and your clinic name signature',
    ],
    timingHint: {
      text: 'Sent on demand from a patient’s record or the patient list — and automatically on a schedule when you turn on Automatic balance reminders.',
      href: '/shop/payments',
      linkLabel: 'Online payments',
    },
  },

  contact_ack: {
    key: 'contact_ack',
    label: 'Website enquiry auto-reply',
    description: 'Sent to a visitor who submits your website contact form.',
    category: 'website',
    enableSource: 'email_automations',
    moduleHref: '/leads',
    moduleLabel: 'Leads',
    tokens: [T_FIRST, T_CLINIC, T_PHONE],
    slotFields: [
      { slot: 'subject', label: 'Subject line', rows: 1 },
      { slot: 'body', label: 'Message', rows: 3 },
    ],
    slotDefaults: {
      subject: 'Thanks for reaching out to {{clinicName}}',
      body: "Hi {{firstName}}, we got your message and we'll reach out within one business day. If it's urgent{{urgentLine}} — otherwise, sit tight and we'll be in touch soon.",
    },
    includesNote: ['A short greeting and your clinic name signature'],
  },
}

export const EMAIL_AUTOMATION_KEYS = Object.keys(EMAIL_AUTOMATION_SPECS) as EmailAutomationKey[]

export function isEmailAutomationKey(x: unknown): x is EmailAutomationKey {
  return typeof x === 'string' && x in EMAIL_AUTOMATION_SPECS
}

export type EmailAutomationOverride = Partial<EmailSlots> & { enabled?: boolean }
export type EmailAutomationsConfig = Partial<Record<EmailAutomationKey, EmailAutomationOverride>>

export interface ResolvedEmail extends EmailSlots {
  enabled: boolean
}
export type ResolvedEmailAutomations = Record<EmailAutomationKey, ResolvedEmail>

function clampSlot(slot: EmailSlotKey, value: string): string {
  return value.slice(0, slot === 'subject' ? EMAIL_SUBJECT_MAX : EMAIL_SLOT_MAX)
}

/**
 * Merge a stored (possibly partial / legacy) jsonb value over the registry
 * defaults. Unknown keys/slots are dropped; a missing, empty, or malformed slot
 * inherits the default — so a junk payload can never poison the column, a blank
 * field never sends an empty email, and a new email/slot never needs a backfill.
 * `enabled` is only honoured for emails whose on/off lives in this column.
 */
export function resolveEmailAutomations(stored: unknown): ResolvedEmailAutomations {
  const s = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  const out = {} as ResolvedEmailAutomations
  for (const key of EMAIL_AUTOMATION_KEYS) {
    const spec = EMAIL_AUTOMATION_SPECS[key]
    const ovRaw = s[key]
    const ov = ovRaw && typeof ovRaw === 'object' ? (ovRaw as Record<string, unknown>) : {}
    const slots: EmailSlots = { ...spec.slotDefaults }
    for (const f of spec.slotFields) {
      const v = ov[f.slot]
      if (typeof v === 'string' && v.trim()) slots[f.slot] = clampSlot(f.slot, v)
    }
    let enabled = true
    if (spec.enableSource === 'email_automations' && typeof ov.enabled === 'boolean') {
      enabled = ov.enabled
    }
    out[key] = { ...slots, enabled }
  }
  return out
}

/**
 * Clean a single email's override for storage: keep only slots this email has,
 * drop empty slots + slots equal to the default (so an untouched Save keeps the
 * email on its byte-identical literal path), and record `enabled: false` only
 * for an email whose on/off lives in this column. Returns undefined when the
 * override carries nothing worth storing.
 */
export function normalizeEmailOverride(
  key: EmailAutomationKey,
  override: EmailAutomationOverride,
): EmailAutomationOverride | undefined {
  const spec = EMAIL_AUTOMATION_SPECS[key]
  const out: EmailAutomationOverride = {}
  for (const f of spec.slotFields) {
    const v = override[f.slot]
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (!trimmed) continue
    if (trimmed === (spec.slotDefaults[f.slot] ?? '').trim()) continue
    out[f.slot] = clampSlot(f.slot, trimmed)
  }
  if (spec.enableSource === 'email_automations' && override.enabled === false) {
    out.enabled = false
  }
  return Object.keys(out).length > 0 ? out : undefined
}
