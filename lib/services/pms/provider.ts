import 'server-only'
import type { PmsProviderId } from '@/lib/types/pms'

/**
 * Provider-agnostic DTOs + the adapter interface. Each PMS adapter
 * (open-dental.ts, demo.ts) normalizes its native shapes into these so the
 * sync engine (sync.ts) is PMS-independent. We model ONLY the relationship
 * layer — patients, appointments, providers, balances. Never clinical data.
 */

export interface NormalizedPatient {
  externalId: string
  firstName: string
  lastName: string
  dateOfBirth?: string | null // 'YYYY-MM-DD'
  email?: string | null
  phone?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  /** Estimated patient balance in cents. PMS owns AR truth; read-only here. */
  balanceCents?: number | null
}

export interface NormalizedAppointment {
  externalId: string
  patientExternalId: string
  providerExternalId?: string | null
  startTime: Date
  endTime?: Date | null
  // Normalized to our appointment.status vocabulary.
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  type?: string | null
  note?: string | null
}

export interface NormalizedProvider {
  externalId: string
  displayName: string
  // Mapped onto our clinic_provider.role vocabulary where possible.
  role?: string | null
}

// PMS recall entry. The PMS owns the recall engine; we sync due dates onto
// patient.pmsRecallDueAt so Recall & Outreach + the patients list prefer the
// authoritative PMS date over our appointment-derived heuristic.
export interface NormalizedRecall {
  externalId: string // RecallNum
  patientExternalId: string // PatNum
  dueDate: Date | null // null when the PMS reports its no-date sentinel
  previousDate: Date | null
  interval: string | null // e.g. "6m"
  isDisabled: boolean
}

// Commlog write-back payload — every DreamCRM-originated patient message
// (booking confirmation, reminder, review request, intake send, reply) gets
// mirrored as a CommLog entry in OD so the front desk sees the full comms
// history in the patient's chart. Write-only (we never import OD's commlogs).
export type CommLogMode = 'Email' | 'Text' | 'Phone' | 'Mailed' | 'In Person'
export type CommLogDirection = 'Sent' | 'Received'
export interface CreateCommLogPayload {
  externalPatientId: string // OD PatNum
  note: string // body / summary that shows in the chart
  mode: CommLogMode
  sentOrReceived: CommLogDirection
  commDateTime: Date // adapter converts to office-local wall-clock
}

// ── Write-back payloads (DreamCRM → PMS, via the official API only) ──────────

export interface CreatePatientPayload {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  dateOfBirth?: string | null
}

export interface CreateAppointmentPayload {
  patientExternalId: string
  startTime: Date
  endTime?: Date | null
  providerExternalId?: string | null
  note?: string | null
}

// A status change pushed back to the PMS (Phase 1: cancellations). We push
// only status — reschedules are modeled as cancel-original + create-new.
export interface AppointmentStatusChange {
  status: 'cancelled' | 'no_show' | 'completed'
}

export interface PmsTestResult {
  ok: boolean
  practiceTitle?: string
  version?: string
  eConnectorReachable?: boolean
  scopeNote?: string
  error?: string
}

export interface PmsWriteResult {
  externalId: string
  raw?: Record<string, unknown>
}

export interface PmsProviderClient {
  readonly id: PmsProviderId
  /** Cheap reachability + auth check; never throws (returns ok:false). */
  testConnection(): Promise<PmsTestResult>
  listProviders(): Promise<NormalizedProvider[]>
  // Patients have no DateTStamp delta on the OD list endpoint → full paginated
  // pull (the engine's content-hash skip avoids redundant writes).
  listPatients(): Promise<NormalizedPatient[]>
  listAppointments(opts?: { since?: Date }): Promise<NormalizedAppointment[]>
  /** PMS recall list — OD doesn't honor a DateTStamp filter on /recalls,
   *  so this is a full paginated pull (small N + content-skip per-patient). */
  listRecalls(): Promise<NormalizedRecall[]>
  createPatient(payload: CreatePatientPayload): Promise<PmsWriteResult>
  /** CommLog write — mirrors a DreamCRM-originated message into OD's
   *  patient chart so the front desk sees the full comms history. */
  createCommLog(payload: CreateCommLogPayload): Promise<PmsWriteResult>
  createAppointment(payload: CreateAppointmentPayload): Promise<PmsWriteResult>
  /** Push a status change for an existing PMS appointment (cancel/no-show). */
  updateAppointment(externalId: string, changes: AppointmentStatusChange): Promise<void>
}
