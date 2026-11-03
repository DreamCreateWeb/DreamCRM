/**
 * Human labels for `patient.source` — THE single home (the Patients list, its
 * source filter and the record's "via …" line must agree; each once kept its
 * own copy and the copies had already drifted on case and on which sources
 * they knew — neither knew 'waitlist' or 'website_chat'). Unknown values fall
 * back to the de-underscored raw string. Client-safe: no imports.
 */
export const SOURCE_LABEL: Record<string, string> = {
  website: 'Website',
  booking: 'Booking widget',
  booking_widget: 'Booking widget',
  website_request: 'Appointment request',
  website_chat: 'Website chat',
  lead_form: 'Contact form',
  waitlist: 'Waitlist',
  referral: 'Referral',
  walk_in: 'Walk-in',
  phone: 'Phone call',
  manual: 'Manual entry',
  invite: 'Patient invite',
  intake: 'Intake form',
  membership: 'Membership signup',
  pms: 'Practice system',
  pms_import: 'Practice system (imported)',
  import: 'CSV import',
}

export function patientSourceLabel(source: string | null | undefined): string {
  if (!source) return '—'
  return SOURCE_LABEL[source] ?? source.replace(/_/g, ' ')
}
