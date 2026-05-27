import 'server-only'
import type {
  PmsProviderClient,
  PmsTestResult,
  PmsWriteResult,
  NormalizedPatient,
  NormalizedAppointment,
  NormalizedProvider,
  CreatePatientPayload,
  CreateAppointmentPayload,
} from './provider'

/**
 * Open Dental adapter — the one PMS with a truly open, self-serve API.
 *
 * Auth: `Authorization: ODFHIR {DeveloperKey}/{CustomerKey}`.
 *   - Developer Key  = platform-level secret (PMS_OPEN_DENTAL_DEVELOPER_KEY),
 *                      identifies DreamCRM as a registered developer.
 *   - Customer Key   = per-office, the clinic generates it in Open Dental and
 *                      pastes it in; stored AES-encrypted per org.
 *
 * Sanctioned + audit-clean: every read/write goes through the official API, so
 * writes land in the clinic's Open Dental Audit Trail. We never touch the DB
 * directly (the pattern Open Dental publicly warns its customers against).
 *
 * NOTE: like Stripe Connect, this can't be exercised against a live Open Dental
 * in CI — we have no instance + Open Dental charges the office $30/mo to enable
 * the API. The request/response shapes below follow Open Dental's published API
 * spec and are covered by unit tests with a mocked `fetch`; the live wire format
 * (esp. appointment Pattern/Op requirements) needs validation against a real
 * office before GA. The demo provider is what exercises the engine end-to-end.
 */

const DEFAULT_BASE_URL = 'https://api.opendental.com/api/v1'

export function openDentalConfigured(): boolean {
  return Boolean(process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY)
}

// Open Dental AptStatus enum → our appointment.status vocabulary.
function mapAptStatus(raw: unknown): NormalizedAppointment['status'] {
  const s = String(raw ?? '').toLowerCase()
  if (s === 'complete' || s === '2') return 'completed'
  if (s === 'broken' || s === '5') return 'cancelled'
  // Scheduled / ASAP / Planned / UnschedList all map to our 'scheduled'.
  return 'scheduled'
}

// Map an Open Dental provider Specialty/ProvType to our clinic_provider.role.
function mapProviderRole(specialty: unknown): string {
  const s = String(specialty ?? '').toLowerCase()
  if (s.includes('hygien')) return 'hygienist'
  if (s.includes('assist')) return 'assistant'
  if (s) return 'specialist'
  return 'dentist'
}

function dollarsToCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

// Open Dental wants 5-minute pattern chars ('X' = provider time). 30 min → 6.
function durationToPattern(start: Date, end: Date | null | undefined): string {
  const mins = end ? Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000)) : 30
  return 'X'.repeat(Math.max(1, Math.round(mins / 5)))
}

// Open Dental expects 'yyyy-MM-dd HH:mm:ss' local-ish datetimes.
function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface ODPatient {
  PatNum: number
  FName?: string
  LName?: string
  Birthdate?: string
  Email?: string
  WirelessPhone?: string
  HmPhone?: string
  Address?: string
  City?: string
  State?: string
  Zip?: string
  EstBalance?: number
}
interface ODAppointment {
  AptNum: number
  PatNum: number
  ProvNum?: number
  AptDateTime?: string
  AptStatus?: string | number
  Pattern?: string
  Note?: string
}
interface ODProvider {
  ProvNum: number
  FName?: string
  LName?: string
  Specialty?: string
}

export class OpenDentalProvider implements PmsProviderClient {
  readonly id = 'open_dental' as const
  private baseUrl: string
  private authHeader: string

