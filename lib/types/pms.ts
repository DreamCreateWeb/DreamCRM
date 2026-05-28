// Client-safe PMS-integration types + pure helpers (no server-only deps), so
// the /integrations UI can import provider catalog, labels, the fixed field
// map, and the scope-boundary lists. DB + API logic lives in lib/services/pms/.
//
// DreamCRM is the orbital layer over a clinic's PMS — we sync the relationship
// layer (patients / appointments / providers / balances) and NEVER touch
// clinical data. The whole posture is "sanctioned, audit-clean": read + write
// only through the PMS's official API, so every change lands in the clinic's
// own PMS Audit Trail (the opposite of the direct-DB scrapers Open Dental
// warns its customers against).

export type PmsProviderId =
  | 'open_dental'
  | 'dentrix_ascend'
  | 'dentrix_desktop'
  | 'eaglesoft'
  | 'curve'
  | 'demo'

export type PmsConnectionStatus = 'not_connected' | 'connected' | 'error'
export type SyncDirection = 'import' | 'two_way'
export type SyncRunStatus = 'running' | 'success' | 'partial' | 'error'
export type WriteOpStatus = 'pending' | 'success' | 'error' | 'skipped'
export type WriteOpOperation = 'create' | 'update'
export type PmsEntityType = 'patient' | 'appointment' | 'provider'
// Write-op entity types extend PmsEntityType with audit-only entries that
// aren't kept in the entity_map (commlog mirrors are write-only).
export type PmsWriteOpEntityType = PmsEntityType | 'commlog'

// Availability in the provider catalog:
//   'live'           — wired now (Open Dental)
//   'request_access' — official API exists but needs vendor/partner approval
//   'roadmap'        — planned, harder (needs a local agent installed per office)
export type PmsAvailability = 'live' | 'request_access' | 'roadmap'

export interface PmsProviderInfo {
  id: PmsProviderId
  name: string
  availability: PmsAvailability
  blurb: string
  /** How the integration physically connects. */
  connection: string
  /** Honest difficulty / trust note shown in the catalog card. */
  note?: string
}

// The catalog rendered when a clinic hasn't connected yet. Open Dental is the
// one we actually wire in v1; the rest are shown honestly per the research —
// Dentrix Ascend needs Henry Schein One approval, desktop Dentrix/Eaglesoft
// need a signed local agent per office, Curve is partner-gated. We show we
// know the landscape (dental-specialization trust signal) without faking
// integrations we can't test.
export const PMS_PROVIDERS: PmsProviderInfo[] = [
  {
    id: 'open_dental',
    name: 'Open Dental',
    availability: 'live',
    blurb: 'The most open PMS API in dentistry — connect in minutes with a Customer Key.',
    connection: 'Official REST API',
    note: 'Sanctioned + audit-clean: every change lands in your Open Dental Audit Trail. We never touch the database directly.',
  },
  {
    id: 'dentrix_ascend',
    name: 'Dentrix Ascend',
    availability: 'request_access',
    blurb: 'Cloud Dentrix, via the Henry Schein One API Exchange.',
    connection: 'Cloud REST API · OAuth 2.0',
    note: 'Requires Henry Schein One partner approval. Request access and we’ll enable it for your practice.',
  },
  {
    id: 'dentrix_desktop',
    name: 'Dentrix (desktop)',
    availability: 'roadmap',
    blurb: 'On-prem Dentrix G-series via the Dentrix Developer Program.',
    connection: 'Signed local connector per office',
    note: 'Needs a signed agent installed at each location. On the roadmap after Open Dental.',
  },
  {
    id: 'eaglesoft',
    name: 'Eaglesoft',
    availability: 'roadmap',
    blurb: 'Patterson’s PMS — integrations run through Patterson Innovation Connection.',
    connection: 'Local agent · partner program',
    note: 'The most closed of the majors. On the roadmap.',
  },
  {
    id: 'curve',
    name: 'Curve Dental',
    availability: 'roadmap',
    blurb: 'Cloud-native PMS with an open-architecture partner network.',
    connection: 'Cloud API · partner network',
    note: 'On the roadmap after Open Dental + Dentrix.',
  },
]

export function pmsProvider(id: PmsProviderId): PmsProviderInfo | undefined {
  return PMS_PROVIDERS.find((p) => p.id === id)
}

// Short display name for any provider id (incl. the internal 'demo' sandbox,
// which presents as an Open Dental sandbox in the demo clinic).
export const PROVIDER_LABELS: Record<PmsProviderId, string> = {
  open_dental: 'Open Dental',
  dentrix_ascend: 'Dentrix Ascend',
  dentrix_desktop: 'Dentrix (desktop)',
  eaglesoft: 'Eaglesoft',
  curve: 'Curve Dental',
  demo: 'Open Dental (Sandbox)',
}

