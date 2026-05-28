import 'server-only'
import { formatOdDateTime, parseOdDateTime } from './datetime'
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
  AppointmentStatusChange,
} from './provider'

/**
 * Open Dental adapter — the one PMS with a truly open, self-serve API.
 *
 * Auth: `Authorization: ODFHIR {DeveloperKey}/{CustomerKey}`.
 *   - Developer Key  = platform-level secret (PMS_OPEN_DENTAL_DEVELOPER_KEY).
 *   - Customer Key   = per-office, pasted by the clinic, stored AES-encrypted.
 *
 * Sanctioned + audit-clean: every read/write goes through the official API, so
 * writes land in the clinic's Open Dental Audit Trail — never the DB directly.
 *
 * VALIDATED against Open Dental's hosted developer sandbox (shared test DB):
 * read shapes (patients via /patients/Simple incl. EstBalance, appointments,
 * providers, operatories, schedules), the DateTStamp delta + Offset/Limit
 * pagination, and writes (createPatient; createAppointment which REQUIRES an
 * Op/operatory). Still unit-tested with a mocked `fetch`; the demo provider
 * exercises the engine end-to-end. Note OD also supports sanctioned webhook
 * Subscriptions (POST /subscriptions) for near-real-time — a Phase 2 add-on
 * that needs an office-side service; this adapter is the Phase 1 polling path.
 */

const DEFAULT_BASE_URL = 'https://api.opendental.com/api/v1'
const PAGE = 1000 // Remote API caps pages ~1000 elements; loop with Offset.

export function openDentalConfigured(): boolean {
  return Boolean(process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY)
}

// Open Dental AptStatus → our appointment.status vocabulary.
function mapAptStatus(raw: unknown): NormalizedAppointment['status'] {
  const s = String(raw ?? '').toLowerCase()
  if (s === 'complete' || s === '2') return 'completed'
  if (s === 'broken' || s === '5') return 'cancelled'
  return 'scheduled'
}

// Our status → Open Dental AptStatus for write-back. cancelled + no_show both
// become a "Broken" appointment (OD's representation); completed → Complete.
function statusToAptStatus(status: AppointmentStatusChange['status']): string {
  return status === 'completed' ? 'Complete' : 'Broken'
}

function dollarsToCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

// 5-minute pattern chars ('X' = provider time). 30 min → 6.
function durationToPattern(start: Date, end: Date | null | undefined): string {
  const mins = end ? Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000)) : 30
  return 'X'.repeat(Math.max(1, Math.round(mins / 5)))
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
}
interface ODRecall {
  RecallNum: number
  PatNum: number
  DateDue?: string
  DatePrevious?: string
  RecallInterval?: string
  IsDisabled?: string | boolean
}

// OD uses '0001-01-01' as its no-date sentinel; map to null.
function parseRecallDate(s: string | undefined): Date | null {
  if (!s) return null
  if (s.startsWith('0001-')) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
}
interface ODOperatory {
  OperatoryNum: number
  OpName?: string
  Abbrev?: string
  IsHidden?: string | boolean
  IsWebSched?: string | boolean
}

export interface OdOperatory {
  num: number
  name: string
  isWebSched: boolean
  isHidden: boolean
}

export interface OpenDentalOptions {
  /** Office IANA timezone (AptDateTime is office-local wall-clock, no TZ). */
  timeZone?: string
  /** Operatory to book DreamCRM-originated appointments into (Op is required). */
  defaultOperatoryNum?: number
}

const DEFAULT_TZ = 'America/New_York'

export class OpenDentalProvider implements PmsProviderClient {
  readonly id = 'open_dental' as const
  private baseUrl: string
  private authHeader: string
  private timeZone: string
  private defaultOperatoryNum: number | undefined

