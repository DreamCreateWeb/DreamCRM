import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { emailDomainFor, type EmailDomainStatus } from '@/lib/email-identity'
import { EMAIL_DOMAIN_BACKOFF_AFTER, EMAIL_DOMAIN_BACKOFF_MS, isBackedOff } from '@/lib/email-domain-backoff'
import { reportAutomationFailure } from '@/lib/services/engine-failures'

/**
 * Tier 3 sender identity (ML-63): patient email from the practice's own domain.
 *
 * Once the custom domain is ACTIVE the clinic may ask to "Send email from your
 * domain". We register the bare domain with Resend, store the DNS rows Resend
 * wants (SPF / DKIM / return-path — NEVER the receiving MX: replies keep
 * routing through the platform's inbound domain), and the custom-domains
 * sweep (`sweepPendingEmailDomains`, called from `sweepPendingCustomDomains`)
 * asks Resend to verify until it says so. `lib/services/clinic-sender.ts`
 * switches the From only when `email_domain_status = 'verified'`.
 *
 * The Resend client is built inside each call (lazy — `next build` is keyless)
 * and the key is never logged.
 */

export interface EmailDomainRecord {
  /** Resend's label: 'SPF' | 'DKIM' | 'ReturnPath' … */
  purpose: string
  type: string
  /** Host relative to the domain's zone — what registrars want in "Host". */
  host: string
  /** Full record name. */
  name: string
  value: string
  /** What Resend last saw at that name, when it reports one (expected vs found). */
  found?: string
  priority?: number
  /** Resend's per-record state: 'verified' | 'pending' | 'not_started' | 'failed'. */
  status: string
}

export interface EmailDomainState {
  domain: string
  status: EmailDomainStatus
  records: EmailDomainRecord[]
  checkedAt: string | null
  verifiedAt: string | null
  /** Consecutive failed checks (3+ -> the sweep backs off to daily). */
  failedChecks?: number
}

export type EmailDomainResult = { ok: true; state: EmailDomainState } | { ok: false; error: string }

/** The slice of the Resend SDK this service touches (injectable for tests). */
export interface ResendDomainsClient {
  domains: {
    create: (p: { name: string }) => Promise<{ data: unknown; error: { message?: string } | null }>
    verify: (id: string) => Promise<{ data?: unknown; error: { message?: string } | null }>
    get: (id: string) => Promise<{ data: unknown; error: { message?: string; statusCode?: number | null; name?: string } | null }>
    remove: (id: string) => Promise<{ data?: unknown; error: { message?: string; statusCode?: number | null; name?: string } | null }>
  }
}

let clientOverride: (() => ResendDomainsClient) | null = null
/** Test seam — never used in product code. */
export function __setResendDomainsClient(f: (() => ResendDomainsClient) | null) {
  clientOverride = f
}

function client(): ResendDomainsClient {
  if (clientOverride) return clientOverride()
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY env var is not set')
  return new Resend(key) as unknown as ResendDomainsClient
}

/** Pure: Resend's domain status → ours. 'temporary_failure' keeps trying. */
export function mapResendStatus(s: unknown): EmailDomainStatus {
  if (s === 'verified') return 'verified'
  if (s === 'failed') return 'failed'
  return 'pending'
}

/** Pure: Resend's record rows → the card's rows. Receiving MX rows are dropped
 *  by law (we never ask the practice to move its MX). Missing rows stay
 *  honest: a record Resend did not return is simply absent. */
export function normalizeRecords(domain: string, raw: unknown): EmailDomainRecord[] {
  if (!Array.isArray(raw)) return []
  const out: EmailDomainRecord[] = []
  for (const r of raw as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue
    const purpose = typeof r.record === 'string' ? r.record : 'DNS'
    if (/^receiving$/i.test(purpose)) continue
    const type = typeof r.type === 'string' ? r.type.toUpperCase() : ''
    const value = typeof r.value === 'string' ? r.value : ''
    const rel = typeof r.name === 'string' && r.name ? r.name : '@'
    if (!type || !value) continue
    const rec: EmailDomainRecord = {
      purpose,
      type,
      host: rel,
      name: rel === '@' ? domain : rel.endsWith(domain) ? rel : `${rel}.${domain}`,
      value,
      status: typeof r.status === 'string' ? r.status : 'not_started',
    }
    const found = r.found_value ?? r.current_value ?? r.found
    if (typeof found === 'string' && found) rec.found = found
    if (typeof r.priority === 'number') rec.priority = r.priority
    out.push(rec)
  }
  return out
}

