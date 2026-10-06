/**
 * THE PMS CONNECT REQUEST — the pure half (docs/ACTIVATION.md S4, law 3:
 * honest while pending). A clinic cannot bind the NexHealth bridge itself;
 * the Synchronizer is installed by the platform. Before S4 the catalog said
 * "request access" and pointed at Support, and three roadmap tiles said
 * "coming soon" for systems the bridge already reaches. Now the door is one
 * form: which system you run, the practice name as it knows it, who we
 * should talk to and when. Then a status in the feature's own words with
 * the next step named and who is working on it.
 *
 * Client-safe: the vendor list, the copy, the validator. The server half
 * (lib/services/pms-connect.ts) stores the row and tells the platform.
 */

export const PMS_VENDORS = [
  { id: 'open_dental', label: 'Open Dental' },
  { id: 'dentrix', label: 'Dentrix' },
  { id: 'dentrix_ascend', label: 'Dentrix Ascend' },
  { id: 'eaglesoft', label: 'Eaglesoft' },
  { id: 'curve', label: 'Curve Dental' },
  { id: 'other', label: 'Something else' },
] as const

export type PmsVendorId = (typeof PMS_VENDORS)[number]['id']

export function isPmsVendor(id: unknown): id is PmsVendorId {
  return typeof id === 'string' && PMS_VENDORS.some((v) => v.id === id)
}

/** The systems the bridge reaches, for the card's own sentence. */
export const BRIDGE_SYSTEMS = 'Open Dental, Dentrix, Dentrix Ascend, Eaglesoft, Curve and most others'

export const BEST_TIMES = [
  { id: 'morning', label: 'Mornings' },
  { id: 'midday', label: 'Around lunch' },
  { id: 'afternoon', label: 'Afternoons' },
  { id: 'any', label: 'Any time the office is open' },
] as const
export type BestTimeId = (typeof BEST_TIMES)[number]['id']

export type PmsConnectStatus = 'requested' | 'scheduled' | 'connected' | 'closed'

export interface PmsConnectInput {
  vendor: string
  vendorName?: string | null
  practiceNameInPms?: string | null
  contactName: string
  contactEmail: string
  contactPhone?: string | null
  bestTime?: string | null
  notes?: string | null
}

export interface PmsConnectIssue {
  field: keyof PmsConnectInput
  message: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trim, bound and check the form. Model and wire input alike are untrusted. */
export function validatePmsConnectRequest(raw: Partial<PmsConnectInput>): { ok: true; value: PmsConnectInput } | { ok: false; issues: PmsConnectIssue[] } {
  const issues: PmsConnectIssue[] = []
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
  const vendor = clip(raw.vendor, 40)
  const vendorName = clip(raw.vendorName, 80)
  const practiceNameInPms = clip(raw.practiceNameInPms, 120)
  const contactName = clip(raw.contactName, 120)
  const contactEmail = clip(raw.contactEmail, 200).toLowerCase()
  const contactPhone = clip(raw.contactPhone, 40)
  const bestTime = clip(raw.bestTime, 20)
  const notes = clip(raw.notes, 1000)

  if (!isPmsVendor(vendor)) issues.push({ field: 'vendor', message: 'Pick the system your practice runs.' })
  if (vendor === 'other' && !vendorName) issues.push({ field: 'vendorName', message: 'Tell us what it is called.' })
  if (!contactName) issues.push({ field: 'contactName', message: 'Who should we talk to?' })
  if (!EMAIL.test(contactEmail)) issues.push({ field: 'contactEmail', message: 'An email we can reach them at.' })
  if (bestTime && !BEST_TIMES.some((b) => b.id === bestTime)) issues.push({ field: 'bestTime', message: 'Pick one of the times.' })

  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    value: {
      vendor,
      vendorName: vendor === 'other' ? vendorName : null,
      practiceNameInPms: practiceNameInPms || null,
      contactName,
      contactEmail,
      contactPhone: contactPhone || null,
      bestTime: bestTime || null,
      notes: notes || null,
    },
  }
}

/** The vendor as a sentence can name it. */
export function pmsVendorLabel(vendor: string, vendorName?: string | null): string {
  if (vendor === 'other') return vendorName?.trim() || 'your practice software'
  return PMS_VENDORS.find((v) => v.id === vendor)?.label ?? vendor
}

/**
 * The status in the feature's own words — the next step named, and who is
 * on it. Never "coming soon".
 */
export function describePmsConnectStatus(status: PmsConnectStatus, vendorLabel: string): { pill: string; sentence: string } {
  switch (status) {
    case 'requested':
      return {
        pill: 'We’re connecting it',
        sentence: `We have your request for ${vendorLabel}. You’ll hear from Dustin within a day to set a time for the short install — nothing else is needed from you yet.`,
      }
    case 'scheduled':
      return {
        pill: 'Install scheduled',
        sentence: `The ${vendorLabel} install is on the calendar. Once it runs, your patients and appointments start syncing on their own.`,
      }
    case 'connected':
      return { pill: 'Connected', sentence: `${vendorLabel} is connected and syncing.` }
    case 'closed':
      return {
        pill: 'Not connected',
        sentence: `We couldn’t connect ${vendorLabel} this time. Write to Support if anything has changed and we’ll pick it back up.`,
      }
  }
}

/** The intro card's copy — what it does, what to know, one button. */
export const PMS_CONNECT_INTRO = {
  title: 'Connect your practice software',
  lede: `One bridge reaches ${BRIDGE_SYSTEMS}. Tell us which one you run and we connect it with you.`,
  does: [
    'Brings your patients, appointments, providers and balances into DreamCRM and keeps them in step.',
    'Lets online booking offer your real open times instead of a request form.',
    'Gives every reminder, recall invitation and follow-up a real schedule to work from.',
  ],
  know: [
    'The connection is a short install on your server — ours to do, with you or your IT on a quick call. No cost to your practice.',
    'We read through the system’s official bridge and never write into your database behind its back; write-back stays off until you ask.',
    'Nothing leaves your practice until the install runs — this form only tells us who to call.',
  ],
  button: 'Request the connection',
  askManager: 'An owner or admin can request the connection.',
  onlyManagers: 'Only an owner or admin can request the PMS connection.',
} as const

/** The line the request writes into the clinic's support thread. */
export function pmsConnectRequestMessage(input: PmsConnectInput, clinicName: string): string {
  const vendor = pmsVendorLabel(input.vendor, input.vendorName)
  const lines = [
    `PMS connect request from ${clinicName}: ${vendor}.`,
    input.practiceNameInPms ? `Practice name in ${vendor}: ${input.practiceNameInPms}.` : null,
    `Contact: ${input.contactName} · ${input.contactEmail}${input.contactPhone ? ` · ${input.contactPhone}` : ''}.`,
    input.bestTime ? `Best time: ${BEST_TIMES.find((b) => b.id === input.bestTime)?.label ?? input.bestTime}.` : null,
    input.notes ? `Notes: ${input.notes}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}
