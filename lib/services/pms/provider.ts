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
  createPatient(payload: CreatePatientPayload): Promise<PmsWriteResult>
  createAppointment(payload: CreateAppointmentPayload): Promise<PmsWriteResult>
}
