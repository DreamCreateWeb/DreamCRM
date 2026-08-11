import 'server-only'
import {
  nexGetAll,
  nexWrite,
  listLocations,
  listAppointmentTypes,
  listOperatories,
  listAppointmentSlots,
  type NexHealthEnv,
  type NexPatient,
  type NexAppointment,
  type NexProvider,
  type NexInsuranceCoverage,
} from '@/lib/nexhealth'
import {
  PmsWriteWaitingError,
  PmsWriteNotSupportedError,
  type PmsProviderClient,
  type PmsTestResult,
  type PmsWriteResult,
  type NormalizedPatient,
  type NormalizedAppointment,
  type NormalizedProvider,
  type NormalizedRecall,
  type CreatePatientPayload,
  type CreateAppointmentPayload,
  type CreateCommLogPayload,
  type AppointmentStatusChange,
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

// Appointment-type names change ~never, so the (subdomain, location) → name
// map is cached in module memory for a day: ~1 metered call per day instead
// of one per sync. A process restart just re-fetches once.
const APPT_TYPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const apptTypeCache = new Map<string, { fetchedAt: number; names: Map<number, string> }>()

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

/**
 * PMS appointment-type NAME → our appointment.type vocabulary. Keyword match,
 * most-specific first ("New patient exam and cleaning" is a hygiene visit,
 * so cleaning outranks exam). Unrecognized names are honestly 'other' —
 * never a guessed 'checkup'.
 */
export function mapNexApptTypeName(name: string | null | undefined): string | null {
  const n = (name ?? '').toLowerCase()
  if (!n.trim()) return null
  if (/root canal|endo/.test(n)) return 'root_canal'
  if (/extract/.test(n)) return 'extraction'
  if (/fill/.test(n)) return 'filling'
  if (/emergency|tooth ?pain|toothache/.test(n)) return 'emergency'
  if (/clean|hygiene|prophy/.test(n)) return 'cleaning'
  if (/consult/.test(n)) return 'consultation'
  if (/exam|check ?up|recall|new patient/.test(n)) return 'checkup'
  return 'other'
}

/** NexHealth's coarse specialty label → our clinic_provider.role vocabulary. */
export function mapNexSpecialty(specialty: string | null | undefined): string | null {
  const s = (specialty ?? '').toLowerCase()
  if (!s.trim()) return null
  if (/hygien/.test(s)) return 'hygienist'
  if (/assist/.test(s)) return 'assistant'
  if (/dentist|doctor|dds|dmd/.test(s)) return 'dentist'
  return 'specialist'
}

/** preferred_language/locale → our 'es' | null (English is the null default). */
export function mapNexPreferredLanguage(
  language: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const v = `${language ?? ''} ${locale ?? ''}`.toLowerCase()
  return /spanish|(^|[^a-z])es([-_]|$|\s)/.test(v) ? 'es' : null
}

/**
 * Pick the coverage to surface: lowest priority number (0 = primary) whose
 * plan isn't deleted and whose window (when stated) includes `now`.
 */
export function pickPrimaryCoverage(
  coverages: NexInsuranceCoverage[] | null | undefined,
  now: Date = new Date(),
): NexInsuranceCoverage | null {
  if (!Array.isArray(coverages)) return null
  const live = coverages.filter((c) => {
    if (!c || typeof c !== 'object') return false
    if (c.plan?.deleted_at) return false
    if (c.expiration_date && new Date(c.expiration_date).getTime() < now.getTime()) return false
    return Boolean(c.plan?.name || c.subscriber_num)
  })
  live.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  return live[0] ?? null
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
        role: mapNexSpecialty(p.nexhealth_specialty),
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
      {
        ...this.scope,
        // Insurance rides the SAME call (verified on the list endpoint,
        // 2026-08-10) — coverage costs zero extra requests.
        'include[]': 'insurance_coverages',
        ...(opts.since ? { updated_since: opts.since.toISOString() } : {}),
      },
      'patients',
      this.reqOpts(),
    )
    return rows
      .filter((p) => p && typeof p.id === 'number' && !p.inactive)
      .map((p) => {
        const coverage = pickPrimaryCoverage(p.insurance_coverages)
        return {
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
          insuranceProvider: coverage?.plan?.name?.trim() || null,
          insurancePolicyNumber: coverage?.subscriber_num?.trim() || null,
          insuranceGroupNumber: coverage?.plan?.group_num?.trim() || null,
          preferredLanguage: mapNexPreferredLanguage(p.preferred_language, p.preferred_locale),
          smsOptOut: p.unsubscribe_sms === true,
          guarantorExternalId: p.guarantor_id != null ? String(p.guarantor_id) : null,
        }
      })
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
    const typeNames = await this.apptTypeNames()
    const out: NormalizedAppointment[] = []
    for (const a of rows) {
      if (!a || typeof a.id !== 'number' || typeof a.patient_id !== 'number') continue
      const startTime = a.start_time ? new Date(a.start_time) : null
      if (!startTime || Number.isNaN(startTime.getTime())) continue
      const endTime = a.end_time ? new Date(a.end_time) : null
      const typeName = a.appointment_type_id != null ? typeNames.get(a.appointment_type_id) : undefined
      out.push({
        externalId: String(a.id),
        patientExternalId: String(a.patient_id),
        providerExternalId: a.provider_id != null ? String(a.provider_id) : null,
        startTime,
        endTime: endTime && !Number.isNaN(endTime.getTime()) ? endTime : null,
        status: mapNexAppointmentStatus(a),
        type: mapNexApptTypeName(typeName),
        note: a.note?.trim() || null,
      })
    }
    return out
  }

  /** The location's appointment-type id → name map, day-cached (see above).
   *  A failed fetch degrades to an empty map — visits import untyped rather
   *  than not at all — and doesn't poison the cache. */
  private async apptTypeNames(): Promise<Map<number, string>> {
    const key = `${this.env}:${this.subdomain}:${this.locationId}`
    const cached = apptTypeCache.get(key)
    if (cached && Date.now() - cached.fetchedAt < APPT_TYPE_CACHE_TTL_MS) return cached.names
    try {
      const types = await listAppointmentTypes(this.subdomain, this.locationId, this.reqOpts())
      const names = new Map<number, string>()
      for (const t of types) {
        if (t && typeof t.id === 'number' && t.name?.trim()) names.set(t.id, t.name.trim())
      }
      apptTypeCache.set(key, { fetchedAt: Date.now(), names })
      return names
    } catch (e) {
      console.warn('[pms/nexhealth] appointment_types fetch failed (visits import untyped):', e)
      return cached?.names ?? new Map()
    }
  }

  /** Physical chairs = active operatories. Called by the engine only while
   *  clinic_profile.chairCount is empty, so this is a handful of calls per
   *  clinic ever, not per sync. */
  async countChairs(): Promise<number | null> {
    await this.checkBudget()
    try {
      const ops = await listOperatories(this.subdomain, this.locationId, this.reqOpts())
      const active = ops.filter((o) => o && typeof o.id === 'number' && o.active !== false)
      return active.length > 0 ? active.length : null
    } catch (e) {
      console.warn('[pms/nexhealth] operatories fetch failed (chair count stays unknown):', e)
      return null
    }
  }

  async listRecalls(): Promise<NormalizedRecall[]> {
    // No /recalls resource in the Synchronizer API (probed: 404). Empty is
    // the honest answer — recall dates stay on our appointment-derived
    // heuristic for NexHealth-bridged offices.
    return []
  }

  /**
   * Create the patient in the PMS — only ever called by the write queue as
   * part of pushing a booking (ensurePatientExternalId). NexHealth REQUIRES
   * email + DOB + phone: a chart can't be minted without them, so the
   * refusal NAMES the missing fields (the front desk can fix the record)
   * instead of inventing data. `return_existing_if_match` makes this
   * dedupe-safe server-side — a matching chart comes back instead of a
   * duplicate.
   */
  async createPatient(payload: CreatePatientPayload): Promise<PmsWriteResult> {
    await this.checkBudget()
    const missing: string[] = []
    if (!payload.email?.trim()) missing.push('an email')
    if (!payload.dateOfBirth?.trim()) missing.push('a date of birth')
    if (!payload.phone?.trim()) missing.push('a phone number')
    if (missing.length > 0) {
      throw new Error(
        `Their practice system requires ${missing.join(', ')} to create a patient chart — add ${missing.length === 1 ? 'it' : 'them'} to the patient record and the push will retry on the next sync.`,
      )
    }
    const providerId = await this.anyProviderId()
    if (!providerId) {
      throw new PmsWriteWaitingError('No provider is synced from the practice system yet — retrying after the next sync.')
    }
    let data: { user?: NexPatient } | null
    try {
      data = await nexWrite<{ user?: NexPatient }>(
        'POST',
        'patients',
        { ...this.scope },
        {
          provider: { provider_id: providerId },
          patient: {
            first_name: payload.firstName,
            last_name: payload.lastName,
            email: payload.email,
            bio: { date_of_birth: payload.dateOfBirth, phone_number: payload.phone },
          },
          return_existing_if_match: true,
        },
        this.reqOpts(),
      )
    } catch (e) {
      // BELT under return_existing_if_match (LIVE-verified failure shape):
      // "A patient with that information already exists - id=NNN". The
      // error NAMES the existing chart — reusing it is exactly the dedupe
      // intent, and strictly safer than failing into a retry loop.
      const m = /already exists[^0-9]*id=(\d+)/i.exec(e instanceof Error ? e.message : '')
      if (m) return { externalId: m[1], raw: { id: Number(m[1]), recoveredFromDuplicateError: true } }
      throw e
    }
    const user = data?.user
    if (!user || typeof user.id !== 'number') {
      throw new Error('NexHealth accepted the patient but returned no id — nothing was linked.')
    }
    return { externalId: String(user.id), raw: { id: user.id } }
  }

  async createCommLog(_payload: CreateCommLogPayload): Promise<PmsWriteResult> {
    // NexHealth has no comm-log resource; call sites treat mirroring as
    // best-effort, so this typed refusal is marked skipped, never an error.
    throw new PmsWriteNotSupportedError('NexHealth does not support comm-log mirroring.')
  }

  /**
   * Push a DreamCRM booking into the practice's schedule — the single most
   * dangerous write in the product, so it goes out ONLY into a slot the
   * practice's OWN slot engine says is open:
   *
   *  1. Ask /appointment_slots for that provider + day, find the slot
   *     containing our start time, and take its operatory (required when
   *     the location maps by operatory — most Dentrix shops).
   *  2. No matching slot → REFUSE with the honest reason. Pushing an
   *     appointment into a time their PMS considers closed is exactly the
   *     client-scorching scenario; the front desk books it by hand instead.
   *  3. No appointment_type_id in v1 (typeless is legal; a wrong type for
   *     the operatory is refused by their server).
   *  4. notify_patient=false always — WE own patient comms.
   *
   * NexHealth's own server is the second net: it refuses double-books and
   * bad field pairs with readable errors the write-op log keeps verbatim.
   */
  async createAppointment(payload: CreateAppointmentPayload): Promise<PmsWriteResult> {
    await this.checkBudget()
    const providerExternal = payload.providerExternalId
      ? Number.parseInt(payload.providerExternalId, 10)
      : await this.anyProviderId()
    if (!providerExternal || !Number.isFinite(providerExternal)) {
      throw new PmsWriteWaitingError('No provider is synced from the practice system yet — retrying after the next sync.')
    }

    const startMs = payload.startTime.getTime()
    const day = payload.startTime.toISOString().slice(0, 10)
    const slots = await listAppointmentSlots(
      this.subdomain,
      this.locationId,
      providerExternal,
      day,
      2, // their day boundary is practice-local; 2 days covers the UTC skew
      this.reqOpts(),
    )
    const slot = slots.find((s) => {
      const t = s.time ? new Date(s.time).getTime() : NaN
      return Number.isFinite(t) && t === startMs
    })
    if (!slot) {
      throw new Error(
        'Their practice schedule doesn’t show this time as open, so I didn’t push the booking — the front desk should enter it by hand (or move it to an open time).',
      )
    }

    const end = payload.endTime ?? new Date(startMs + 30 * 60 * 1000)
    const note = (payload.note?.trim() || 'Booked online via DreamCRM').slice(0, 128)
    const data = await nexWrite<{ appt?: NexAppointment }>(
      'POST',
      'appointments',
      { ...this.scope, notify_patient: false },
      {
        appt: {
          patient_id: Number.parseInt(payload.patientExternalId, 10),
          provider_id: providerExternal,
          ...(slot.operatory_id != null ? { operatory_id: slot.operatory_id } : {}),
          start_time: payload.startTime.toISOString(),
          end_time: end.toISOString(),
          note,
        },
      },
      this.reqOpts(),
    )
    const appt = data?.appt
    if (!appt || typeof appt.id !== 'number') {
      throw new Error('NexHealth accepted the booking but returned no id — nothing was linked.')
    }
    return { externalId: String(appt.id), raw: { id: appt.id } }
  }

  /**
   * Status write-back. NexHealth's PATCH vocabulary is confirmed/cancelled
   * only — no_show and completed have no write path and are marked skipped.
   * CANCEL works even before the appointment reaches the PMS (verified on
   * the sandbox); a "not synced with the PMS" refusal is a WAITING state
   * (their server powers off nightly), never a burned attempt. Cancels skip
   * the daily budget on purpose: the #1 integration complaint is reminders
   * to already-cancelled patients, and a compliance-critical, bounded write
   * must not wait on a spend guardrail.
   */
  async updateAppointment(externalId: string, changes: AppointmentStatusChange): Promise<void> {
    if (changes.status !== 'cancelled') {
      throw new PmsWriteNotSupportedError(
        `NexHealth has no ${changes.status} write-back — the status stays in DreamCRM only.`,
      )
    }
    try {
      await nexWrite(
        'PATCH',
        `appointments/${encodeURIComponent(externalId)}`,
        { subdomain: this.subdomain },
        { appt: { cancelled: true } },
        this.reqOpts(),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/not synced with the PMS|live client/i.test(msg)) {
        throw new PmsWriteWaitingError(
          'Their practice system is offline or still syncing — the cancellation retries on the next sync.',
        )
      }
      throw e
    }
  }

  /** First active synced provider — the intake provider for patient writes
   *  when the booking carries none. */
  private async anyProviderId(): Promise<number | null> {
    const rows = await nexGetAll<NexProvider>('providers', this.scope, 'providers', this.reqOpts())
    const active = rows.find((p) => p && typeof p.id === 'number' && !p.inactive)
    return active ? active.id : null
  }
}