  constructor(customerKey: string) {
    const devKey = process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY
    if (!devKey) throw new Error('PMS_OPEN_DENTAL_DEVELOPER_KEY is not set')
    this.baseUrl = (process.env.PMS_OPEN_DENTAL_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.authHeader = `ODFHIR ${devKey}/${customerKey}`
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Open Dental ${method} ${path} → ${res.status} ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  }

  async testConnection(): Promise<PmsTestResult> {
    try {
      // /practice is a cheap, always-present resource that confirms auth +
      // eConnector reachability in one call.
      const data = await this.req<Record<string, unknown> | Array<Record<string, unknown>>>('GET', '/practice')
      const row = Array.isArray(data) ? data[0] : data
      return {
        ok: true,
        practiceTitle: (row?.PracticeTitle as string) || undefined,
        eConnectorReachable: true,
        scopeNote: 'Read + write via the official API (logged in your Audit Trail)',
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async listProviders(): Promise<NormalizedProvider[]> {
    const rows = await this.req<ODProvider[]>('GET', '/providers')
    return (rows || []).map((p) => ({
      externalId: String(p.ProvNum),
      displayName: [p.FName, p.LName].filter(Boolean).join(' ').trim() || `Provider ${p.ProvNum}`,
      role: mapProviderRole(p.Specialty),
    }))
  }

  async listPatients(): Promise<NormalizedPatient[]> {
    // The office's full active patient list. Open Dental paginates via
    // Offset/Limit; v1 pulls the first large page (pagination is a v1.1
    // refinement once validated against a live office).
    const rows = await this.req<ODPatient[]>('GET', '/patients?Limit=5000')
    return (rows || []).map((p) => ({
      externalId: String(p.PatNum),
      firstName: p.FName?.trim() || '',
      lastName: p.LName?.trim() || '',
      dateOfBirth: p.Birthdate ? String(p.Birthdate).slice(0, 10) : null,
      email: p.Email?.trim() || null,
      phone: p.WirelessPhone?.trim() || p.HmPhone?.trim() || null,
      addressLine1: p.Address?.trim() || null,
      city: p.City?.trim() || null,
      state: p.State?.trim() || null,
      postalCode: p.Zip?.trim() || null,
      balanceCents: dollarsToCents(p.EstBalance),
    }))
  }

  async listAppointments(opts?: { since?: Date }): Promise<NormalizedAppointment[]> {
    const from = opts?.since ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    const to = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    const rows = await this.req<ODAppointment[]>(
      'GET',
      `/appointments?dateStart=${fmtDate(from)}&dateEnd=${fmtDate(to)}`,
    )
    return (rows || [])
      .filter((a) => a.AptDateTime)
      .map((a) => {
        const start = new Date(String(a.AptDateTime).replace(' ', 'T'))
        // Derive end from the 5-min Pattern length when present.
        const patternMins = a.Pattern ? a.Pattern.length * 5 : 30
        return {
          externalId: String(a.AptNum),
          patientExternalId: String(a.PatNum),
          providerExternalId: a.ProvNum ? String(a.ProvNum) : null,
          startTime: start,
          endTime: new Date(start.getTime() + patternMins * 60000),
          status: mapAptStatus(a.AptStatus),
          note: a.Note?.trim() || null,
        }
      })
  }

  async createPatient(payload: CreatePatientPayload): Promise<PmsWriteResult> {
    const body: Record<string, unknown> = {
      LName: payload.lastName,
      FName: payload.firstName,
    }
    if (payload.email) body.Email = payload.email
    if (payload.phone) body.WirelessPhone = payload.phone
    if (payload.dateOfBirth) body.Birthdate = payload.dateOfBirth
    const res = await this.req<{ PatNum: number }>('POST', '/patients', body)
    return { externalId: String(res.PatNum), raw: res as unknown as Record<string, unknown> }
  }

  async createAppointment(payload: CreateAppointmentPayload): Promise<PmsWriteResult> {
    const body: Record<string, unknown> = {
      PatNum: Number(payload.patientExternalId),
      AptDateTime: fmtDateTime(payload.startTime),
      AptStatus: 'Scheduled',
      Pattern: durationToPattern(payload.startTime, payload.endTime),
    }
    if (payload.providerExternalId) body.ProvNum = Number(payload.providerExternalId)
    if (payload.note) body.Note = payload.note
    const res = await this.req<{ AptNum: number }>('POST', '/appointments', body)
    return { externalId: String(res.AptNum), raw: res as unknown as Record<string, unknown> }
  }
}
