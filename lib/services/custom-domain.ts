import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'

/**
 * Custom domains v1.
 *
 * A clinic can point its OWN domain (e.g. `www.smilebright.com`) at its
 * DreamCRM public site. The flow:
 *   1. clinic enters the host → `requestCustomDomain` calls App Runner's
 *      `AssociateCustomDomain`, which returns the routing target (the App
 *      Runner default hostname) + the ACM certificate-validation CNAMEs. We
 *      persist those as `dnsRecords` on `clinic_profile.custom_domain_status`
 *      and write the host onto `websiteDomain`.
 *   2. the clinic adds the CNAMEs at their registrar.
 *   3. `checkCustomDomainStatus` polls `DescribeCustomDomains` until App Runner
 *      reports ACTIVE → we flip the stored state to `active`.
 *   4. `removeCustomDomain` calls `DisassociateCustomDomain` + clears the
 *      `websiteDomain` / status.
 *
 * Graceful degradation is a hard requirement: every AWS call is wrapped, and
 * when it can't run (missing IAM permission, missing `APP_RUNNER_SERVICE_ARN`,
 * or any SDK error) we STILL persist `{ state:'pending_dns', error:'manual' }`
 * + the domain, and render placeholder validation records, so the clinic gets
 * actionable instructions instead of a thrown error. An operator finishes the
 * association by hand (`aws apprunner associate-custom-domain …`) — see
 * `docs/custom-domains.md`.
 *
 * The AWS SDK is dynamically imported so it never loads on a code path that
 * doesn't touch a custom domain (and so the module is cheap to import in tests
 * that mock it).
 */

export type CustomDomainState = 'pending_dns' | 'active' | 'failed'

export type DnsRecordPurpose = 'routing' | 'certificate'

export interface CustomDomainDnsRecord {
  name: string
  type: string
  value: string
  purpose: DnsRecordPurpose
}

export interface CustomDomainStatus {
  state: CustomDomainState
  domain: string
  requestedAt: string
  dnsRecords: CustomDomainDnsRecord[]
  lastCheckedAt?: string
  /** 'manual' when AWS couldn't run and an operator must finish provisioning. */
  error?: string
}

export type CustomDomainResult =
  | { ok: true; status: CustomDomainStatus }
  | { ok: false; error: string }

// The App Runner service's default hostname — the CNAME target the clinic's
// `www` record points at. We read it live from the AssociateCustomDomain
// response (`DNSTarget`); this env is the fallback when AWS can't run.
const APP_RUNNER_DEFAULT_HOST =
  process.env.APP_RUNNER_DEFAULT_HOST?.trim() ||
  'hq7ygyvjdp.us-east-1.awsapprunner.com'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Normalize + validate a candidate custom domain.
 *
 * We require a `www.` or other subdomain host (at least 3 labels), NOT a bare
 * apex — a bare apex can't CNAME to App Runner (the same reason our own apex
 * uses a redirect), so accepting one would create a domain that silently never
 * resolves. We reject anything on the platform's own domain (those are served
 * by the wildcard subdomain path, not a custom domain).
 */
export function validateCustomDomain(
  raw: string,
): { ok: true; domain: string } | { ok: false; error: string } {
  let host = (raw ?? '').trim().toLowerCase()
  if (!host) return { ok: false, error: 'Enter a domain.' }
  // Tolerate a pasted URL.
  host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
  // Strip a leading wildcard if pasted.
  host = host.replace(/^\*\./, '')

  if (host.includes(' ') || host.includes('/')) {
    return { ok: false, error: 'That doesn’t look like a domain.' }
  }
  // Basic hostname shape: labels of letters/digits/hyphens, dot-separated.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return { ok: false, error: 'That doesn’t look like a valid domain.' }
  }
  if (host === SITE_DOMAIN || host.endsWith(`.${SITE_DOMAIN}`)) {
    return {
      ok: false,
      error: `${SITE_DOMAIN} subdomains are handled automatically — enter your own domain instead.`,
    }
  }
  const labels = host.split('.')
  // Require a subdomain (≥3 labels, e.g. www.example.com). A 2-label apex is
  // rejected with an explanation.
  if (labels.length < 3) {
    return {
      ok: false,
      error:
        'Use a subdomain like “www.” — a bare domain (example.com) can’t point at us with a CNAME. Set your apex to redirect to the www host at your registrar.',
    }
  }
  return { ok: true, domain: host }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function routingRecord(host: string, target: string): CustomDomainDnsRecord {
  return { name: host, type: 'CNAME', value: target, purpose: 'routing' }
}