  constructor(customerKey: string, opts?: OpenDentalOptions) {
    const devKey = process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY
    if (!devKey) throw new Error('PMS_OPEN_DENTAL_DEVELOPER_KEY is not set')
    this.baseUrl = (process.env.PMS_OPEN_DENTAL_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.authHeader = `ODFHIR ${devKey}/${customerKey}`
    this.timeZone = opts?.timeZone || DEFAULT_TZ
    this.defaultOperatoryNum = opts?.defaultOperatoryNum
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

  // Paginated GET via Offset/Limit. Stops on a short page; guards against an
  // ignored Offset (page repeats) and runaway loops.
  private async getAll<T extends Record<string, unknown>>(path: string, idKey: string): Promise<T[]> {
    const out: T[] = []
    let offset = 0
    let lastFirstId: unknown
    for (let i = 0; i < 200; i++) {
      const sep = path.includes('?') ? '&' : '?'
      const page = await this.req<T[]>('GET', `${path}${sep}Limit=${PAGE}&Offset=${offset}`)
      if (!page || page.length === 0) break
      const firstId = page[0]?.[idKey]
      if (firstId !== undefined && firstId === lastFirstId) break // Offset not honored
      lastFirstId = firstId
      out.push(...page)
      if (page.length < PAGE) break
      offset += PAGE
    }
    return out
  }

  async testConnection(): Promise<PmsTestResult> {
    try {
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

  async listOperatories(): Promise<OdOperatory[]> {
    const rows = await this.req<ODOperatory[]>('GET', '/operatories')
    return (rows || []).map((o) => ({
      num: o.OperatoryNum,
      name: o.OpName || o.Abbrev || `Operatory ${o.OperatoryNum}`,
      isWebSched: String(o.IsWebSched) === 'true',
      isHidden: String(o.IsHidden) === 'true',
    }))
  }

  async listProviders(): Promise<NormalizedProvider[]> {
    const rows = await this.req<ODProvider[]>('GET', '/providers')
    return (rows || []).map((p) => ({
      externalId: String(p.ProvNum),
      displayName: [p.FName, p.LName].filter(Boolean).join(' ').trim() || `Provider ${p.ProvNum}`,
      // OD's Specialty is an office-specific numeric DefNum, not a label, so we
      // can't portably derive a role from it. role is a cosmetic agenda label
      // ("Cleaning with …") — default to 'dentist'; refining hygienist/etc. via
      // operatory ProvHygienist or /definitions is a later nicety.
      role: 'dentist',
    }))
  }

  async listPatients(): Promise<NormalizedPatient[]> {
    // /patients/Simple carries EstBalance inline (the plain /patients list does
    // NOT) and supports Offset/Limit — so one paginated pass gets profile +
    // balance. No DateTStamp filter exists on patients, so this is a full pull;
    // the engine's content-hash skip means unchanged rows don't re-write.
    const rows = await this.getAll<ODPatient & Record<string, unknown>>('/patients/Simple', 'PatNum')
    return rows.map((p) => ({
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
    // Incremental "changed-since" via DateTStamp (office-local wall-clock).
    // First sync (no high-water) bounds to the last year so we don't pull
    // ancient history; future appts still come in (their DateTStamp is recent).
    const since = opts?.since ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    const dt = encodeURIComponent(formatOdDateTime(since, this.timeZone))
    const rows = await this.getAll<ODAppointment & Record<string, unknown>>(`/appointments?DateTStamp=${dt}`, 'AptNum')
    return rows
      .filter((a) => a.AptDateTime)
      .map((a) => {
        const start = parseOdDateTime(String(a.AptDateTime), this.timeZone)
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

  async listRecalls(): Promise<NormalizedRecall[]> {
    // /recalls doesn't honor DateTStamp — full paginated pull; the engine's
    // per-patient upsert is cheap (one UPDATE per patient with a real due date).
    const rows = await this.getAll<ODRecall & Record<string, unknown>>('/recalls', 'RecallNum')
    return rows.map((r) => ({
      externalId: String(r.RecallNum),
      patientExternalId: String(r.PatNum),
      dueDate: parseRecallDate(r.DateDue),
      previousDate: parseRecallDate(r.DatePrevious),
      interval: r.RecallInterval?.trim() || null,
      isDisabled: String(r.IsDisabled) === 'true',
    }))
  }

  async createPatient(payload: CreatePatientPayload): Promise<PmsWriteResult> {
    const body: Record<string, unknown> = { LName: payload.lastName, FName: payload.firstName }
    if (payload.email) body.Email = payload.email
    if (payload.phone) body.WirelessPhone = payload.phone
    if (payload.dateOfBirth) body.Birthdate = payload.dateOfBirth // date, not datetime — no TZ
    const res = await this.req<{ PatNum: number }>('POST', '/patients', body)
    return { externalId: String(res.PatNum), raw: res as unknown as Record<string, unknown> }
  }

  async createAppointment(payload: CreateAppointmentPayload): Promise<PmsWriteResult> {
    if (this.defaultOperatoryNum == null) {
      throw new Error('No operatory configured for write-back — set a default operatory in Integrations settings.')
    }
    const body: Record<string, unknown> = {
      PatNum: Number(payload.patientExternalId),
      AptDateTime: formatOdDateTime(payload.startTime, this.timeZone),
      AptStatus: 'Scheduled',
      Op: this.defaultOperatoryNum,
      Pattern: durationToPattern(payload.startTime, payload.endTime),
    }
    if (payload.providerExternalId) body.ProvNum = Number(payload.providerExternalId)
    if (payload.note) body.Note = payload.note
    const res = await this.req<{ AptNum: number }>('POST', '/appointments', body)
    return { externalId: String(res.AptNum), raw: res as unknown as Record<string, unknown> }
  }

  // Push a status change (cancellation/no-show) to an existing OD appointment.
  // Verified: PUT /appointments/{AptNum} { AptStatus: 'Broken' } → 200.
  async updateAppointment(externalId: string, changes: AppointmentStatusChange): Promise<void> {
    const body: Record<string, unknown> = {}
    if (changes.status) body.AptStatus = statusToAptStatus(changes.status)
    if (Object.keys(body).length === 0) return
    await this.req('PUT', `/appointments/${encodeURIComponent(externalId)}`, body)
  }
}
