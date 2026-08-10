import 'server-only'
import {
  nexGetAll,
  listLocations,
  type NexHealthEnv,
  type NexPatient,
  type NexAppointment,
  type NexProvider,
} from '@/lib/nexhealth'
import type {
  PmsProviderClient,
  PmsTestResult,
  PmsWriteResult,
  NormalizedPatient,
  NormalizedAppointment,
  NormalizedProvider,
  NormalizedRecall,
  CreatePatientPayload,
  CreateAppointmentPayload,
  CreateCommLogPayload,
  AppointmentStatusChange,
} from './provider'

/**
 * NexHealth Synchronizer adapter (onboarding overhaul §2.6) — ONE adapter
 * that reaches Dentrix, Eaglesoft, and every other PMS the Synchronizer
 * bridges, through NexHealth's cloud API. The per-office Synchronizer
 * install is an OPS step (institution + sync created in the developer
 * portal, installer run on the practice server); this adapter starts
 * working the moment that install syncs data.
 *
 * Scoping: (subdomain, locationId) from pms_connection.meta. The API key is
 * platform-level (mirrors OD's Developer Key); `env: 'sandbox'` on the meta
 * binds NexHealth's demo practice for our own test org.
 *
 * v1 is READ-ONLY (import direction): patients, appointments, providers.
 * Write-backs throw typed not-supported errors — the connect service pins
 * syncDirection 'import' so the engine never queues writes; recalls have no
 * NexHealth endpoint (probed 2026-08-08: /recalls → 404) so the list is
 * honestly empty rather than guessed.
 *
 * Status mapping (the honest version of Dentrix-through-NexHealth):
 *   cancelled/deleted → cancelled · patient_missed → no_show ·
 *   checked_out → completed · else past end + not future-cancellable →
 *   completed · confirmed/patient_confirmed → confirmed · else scheduled.
 * VALIDATED against the sandbox demo practice (104 patients, 353
 * appointments, 5 providers, Dentrix-sourced shapes).
 */

const APPT_LOOKBACK_DAYS = 90
const APPT_HORIZON_DAYS = 365

export interface NexHealthProviderConfig {
  subdomain: string
  locationId: number
  env?: NexHealthEnv
  /** When set, every outbound call is metered against this org and the
   *  daily budget breaker applies (production env only — sandbox is free
   *  and is the tuning fixture). Absent = unmetered (tests, probes). */
  organizationId?: string
}

function digitsOrNull(v: string | null | undefined): string | null {
  const d = v?.replace(/\D/g, '') ?? ''
  return d.length >= 7 ? d : null
}