const COLS = {
  id: clinicProfile.emailDomainId,
  name: clinicProfile.emailDomainName,
  status: clinicProfile.emailDomainStatus,
  records: clinicProfile.emailDomainRecords,
  checkedAt: clinicProfile.emailDomainCheckedAt,
  verifiedAt: clinicProfile.emailDomainVerifiedAt,
  failedChecks: clinicProfile.emailDomainFailedChecks,
}

export { EMAIL_DOMAIN_BACKOFF_AFTER, EMAIL_DOMAIN_BACKOFF_MS, isBackedOff }

/** Pure: Resend says the domain id no longer exists. */
export function isDomainGone(e: { message?: string; statusCode?: number | null; name?: string } | null | undefined): boolean {
  if (!e) return false
  return e.statusCode === 404 || e.name === 'not_found' || /not[ _]found|does not exist/i.test(e.message ?? '')
}

function toState(r: {
  name: string | null
  status: string | null
  records: unknown
  checkedAt: Date | null
  verifiedAt: Date | null
  failedChecks?: number | null
}): EmailDomainState | null {
  if (!r.name || !r.status) return null
  return {
    domain: r.name,
    status: mapResendStatus(r.status),
    records: Array.isArray(r.records) ? (r.records as EmailDomainRecord[]) : [],
    checkedAt: r.checkedAt ? r.checkedAt.toISOString() : null,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    failedChecks: r.failedChecks ?? 0,
  }
}

/** The card's read (`emailDomainRecords` included): null = never requested. */
export async function getEmailDomainState(orgId: string): Promise<EmailDomainState | null> {
  const [row] = await db
    .select(COLS)
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  return row ? toState(row) : null
}

/** The records the practice still has to add (everything Resend has not
 *  verified) — what the card leads with. */
export async function emailDomainRecords(orgId: string): Promise<EmailDomainRecord[]> {
  const s = await getEmailDomainState(orgId)
  return s ? s.records : []
}

function errMessage(e: { message?: string } | null | undefined): string {
  return (e?.message || 'Resend could not complete that just now.').slice(0, 200)
}

/**
 * Register the clinic's domain with Resend. Needs an ACTIVE custom domain.
 * Idempotent: a second call for the same domain returns the stored state and
 * never creates a second Resend domain.
 */