/** Placeholder certificate record used in the manual-fallback path. */
function placeholderCertRecord(host: string): CustomDomainDnsRecord {
  return {
    name: `_acme-challenge.${host}`,
    type: 'CNAME',
    value: '(pending — we’ll fill this in once provisioning starts)',
    purpose: 'certificate',
  }
}

async function getStatus(orgId: string): Promise<CustomDomainStatus | null> {
  const [profile] = await db
    .select({
      websiteDomain: clinicProfile.websiteDomain,
      customDomainStatus: clinicProfile.customDomainStatus,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (!profile) return null
  const raw = profile.customDomainStatus as CustomDomainStatus | null
  if (!raw || typeof raw !== 'object') return null
  return raw
}

/** Read the current custom-domain status for a clinic (null = none configured). */
export async function getCustomDomainStatus(orgId: string): Promise<CustomDomainStatus | null> {
  return getStatus(orgId)
}

async function persist(orgId: string, status: CustomDomainStatus): Promise<void> {
  await db
    .update(clinicProfile)
    .set({ websiteDomain: status.domain, customDomainStatus: status })
    .where(eq(clinicProfile.organizationId, orgId))
}

/**
 * Build the App Runner client. Returns null when the service ARN env is unset,
 * so callers fall into the manual path. Credentials come from the default
 * provider chain (the App Runner instance role in prod, env/SSO locally).
 */
async function appRunnerClient(): Promise<{
  client: import('@aws-sdk/client-apprunner').AppRunnerClient
  serviceArn: string
} | null> {
  const serviceArn = process.env.APP_RUNNER_SERVICE_ARN?.trim()
  if (!serviceArn) return null
  const { AppRunnerClient } = await import('@aws-sdk/client-apprunner')
  return { client: new AppRunnerClient({ region: AWS_REGION }), serviceArn }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Request a custom domain for a clinic. Validates the host, calls App Runner
 * `AssociateCustomDomain`, and persists the routing + certificate DNS records
 * the clinic must add. Degrades to a manual-instructions state on any AWS
 * failure (never throws at the clinic).
 */
export async function requestCustomDomain(
  orgId: string,
  domain: string,
): Promise<CustomDomainResult> {
  const v = validateCustomDomain(domain)
  if (!v.ok) return { ok: false, error: v.error }
  const host = v.domain
  const now = new Date().toISOString()

  const manualStatus: CustomDomainStatus = {
    state: 'pending_dns',
    domain: host,
    requestedAt: now,
    error: 'manual',
    dnsRecords: [routingRecord(host, APP_RUNNER_DEFAULT_HOST), placeholderCertRecord(host)],
  }

  let conn: Awaited<ReturnType<typeof appRunnerClient>> = null
  try {
    conn = await appRunnerClient()
  } catch {
    conn = null
  }
  if (!conn) {
    // No service ARN configured → persist the manual fallback so the clinic
    // still gets the routing record + a placeholder, and an operator finishes.
    await persist(orgId, manualStatus)
    return { ok: true, status: manualStatus }
  }

  try {
    const { AssociateCustomDomainCommand } = await import('@aws-sdk/client-apprunner')
    const res = await conn.client.send(
      new AssociateCustomDomainCommand({
        ServiceArn: conn.serviceArn,
        DomainName: host,
        // We only associate the exact host the clinic gave us — never the
        // implicit www. variant (mirrors the wildcard setup's
        // --no-enable-www-subdomain).
        EnableWWWSubdomain: false,
      }),
    )
    const target = res.DNSTarget?.trim() || APP_RUNNER_DEFAULT_HOST
    const certRecords: CustomDomainDnsRecord[] = (res.CustomDomain?.CertificateValidationRecords ?? [])
      .filter((r) => r.Name && r.Value)
      .map((r) => ({
        name: r.Name!,
        type: r.Type || 'CNAME',
        value: r.Value!,
        purpose: 'certificate' as const,
      }))
    const status: CustomDomainStatus = {
      state: 'pending_dns',
      domain: host,
      requestedAt: now,
      lastCheckedAt: now,
      dnsRecords: [
        routingRecord(host, target),
        // Certificate records may not be present in the immediate response —
        // a follow-up checkStatus call backfills them. Use a placeholder so
        // the clinic always sees at least the routing record to add now.
        ...(certRecords.length > 0 ? certRecords : [placeholderCertRecord(host)]),
      ],
    }
    await persist(orgId, status)
    return { ok: true, status }
  } catch (err) {
    // AccessDenied / quota / anything else → degrade to manual, never throw.
    console.warn('[custom-domain] associate failed, degrading to manual:', (err as Error).message)
    await persist(orgId, manualStatus)
    return { ok: true, status: manualStatus }
  }
}

/**
 * Poll App Runner for the current association status and reconcile our stored
 * state (pending_dns → active when ACM validation + binding complete; → failed
 * on a CREATE/DELETE failure). Also backfills certificate records that weren't
 * in the immediate associate response. No-op-safe when nothing is configured.
 */
export async function checkCustomDomainStatus(orgId: string): Promise<CustomDomainResult> {
  const current = await getStatus(orgId)
  if (!current) return { ok: false, error: 'No custom domain is set up.' }
  const now = new Date().toISOString()

  let conn: Awaited<ReturnType<typeof appRunnerClient>> = null
  try {
    conn = await appRunnerClient()
  } catch {
    conn = null
  }
  if (!conn) {
    // Can't check without AWS — just stamp the check time, leave state as-is.
    const status = { ...current, lastCheckedAt: now }
    await persist(orgId, status)
    return { ok: true, status }
  }

  try {
    const { DescribeCustomDomainsCommand } = await import('@aws-sdk/client-apprunner')
    const res = await conn.client.send(
      new DescribeCustomDomainsCommand({ ServiceArn: conn.serviceArn }),
    )
    const match = (res.CustomDomains ?? []).find(
      (d) => d.DomainName?.toLowerCase() === current.domain.toLowerCase(),
    )
    if (!match) {
      // App Runner doesn't know this domain — likely the manual path hasn't
      // been finished yet. Keep pending, stamp the check.
      const status = { ...current, lastCheckedAt: now }
      await persist(orgId, status)
      return { ok: true, status }
    }

    const target = res.DNSTarget?.trim() || current.dnsRecords.find((r) => r.purpose === 'routing')?.value || APP_RUNNER_DEFAULT_HOST
    const certRecords: CustomDomainDnsRecord[] = (match.CertificateValidationRecords ?? [])
      .filter((r) => r.Name && r.Value)
      .map((r) => ({
        name: r.Name!,
        type: r.Type || 'CNAME',
        value: r.Value!,
        purpose: 'certificate' as const,
      }))
    const dnsRecords: CustomDomainDnsRecord[] = [
      routingRecord(current.domain, target),
      ...(certRecords.length > 0
        ? certRecords
        : current.dnsRecords.filter((r) => r.purpose === 'certificate')),
    ]

    let state: CustomDomainState = current.state
    const awsStatus = match.Status ?? ''
    if (awsStatus === 'ACTIVE') state = 'active'
    else if (awsStatus === 'CREATE_FAILED' || awsStatus === 'DELETE_FAILED') state = 'failed'
    else state = 'pending_dns'

    const status: CustomDomainStatus = {
      ...current,
      state,
      lastCheckedAt: now,
      dnsRecords,
      // Clear the manual flag once AWS owns the record.
      error: state === 'failed' ? `App Runner reported ${awsStatus}` : undefined,
    }
    await persist(orgId, status)
    return { ok: true, status }
  } catch (err) {
    console.warn('[custom-domain] describe failed:', (err as Error).message)
    const status = { ...current, lastCheckedAt: now }
    await persist(orgId, status)
    return { ok: true, status }
  }
}

/**
 * Remove a clinic's custom domain: disassociate it in App Runner (best-effort)
 * and clear `websiteDomain` + status so the site falls back to its subdomain.
 */
export async function removeCustomDomain(orgId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await getStatus(orgId)
  // Even with no stored status, clear the columns so a half-set domain is removed.
  let conn: Awaited<ReturnType<typeof appRunnerClient>> = null
  try {
    conn = await appRunnerClient()
  } catch {
    conn = null
  }
  if (conn && current?.domain) {
    try {
      const { DisassociateCustomDomainCommand } = await import('@aws-sdk/client-apprunner')
      await conn.client.send(
        new DisassociateCustomDomainCommand({
          ServiceArn: conn.serviceArn,
          DomainName: current.domain,
        }),
      )
    } catch (err) {
      // Already gone / never associated (manual path) — fine, still clear ours.
      console.warn('[custom-domain] disassociate failed (clearing anyway):', (err as Error).message)
    }
  }
  await db
    .update(clinicProfile)
    .set({ websiteDomain: null, customDomainStatus: null })
    .where(eq(clinicProfile.organizationId, orgId))
  return { ok: true }
}