function centsFromAmount(amount: string | null | undefined): number | null {
  if (amount == null) return null
  const n = Number.parseFloat(amount)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function mapNexAppointmentStatus(
  a: Pick<
    NexAppointment,
    'cancelled' | 'deleted' | 'patient_missed' | 'checked_out' | 'confirmed' | 'patient_confirmed' | 'end_time'
  >,
  now: Date = new Date(),
): NormalizedAppointment['status'] {
  if (a.cancelled || a.deleted) return 'cancelled'
  if (a.patient_missed) return 'no_show'
  if (a.checked_out) return 'completed'
  const end = a.end_time ? new Date(a.end_time) : null
  if (end && !Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) return 'completed'
  if (a.confirmed || a.patient_confirmed) return 'confirmed'
  return 'scheduled'
}

export class NexHealthProvider implements PmsProviderClient {
  readonly id = 'nexhealth' as const
  private readonly subdomain: string
  private readonly locationId: number
  private readonly env: NexHealthEnv
  private readonly organizationId: string | null

  constructor(config: NexHealthProviderConfig) {
    this.subdomain = config.subdomain
    this.locationId = config.locationId
    this.env = config.env ?? 'production'
    this.organizationId = config.organizationId ?? null
  }

  private get scope() {
    return { subdomain: this.subdomain, location_id: this.locationId }
  }

  /** Request opts carrying the per-call meter hook when an org is bound. */
  private reqOpts(): { env: NexHealthEnv; onCall?: () => Promise<void> } {
    const orgId = this.organizationId
    if (!orgId) return { env: this.env }
    return {
      env: this.env,
      onCall: async () => {
        const { recordPmsApiCall } = await import('./api-meter')
        await recordPmsApiCall(orgId)
      },
    }
  }

  /** The circuit breaker — checked at the start of every list operation.
   *  Production only: sandbox calls are free and are the tuning fixture. */
  private async checkBudget(): Promise<void> {
    if (!this.organizationId || this.env === 'sandbox') return
    const { assertPmsApiBudget } = await import('./api-meter')
    await assertPmsApiBudget(this.organizationId)
  }

  async testConnection(): Promise<PmsTestResult> {
    try {
      const locations = await listLocations(this.subdomain, this.reqOpts())
      const loc = locations.find((l) => l.id === this.locationId)
      if (!loc) {
        return {
          ok: false,
          error: `Location ${this.locationId} isn’t on the '${this.subdomain}' institution — check the binding.`,
        }
      }
      return {
        ok: true,
        practiceTitle: loc.name ?? this.subdomain,
        // last_sync_time null = the Synchronizer install hasn't completed
        // its first pass yet — connected-but-waiting, worth saying.
        scopeNote: loc.last_sync_time
          ? `Synchronizer last synced ${loc.last_sync_time}`
          : 'Synchronizer installed — first sync has not completed yet',
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'NexHealth unreachable' }
    }
  }

  async listProviders(): Promise<NormalizedProvider[]> {
    await this.checkBudget()
    const rows = await nexGetAll<NexProvider>('providers', this.scope, 'providers', this.reqOpts())
    return rows
      .filter((p) => p && typeof p.id === 'number' && !p.inactive)
      .map((p) => ({
        externalId: String(p.id),
        displayName:
          p.name?.trim() ||
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
          `Provider ${p.id}`,
        role: null, // NexHealth doesn't expose a role vocabulary
      }))
  }

  async listPatients(opts: { since?: Date } = {}): Promise<NormalizedPatient[]> {
    await this.checkBudget()
    // DELTA when the engine hands us its high-water mark: `updated_since`
    // is verified server-side filtering (probed both directions against the
    // sandbox, 2026-08-08) — a quiet hour costs ONE call returning nothing
    // instead of a full multi-page patient pull. Cold start (no mark) is
    // the one intentional full pull.
    const rows = await nexGetAll<NexPatient>(
      'patients',
      { ...this.scope, ...(opts.since ? { updated_since: opts.since.toISOString() } : {}) },
      'patients',
      this.reqOpts(),
    )
    return rows
      .filter((p) => p && typeof p.id === 'number' && !p.inactive)
      .map((p) => ({
        externalId: String(p.id),
        firstName: p.first_name?.trim() || 'Unknown',
        lastName: p.last_name?.trim() || '',
        dateOfBirth: p.bio?.date_of_birth ?? null,
        // NexHealth seeds placeholder @example.com addresses in sandbox data;
        // they're real-shaped, so we pass them through — the engine's linked-
        // login guard already protects portal identities from overwrites.
        email: p.email?.trim() || null,
        phone: digitsOrNull(p.bio?.verified_mobile ?? p.bio?.phone_number),
        addressLine1: p.bio?.address_line_1 ?? null,
        city: p.bio?.city ?? null,
        state: p.bio?.state ?? null,
        postalCode: p.bio?.zip_code ?? null,
        balanceCents: centsFromAmount(p.balance?.amount),
      }))
  }

  async listAppointments(opts: { since?: Date } = {}): Promise<NormalizedAppointment[]> {
    await this.checkBudget()
    // The endpoint requires an explicit SCHEDULE window (start/end filter by
    // appointment time). The cost lever is `updated_since` (verified real
    // filtering, probed 2026-08-08): with the engine's high-water mark we
    // sweep a WIDE schedule window but only CHANGED rows come back — a quiet
    // hour is one call returning nothing. Cold start (no mark) is the one
    // intentional full backfill of the same window.
    const now = Date.now()
    const start = new Date(now - APPT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const end = new Date(now + APPT_HORIZON_DAYS * 24 * 60 * 60 * 1000)
    const rows = await nexGetAll<NexAppointment>(
      'appointments',
      {
        ...this.scope,
        start: start.toISOString(),
        end: end.toISOString(),
        ...(opts.since ? { updated_since: opts.since.toISOString() } : {}),
      },
      'appointments',
      this.reqOpts(),
    )
    const out: NormalizedAppointment[] = []
    for (const a of rows) {
      if (!a || typeof a.id !== 'number' || typeof a.patient_id !== 'number') continue
      const startTime = a.start_time ? new Date(a.start_time) : null
      if (!startTime || Number.isNaN(startTime.getTime())) continue
      const endTime = a.end_time ? new Date(a.end_time) : null
      out.push({
        externalId: String(a.id),
        patientExternalId: String(a.patient_id),
        providerExternalId: a.provider_id != null ? String(a.provider_id) : null,
        startTime,
        endTime: endTime && !Number.isNaN(endTime.getTime()) ? endTime : null,
        status: mapNexAppointmentStatus(a),
        type: null, // appointment_type names need a second lookup; v2
        note: a.note?.trim() || null,
      })
    }
    return out
  }

  async listRecalls(): Promise<NormalizedRecall[]> {
    // No /recalls resource in the Synchronizer API (probed: 404). Empty is
    // the honest answer — recall dates stay on our appointment-derived
    // heuristic for NexHealth-bridged offices.
    return []
  }

  async createPatient(_payload: CreatePatientPayload): Promise<PmsWriteResult> {
    throw new Error('NexHealth write-back is not enabled yet (v1 is import-only).')
  }

  async createCommLog(_payload: CreateCommLogPayload): Promise<PmsWriteResult> {
    // NexHealth has no comm-log resource; call sites treat mirroring as
    // best-effort, so this typed refusal is logged and skipped.
    throw new Error('NexHealth does not support comm-log mirroring.')
  }

  async createAppointment(_payload: CreateAppointmentPayload): Promise<PmsWriteResult> {
    throw new Error('NexHealth write-back is not enabled yet (v1 is import-only).')
  }

  async updateAppointment(_externalId: string, _changes: AppointmentStatusChange): Promise<void> {
    throw new Error('NexHealth write-back is not enabled yet (v1 is import-only).')
  }
}
