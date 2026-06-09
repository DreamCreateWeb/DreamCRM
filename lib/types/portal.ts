// Client-safe types + defaults for the patient portal and its per-clinic
// customization settings (Settings → Patient portal).
//
// Stored as a single jsonb column `clinic_profile.portal_settings`; null =
// DEFAULT_PORTAL_SETTINGS. Per the portal research (2026-06): toggles must
// HIDE features entirely when off (RevenueWell's documented dead-link toggle
// is the anti-pattern), copy must be clinic-editable (no competitor ships
// this), and payments default OFF because they require a connected Stripe
// account + a front-desk reconciliation habit.

/** Feature switches. OFF = the patient never sees the surface at all. */
export interface PortalFeatureFlags {
  /** Book new visits from the portal (slot picker). */
  booking: boolean
  /** Self-serve reschedule + cancel on upcoming visits (outside the notice window). */
  reschedule: boolean
  /** Message the front desk (in-app thread). */
  messages: boolean
  /** Balance, membership card, payment + order history. */
  billing: boolean
  /**
   * Online balance payment via the clinic's connected Stripe account.
   * Requires Stripe Connect (shop module) to be active; the portal hides
   * the pay button when the account is missing even if this is on.
   */
  payments: boolean
  /** Visit history, forms on file, personal + insurance info. */
  records: boolean
  /** Fill intake / new-patient forms from the portal. */
  forms: boolean
  /** Family access — guardians see + manage linked dependents. */
  family: boolean
  /** "Shop" link out to the clinic storefront (only when storefront is enabled). */
  shopLink: boolean
}

/** Booking behavior knobs (only meaningful when features.booking is on). */
export interface PortalBookingSettings {
  /**
   * Appointment types patients may self-book. Restricting types is the
   * field-literature fix for the "patient booked a 30-min slot for a root
   * canal" schedule-buster. Values match appointment.type.
   */
  allowedTypes: string[]
  /** Soonest self-bookable slot, in hours from now. 0 = same-slot booking. */
  minNoticeHours: number
}

/** Reschedule/cancel behavior knobs (when features.reschedule is on). */
export interface PortalRescheduleSettings {
  /**
   * Inside this window the portal stops offering self-serve reschedule and
   * cancel and shows "call us" instead — protects tomorrow's schedule while
   * keeping the action one tap away further out.
   */
  minNoticeHours: number
}

/** Clinic-editable portal copy. Null fields fall back to warm defaults. */
export interface PortalCopySettings {
  /** Replaces the default "Hi, {firstName}" greeting headline. `{firstName}` token supported. */
  welcomeHeadline: string | null
  /** One warm sentence under the greeting. */
  welcomeMessage: string | null
  /** Dismissible announcement strip at the top of the portal (closures, new hours...). Null = hidden. */
  announcement: string | null
  /**
   * "After your visit" care note, shown on the home screen for ~7 days after
   * a completed visit and on the visit detail. Null = section hidden.
   */
  aftercareNote: string | null
}

export interface PortalDisplaySettings {
  /** Show provider headshots on visit cards (real faces are a measured trust win). */
  showTeamPhotos: boolean
}

export interface PortalSettings {
  features: PortalFeatureFlags
  booking: PortalBookingSettings
  reschedule: PortalRescheduleSettings
  copy: PortalCopySettings
  display: PortalDisplaySettings
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  features: {
    booking: true,
    reschedule: true,
    messages: true,
    billing: true,
    payments: false,
    records: true,
    forms: true,
    family: true,
    shopLink: true,
  },
  booking: {
    // Hygiene + diagnostic visits only by default — clinical/procedure visits
    // (filling, extraction, root canal) need a phone call so the front desk
    // books the right chair time.
    allowedTypes: ['cleaning', 'checkup', 'consultation'],
    minNoticeHours: 2,
  },
  reschedule: {
    minNoticeHours: 24,
  },
  copy: {
    welcomeHeadline: null,
    welcomeMessage: null,
    announcement: null,
    aftercareNote: null,
  },
  display: {
    showTeamPhotos: true,
  },
}