export const SYNC_STATUS_LABELS: Record<SyncRunStatus, string> = {
  running: 'Syncing…',
  success: 'Synced',
  partial: 'Partial',
  error: 'Failed',
}

export const WRITE_OP_STATUS_LABELS: Record<WriteOpStatus, string> = {
  pending: 'Queued',
  success: 'Written to PMS',
  error: 'Failed',
  skipped: 'Skipped',
}

export const ENTITY_LABELS: Record<PmsEntityType, string> = {
  patient: 'Patient',
  appointment: 'Appointment',
  provider: 'Provider',
}

// Superset of ENTITY_LABELS for the write-back audit log — commlog is a
// write-only audit entry that doesn't appear in entity_map but does show in
// the Integrations write-back log row alongside patient/appointment writes.
export const WRITE_OP_ENTITY_LABELS: Record<PmsWriteOpEntityType, string> = {
  ...ENTITY_LABELS,
  commlog: 'Comm log',
}

// ── Transparent fixed field map ─────────────────────────────────────────────
// v1 decision: the mapping is deterministic, so we SHOW clinics exactly how
// Open Dental fields populate DreamCRM columns rather than shipping a
// configurable mapper nobody touches. `direction` is per-entity: appointments
// and patients flow both ways (we push the bookings we originate); providers
// are import-only.

export interface FieldMapping {
  pms: string
  crm: string
  note?: string
}

export interface EntityFieldMap {
  entity: PmsEntityType
  label: string
  direction: SyncDirection
  fields: FieldMapping[]
}

export const OPEN_DENTAL_FIELD_MAP: EntityFieldMap[] = [
  {
    entity: 'patient',
    label: 'Patients',
    direction: 'two_way',
    fields: [
      { pms: 'PatNum', crm: 'pms_entity_map.external_id', note: 'Open Dental patient id — the durable link key' },
      { pms: 'FName', crm: 'patient.first_name' },
      { pms: 'LName', crm: 'patient.last_name' },
      { pms: 'Birthdate', crm: 'patient.date_of_birth' },
      { pms: 'Email', crm: 'patient.email' },
      { pms: 'WirelessPhone · HmPhone', crm: 'patient.phone' },
      { pms: 'Address · City · State · Zip', crm: 'patient.address_line1 · city · state · postal_code' },
      { pms: 'EstBalance', crm: 'patient.pms_balance_cents', note: 'Read-only — the PMS owns AR truth' },
    ],
  },
  {
    entity: 'appointment',
    label: 'Appointments',
    direction: 'two_way',
    fields: [
      { pms: 'AptNum', crm: 'pms_entity_map.external_id' },
      { pms: 'PatNum', crm: 'appointment.patient_id', note: 'Resolved through the patient link' },
      { pms: 'AptDateTime', crm: 'appointment.start_time' },
      { pms: 'Pattern (length)', crm: 'appointment.end_time', note: 'End time derived from the time pattern' },
      { pms: 'AptStatus', crm: 'appointment.status', note: 'Scheduled · Complete · Broken → our status' },
      { pms: 'ProvNum', crm: 'appointment.provider_id', note: 'Through the provider link' },
      { pms: 'Note', crm: 'appointment.notes' },
    ],
  },
  {
    entity: 'provider',
    label: 'Providers',
    direction: 'import',
    fields: [
      { pms: 'ProvNum', crm: 'pms_entity_map.external_id' },
      { pms: 'FName · LName', crm: 'clinic_provider.display_name' },
      { pms: 'Specialty', crm: 'clinic_provider.role', note: 'Display label only — no NPI / license / signature synced' },
    ],
  },
]

// ── Scope boundary (shown proudly in the UI) ────────────────────────────────
// "Wrap, don't replace": these encode exactly what we sync vs. what stays in
// the PMS. Showing the boundary IS the feature — it reassures the clinic we’re
// not trying to be their chart.

export interface SyncedEntity {
  label: string
  detail: string
  icon: 'users' | 'cal' | 'badge' | 'dollar'
}

export const SYNCED_ENTITIES: SyncedEntity[] = [
  { label: 'Patient profiles', detail: 'Name, contact, DOB, address', icon: 'users' },
  { label: 'Appointments', detail: 'Times, type, status, provider', icon: 'cal' },
  { label: 'Providers', detail: 'Staff names for your agenda', icon: 'badge' },
  { label: 'Balances', detail: 'Estimated patient balance (read-only)', icon: 'dollar' },
]

export const NEVER_TOUCHED: string[] = [
  'Tooth charting & perio',
  'Treatment plans',
  'Procedure codes & fees',
  'Insurance claims & EDI',
  'Clinical / SOAP notes',
  'Imaging & X-rays',
]

// What Open Dental charges the office to enable their API — surfaced honestly
// in the connect flow so clinics aren’t surprised.
export const OPEN_DENTAL_API_FEE_NOTE =
  'Open Dental charges the office $30/mo per location to enable their API. That fee is billed by Open Dental, not DreamCRM.'