export async function requestEmailDomain(orgId: string): Promise<EmailDomainResult> {
  const [profile] = await db
    .select({
      websiteDomain: clinicProfile.websiteDomain,
      customDomainStatus: clinicProfile.customDomainStatus,
      ...COLS,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (!profile) return { ok: false, error: 'Clinic profile not found.' }
  const cd = profile.customDomainStatus as { state?: string } | null
  const domain = emailDomainFor(profile.websiteDomain)
  if (cd?.state !== 'active' || !domain) {
    return { ok: false, error: 'Your website needs to be live on your own domain first.' }
  }
  if (profile.id && profile.name === domain && profile.status && profile.status !== 'failed') {
    const existing = toState(profile)
    if (existing) return { ok: true, state: existing }
  }
  // A FAILED domain is retried on the SAME Resend domain (verify + get), never
  // registered twice. Only "Resend no longer has it" falls through to create.
  if (profile.id && profile.name === domain && profile.status === 'failed') {
    try {
      const retried = await verifyAndStamp(
        orgId,
        {
          id: profile.id,
          name: domain,
          status: profile.status,
          records: profile.records,
          verifiedAt: profile.verifiedAt,
          failedChecks: profile.failedChecks,
        },
        true,
      )
      if (retried) return retried
    } catch (err) {
      console.warn('[email-domain] retry failed', (err as Error)?.message)
      return { ok: false, error: 'We couldn’t reach our email provider just now. Try again in a minute.' }
    }
  }
  let res: Awaited<ReturnType<ResendDomainsClient['domains']['create']>>
  try {
    res = await client().domains.create({ name: domain })
  } catch (err) {
    console.warn('[email-domain] create failed', (err as Error)?.message)
    return { ok: false, error: 'We couldn’t reach our email provider just now. Try again in a minute.' }
  }
  const data = res.data as { id?: string; status?: string; records?: unknown } | null
  if (res.error || !data?.id) {
    return { ok: false, error: errMessage(res.error) }
  }
  const now = new Date()
  const status = mapResendStatus(data.status)
  const records = normalizeRecords(domain, data.records)
  await db
    .update(clinicProfile)
    .set({
      emailDomainId: data.id,
      emailDomainName: domain,
      emailDomainStatus: status,
      emailDomainRecords: records,
      emailDomainCheckedAt: now,
      emailDomainVerifiedAt: status === 'verified' ? now : null,
      emailDomainFailedChecks: status === 'failed' ? 1 : 0,
    })
    .where(eq(clinicProfile.organizationId, orgId))
  return {
    ok: true,
    state: {
      domain,
      status,
      records,
      checkedAt: now.toISOString(),
      verifiedAt: status === 'verified' ? now.toISOString() : null,
      failedChecks: status === 'failed' ? 1 : 0,
    },
  }
}

interface StoredDomain {
  id: string
  name: string
  status: string | null
  records: unknown
  verifiedAt: Date | null
  failedChecks?: number | null
}

/**
 * verify() starts Resend's check; get() is the verdict. Returns null only when
 * `nullIfGone` and Resend says the domain no longer exists (the caller then
 * registers afresh); otherwise a missing domain throws like any Resend error.
 */
async function verifyAndStamp(
  orgId: string,
  row: StoredDomain,
  nullIfGone = false,
): Promise<EmailDomainResult | null> {
  const c = client()
  // A verify error is not fatal — the record state below is still worth reading.
  await c.domains.verify(row.id).catch(() => null)
  const res = await c.domains.get(row.id)
  if (nullIfGone && isDomainGone(res.error)) return null
  const data = res.data as { status?: string; records?: unknown } | null
  if (res.error || !data) throw new Error(errMessage(res.error))
  const now = new Date()
  const status = mapResendStatus(data.status)
  const records = normalizeRecords(row.name, data.records)
  const kept = records.length ? records : Array.isArray(row.records) ? (row.records as EmailDomainRecord[]) : []
  const wasVerified = row.status === 'verified'
  const failedChecks = status === 'failed' ? (row.failedChecks ?? 0) + 1 : 0
  await db
    .update(clinicProfile)
    .set({
      emailDomainStatus: status,
      emailDomainRecords: kept,
      emailDomainCheckedAt: now,
      emailDomainFailedChecks: failedChecks,
      ...(status === 'verified' && !wasVerified ? { emailDomainVerifiedAt: now } : {}),
    })
    .where(and(eq(clinicProfile.organizationId, orgId), eq(clinicProfile.emailDomainId, row.id)))
  return {
    ok: true,
    state: {
      domain: row.name,
      status,
      records: kept,
      checkedAt: now.toISOString(),
      verifiedAt:
        status === 'verified' ? (wasVerified && row.verifiedAt ? row.verifiedAt : now).toISOString() : null,
      failedChecks,
    },
  }
}

/** Ask Resend to verify, read the verdict back, stamp it. Tenant-scoped. */
export async function checkEmailDomain(orgId: string): Promise<EmailDomainResult> {
  const [row] = await db
    .select(COLS)
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (!row?.id || !row.name) return { ok: false, error: 'Email from your domain has not been set up yet.' }
  return (await verifyAndStamp(orgId, { ...row, id: row.id, name: row.name }))!
}

const CLEARED = {
  emailDomainId: null,
  emailDomainName: null,
  emailDomainStatus: null,
  emailDomainRecords: null,
  emailDomainCheckedAt: null,
  emailDomainVerifiedAt: null,
  emailDomainFailedChecks: 0,
}

/**
 * Removal cleanup: delete the Resend domain and clear the six `email_domain_*`
 * columns (+ the failure counter) so the Tier 3 sender can never point at a
 * dead domain. Fail-open: a Resend error is one strike under `custom_domain`
 * and the columns are cleared anyway. When `keepIfName` matches the stored
 * domain nothing happens (a re-connect of the same apex keeps its identity).
 */
export async function removeEmailDomain(orgId: string, opts: { keepIfName?: string | null } = {}): Promise<void> {
  const [row] = await db
    .select({ id: COLS.id, name: COLS.name })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (!row || (!row.id && !row.name)) return
  if (opts.keepIfName && row.name === opts.keepIfName) return
  if (row.id) {
    try {
      const res = await client().domains.remove(row.id)
      if (res?.error && !isDomainGone(res.error)) throw new Error(errMessage(res.error))
    } catch (err) {
      console.warn('[email-domain] remove failed (clearing anyway):', (err as Error)?.message)
      await reportAutomationFailure(orgId, 'custom_domain', new Date())
    }
  }
  await db.update(clinicProfile).set(CLEARED).where(eq(clinicProfile.organizationId, orgId))
}

export interface EmailDomainSweepResult {
  pending: number
  checked: number
  verified: number
  errors: string[]
}

export const EMAIL_DOMAIN_SWEEP_MAX = 50

/**
 * The email half of the custom-domains sweep (NO new cron). Pending rows on
 * real, live clinics, oldest-checked first; one tenant's throw is reported
 * under the `custom_domain` producer (one strike per clinic per day) and the
 * walk carries on.
 */
export async function sweepPendingEmailDomains(
  opts: { now?: Date; max?: number; check?: (orgId: string) => Promise<EmailDomainResult> } = {},
): Promise<EmailDomainSweepResult> {
  const now = opts.now ?? new Date()
  const check = opts.check ?? checkEmailDomain
  const result: EmailDomainSweepResult = { pending: 0, checked: 0, verified: 0, errors: [] }
  const rows = await db
    .select({
      organizationId: clinicProfile.organizationId,
      checkedAt: clinicProfile.emailDomainCheckedAt,
      failedChecks: clinicProfile.emailDomainFailedChecks,
    })
    .from(clinicProfile)
    .innerJoin(organization, eq(organization.id, clinicProfile.organizationId))
    .where(
      and(
        eq(organization.type, 'clinic'),
        eq(organization.isDemo, false),
        inArray(clinicProfile.emailDomainStatus, ['pending', 'failed']),
        sql`${clinicProfile.emailDomainId} is not null`,
      ),
    )
  if (!Array.isArray(rows) || rows.length === 0) return result
  const { listShutDownOrgIds } = await import('./billing-state')
  const shutDown = await listShutDownOrgIds(now)
  const live = rows
    .filter((r) => r?.organizationId && !shutDown.has(r.organizationId))
    // After 3 failed checks a domain is asked once a day, not every tick.
    .filter(
      (r) => !isBackedOff(r.failedChecks) || !r.checkedAt || now.getTime() - r.checkedAt.getTime() >= EMAIL_DOMAIN_BACKOFF_MS,
    )
    .sort((a, b) => (a.checkedAt?.getTime() ?? -Infinity) - (b.checkedAt?.getTime() ?? -Infinity))
  result.pending = live.length
  for (const row of live.slice(0, opts.max ?? EMAIL_DOMAIN_SWEEP_MAX)) {
    try {
      const res = await check(row.organizationId)
      if (!res.ok) continue
      result.checked += 1
      if (res.state.status === 'verified') result.verified += 1
    } catch (err) {
      result.errors.push(row.organizationId)
      console.warn('[email-domain] sweep: check failed for', row.organizationId, (err as Error)?.message)
      await reportAutomationFailure(row.organizationId, 'custom_domain', now)
    }
  }
  return result
}