/** Labels + descriptions for the Settings → Patient portal toggles. */
export const PORTAL_FEATURE_LABELS: Record<keyof PortalFeatureFlags, { label: string; description: string }> = {
  booking: {
    label: 'Online booking',
    description: 'Patients can book a new visit from the portal using your live availability.',
  },
  reschedule: {
    label: 'Self-serve reschedule & cancel',
    description: 'Patients can move or cancel an upcoming visit themselves, outside your notice window.',
  },
  messages: {
    label: 'Messages',
    description: 'Patients can send your front desk a message and read replies.',
  },
  billing: {
    label: 'Billing & membership',
    description: 'Patients see their balance, membership plan, and purchase history.',
  },
  payments: {
    label: 'Online payments',
    description: 'Patients can pay their balance online. Requires your connected Stripe account (Shop → Connect). Payments land in your bank; post them to your PMS ledger.',
  },
  records: {
    label: 'My records',
    description: 'Visit history, forms on file, and the personal + insurance details you keep.',
  },
  forms: {
    label: 'Forms',
    description: 'Patients can fill out intake and new-patient forms from the portal.',
  },
  family: {
    label: 'Family access',
    description: 'Guardians see and manage visits and forms for linked family members.',
  },
  shopLink: {
    label: 'Shop link',
    description: 'Show a link to your online store (only appears when your storefront is enabled).',
  },
}

/** Appointment types offerable in the portal booking type picker. */
export const PORTAL_BOOKABLE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'checkup', label: 'Checkup' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'filling', label: 'Filling' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'root_canal', label: 'Root canal' },
  { value: 'other', label: 'Other visit' },
]

/**
 * Patient-facing labels for appointment types — plain words, no clinical
 * vocabulary. Shared by the portal pages and emails it sends.
 */
export const PORTAL_VISIT_LABELS: Record<string, string> = {
  checkup: 'Checkup',
  cleaning: 'Cleaning',
  filling: 'Filling',
  extraction: 'Extraction',
  root_canal: 'Root canal',
  consultation: 'Consultation',
  other: 'Visit',
}

/**
 * Merge a stored (possibly partial / legacy) jsonb value over the defaults.
 * Unknown keys are dropped; missing keys inherit defaults — so adding a new
 * setting never requires a backfill.
 */
export function resolvePortalSettings(stored: unknown): PortalSettings {
  const d = DEFAULT_PORTAL_SETTINGS
  if (!stored || typeof stored !== 'object') return structuredClone(d)
  const s = stored as Partial<Record<keyof PortalSettings, unknown>>

  const features = { ...d.features }
  if (s.features && typeof s.features === 'object') {
    for (const key of Object.keys(features) as Array<keyof PortalFeatureFlags>) {
      const v = (s.features as Record<string, unknown>)[key]
      if (typeof v === 'boolean') features[key] = v
    }
  }

  const booking = { ...d.booking, allowedTypes: [...d.booking.allowedTypes] }
  if (s.booking && typeof s.booking === 'object') {
    const b = s.booking as Record<string, unknown>
    if (Array.isArray(b.allowedTypes)) {
      const known = new Set(PORTAL_BOOKABLE_TYPES.map((t) => t.value))
      const cleaned = b.allowedTypes.filter((t): t is string => typeof t === 'string' && known.has(t))
      if (cleaned.length > 0) booking.allowedTypes = cleaned
    }
    if (typeof b.minNoticeHours === 'number' && Number.isFinite(b.minNoticeHours) && b.minNoticeHours >= 0) {
      booking.minNoticeHours = b.minNoticeHours
    }
  }

  const reschedule = { ...d.reschedule }
  if (s.reschedule && typeof s.reschedule === 'object') {
    const r = s.reschedule as Record<string, unknown>
    if (typeof r.minNoticeHours === 'number' && Number.isFinite(r.minNoticeHours) && r.minNoticeHours >= 0) {
      reschedule.minNoticeHours = r.minNoticeHours
    }
  }

  const copy = { ...d.copy }
  if (s.copy && typeof s.copy === 'object') {
    const c = s.copy as Record<string, unknown>
    for (const key of Object.keys(copy) as Array<keyof PortalCopySettings>) {
      const v = c[key]
      if (typeof v === 'string') copy[key] = v.trim() === '' ? null : v
      else if (v === null) copy[key] = null
    }
  }

  const display = { ...d.display }
  if (s.display && typeof s.display === 'object') {
    const v = (s.display as Record<string, unknown>).showTeamPhotos
    if (typeof v === 'boolean') display.showTeamPhotos = v
  }

  return { features, booking, reschedule, copy, display }
}
