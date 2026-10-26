import 'server-only'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { recordAction } from '@/lib/services/action-ledger'
import { reportAutomationFailure } from '@/lib/services/engine-failures'
import { startBudget, budgetSpent } from '@/lib/cron-budget'

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
 *      reports ACTIVE → we flip the stored state to `active`. Whoever asks —
 *      the card's 45s poll, Check now, or the sweep below — the flip writes
 *      ONE ledger line ("Connected www.x.com — your website is live").
 *   3b. `sweepPendingCustomDomains` (the `custom-domains` cron, every 15
 *      minutes) runs that same check for every pending domain on a live
 *      clinic, so the managed-cert ATTACH and the activation nudge inside
 *      `checkViaCloudFront` happen whether or not anyone has the Domain page
 *      open. Until 2026-10-26 the card's poll was the ONLY driver, and a
 *      clinic that closed the tab after adding its records had a domain that
 *      never finished (the cert issued; nothing attached it).
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
  /** Fully-qualified record name (e.g. `www.nwasmiles.com`). Kept for clarity /
   *  the providers that want the full name. */
  name: string
  /** The record name RELATIVE to the domain's zone — what most registrars want
   *  in their "Host/Name" field: `@` for the apex, `www` for www, or the token
   *  label for a cert CNAME. Falls back to `name` when it can't be relativized. */
  host: string
  type: string
  value: string
  purpose: DnsRecordPurpose
  /** Extra human guidance for a record (e.g. the apex ALIAS/forward caveat). */
  note?: string
}

export interface CustomDomainStatus {
  state: CustomDomainState
  /** Canonical host (the `www.` variant for an apex pair) — used for SEO + display. */
  domain: string
  /** The host actually associated in App Runner (the apex for a pair). Match
   *  DescribeCustomDomains / DisassociateCustomDomain against this, not `domain`. */
  associateHost?: string
  /** Every host that should serve the site (apex + www for a pair, else one). */
  servedHosts?: string[]
  requestedAt: string
  dnsRecords: CustomDomainDnsRecord[]
  /** When the edge was last asked about this domain — by the card's poll,
   *  Check now, or the sweep. The card shows it as "Checked <time>". */
  lastCheckedAt?: string
  /** When the 15-minute sweep last looked at this row. `lastCheckedAt` moves
   *  on every check whoever asked; this one says the MACHINE did, so an
   *  operator can tell "nobody has the tab open" from "the cron is dead". */
  lastSweptAt?: string
  /** When the platform was told this domain had sat pending a full day.
   *  Written ONCE per request — a fresh Connect builds a new status and the
   *  old stamp goes with it — so the alert fires once, not every tick. */
  notifiedAt?: string
  /** 'manual' when AWS couldn't run and an operator must finish provisioning. */
  error?: string
  /** Which edge owns this domain: 'apprunner' (legacy associations, capped at
   *  5 per service) or 'cloudfront' (the multi-tenant distribution, unlimited
   *  — 2026-07-22). Absent on legacy rows = 'apprunner'. Status checks and
   *  removal dispatch on THIS, not the env switch, so flipping the env never
   *  strands an already-attached domain. */
  driver?: 'apprunner' | 'cloudfront'
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

// ── Validation + planning ─────────────────────────────────────────────────────

/**
 * The resolved plan for a candidate domain: what to associate in App Runner,
 * whether to also cover the `www.` variant, the canonical host, and the full
 * set of hosts that should serve the site.
 *
 * We support BOTH an apex (`nwasmiles.com`) and a subdomain (`www.` / `book.`).
 * For an apex — or a `www.` host, from which we derive the apex — we associate
 * the apex with `EnableWWWSubdomain: true`, so App Runner provisions ONE cert +
 * routing for the apex AND its `www.` sibling. That's the pair a clinic
 * expects: `nwasmiles.com` and `www.nwasmiles.com` both land on their site.
 * A deeper subdomain (e.g. `book.example.com`) is associated on its own.
 */
export interface CustomDomainPlan {
  /** Host we call `AssociateCustomDomain` with (the apex for a pair). */
  associateHost: string
  /** Whether App Runner should also cover the `www.` sibling (apex pairs only). */
  enableWww: boolean
  /** Canonical host for SEO + storage (`www.` for a pair, else the host itself). */
  canonical: string
  /** Every host that should route to the site (apex + www for a pair, else one). */
  servedHosts: string[]
}

/**
 * Normalize a raw domain string (tolerating a pasted URL / wildcard) and resolve
 * it into a `CustomDomainPlan`. Rejects garbage + the platform's own domain
 * (those are served by the wildcard subdomain path, not a custom domain).
 */
export function resolveCustomDomain(
  raw: string,
): { ok: true; plan: CustomDomainPlan } | { ok: false; error: string } {
  let host = (raw ?? '').trim().toLowerCase()
  if (!host) return { ok: false, error: 'Enter a domain.' }
  // Tolerate a pasted URL / wildcard / trailing dot.
  host = host
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')
    .replace(/^\*\./, '')

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
  if (labels.length < 2) {
    return { ok: false, error: 'That doesn’t look like a valid domain.' }
  }

  // Apex pair: a bare 2-label apex, or a `www.` host we can derive the apex from.
  let apex: string | null = null
  if (host.startsWith('www.')) apex = host.slice(4)
  else if (labels.length === 2) apex = host

  if (apex && apex.split('.').length >= 2) {
    return {
      ok: true,
      plan: {
        associateHost: apex,
        enableWww: true,
        canonical: `www.${apex}`,
        servedHosts: [apex, `www.${apex}`],
      },
    }
  }

  // A non-www subdomain (book.example.com, portal.example.com, …): associate it
  // alone — there's no apex the clinic implied.
  return {
    ok: true,
    plan: {
      associateHost: host,
      enableWww: false,
      canonical: host,
      servedHosts: [host],
    },
  }
}

/**
 * Back-compat validator: returns the canonical host (the `www.` variant for an
 * apex pair). Kept for callers that only need pass/fail + the display host.
 */
export function validateCustomDomain(
  raw: string,
): { ok: true; domain: string } | { ok: false; error: string } {
  const r = resolveCustomDomain(raw)
  return r.ok ? { ok: true, domain: r.plan.canonical } : r
}

/**
 * Pure: the hosts that should route to a clinic's site given its stored canonical
 * domain (used by the middleware host→slug map as a fallback when a full status
 * object isn't available). Mirrors `resolveCustomDomain`'s served-host logic.
 */
export function expandServedHosts(domain: string): string[] {
  const r = resolveCustomDomain(domain)
  return r.ok ? r.plan.servedHosts : [domain.trim().toLowerCase()].filter(Boolean)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The zone apex (registrable root) a plan's records live under. For a pair
 *  that's the associate host itself; for a subdomain, best-effort last-two
 *  labels (correct for the common `.com` case). */
function zoneApex(plan: CustomDomainPlan): string {
  if (plan.enableWww) return plan.associateHost
  const labels = plan.associateHost.split('.')
  return labels.length <= 2 ? plan.associateHost : labels.slice(-2).join('.')
}

/**
 * The record name RELATIVE to its zone apex — what registrars want in the
 * Host/Name field. `@` for the apex itself, otherwise the leading label(s) with
 * the trailing `.apex` stripped. Tolerates a trailing dot (App Runner's ACM
 * names carry one). Falls back to the full name if it isn't under the apex.
 */
function relativeHost(fqdn: string, apex: string): string {
  const n = fqdn.trim().replace(/\.$/, '').toLowerCase()
  const a = apex.trim().replace(/\.$/, '').toLowerCase()
  if (n === a) return '@'
  if (n.endsWith(`.${a}`)) return n.slice(0, n.length - a.length - 1)
  return n
}

/**
 * Build the routing DNS record(s) a clinic must add. For an apex pair this is
 * TWO records: the apex (ALIAS/ANAME — a bare apex can't use a CNAME) and the
 * `www.` host (CNAME). Both point at the same App Runner target. For a lone
 * subdomain it's a single CNAME.
 */
function routingRecords(plan: CustomDomainPlan, target: string): CustomDomainDnsRecord[] {
  const apex = zoneApex(plan)
  if (plan.enableWww) {
    const www = `www.${plan.associateHost}`
    return [
      {
        name: plan.associateHost,
        host: relativeHost(plan.associateHost, apex), // '@'
        type: 'ALIAS',
        value: target,
        purpose: 'routing',
        note: `Enter “@” as the host for your bare domain. A bare domain can’t use a CNAME — if your DNS host supports an ALIAS/ANAME record (Cloudflare, Route 53, name.com, and many others do), point it at the value above. If it doesn’t, set up domain forwarding from ${plan.associateHost} to https://${www} at your registrar instead.`,
      },
      { name: www, host: relativeHost(www, apex), type: 'CNAME', value: target, purpose: 'routing' },
    ]
  }
  return [
    {
      name: plan.associateHost,
      host: relativeHost(plan.associateHost, apex),
      type: 'CNAME',
      value: target,
      purpose: 'routing',
    },
  ]
}

/** Map App Runner ACM validation records → our shape, with a zone-relative host. */
function certRecordsFrom(
  raw: Array<{ Name?: string; Type?: string; Value?: string }> | undefined,
  apex: string,
): CustomDomainDnsRecord[] {
  return (raw ?? [])
    .filter((r) => r.Name && r.Value)
    .map((r) => ({
      name: r.Name!.replace(/\.$/, ''),
      host: relativeHost(r.Name!, apex),
      type: r.Type || 'CNAME',
      value: r.Value!.replace(/\.$/, ''),
      purpose: 'certificate' as const,
    }))
}

/** Placeholder certificate record used in the manual-fallback path. */
function placeholderCertRecord(host: string): CustomDomainDnsRecord {
  return {
    name: `_acme-challenge.${host}`,
    host: `_acme-challenge`,
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
 * The ONE ledger line a custom domain earns: the moment it goes live. Called
 * by every check path after its persist, with the status it read and the
 * one it wrote, so the line is written whoever triggered the flip — the
 * card's poll, Check now, or the sweep — and never twice (a poll that reads
 * an already-active row has nothing to announce). Best-effort by
 * construction: `recordAction` never throws.
 */
async function noteWentLive(orgId: string, before: CustomDomainStatus, after: CustomDomainStatus): Promise<void> {
  if (before.state === 'active' || after.state !== 'active') return
  await recordAction({
    organizationId: orgId,
    capability: 'custom_domain',
    summary: `Connected ${after.domain} — your website is live there now.`,
    detail: { domain: after.domain, servedHosts: after.servedHosts ?? [after.domain], driver: after.driver ?? 'apprunner' },
  })
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

// ── CloudFront tenant edge (2026-07-22) ──────────────────────────────────────
// The scale path: NEW custom domains become tenants of a multi-tenant
// CloudFront distribution (per-tenant managed certs, no per-service cap)
// instead of App Runner associations (hard-capped at 5 — the wall
// mammothspringsdental.com hit). CUSTOM_DOMAIN_DRIVER=cloudfront flips new
// requests; already-attached domains keep the driver stamped on their status.
// Certificates are fully zero-touch: ManagedCertificateRequest with the
// 'cloudfront'-hosted validation token means the cert issues by itself once
// the domain's DNS points at the connection group's routing endpoint — no ACM
// CNAMEs for anyone to add.

function customDomainDriver(): 'apprunner' | 'cloudfront' {
  return process.env.CUSTOM_DOMAIN_DRIVER?.trim() === 'cloudfront' ? 'cloudfront' : 'apprunner'
}

async function cloudFrontTenantClient(): Promise<{
  client: import('@aws-sdk/client-cloudfront').CloudFrontClient
  distributionId: string
  connectionGroupId: string
  routingEndpoint: string
} | null> {
  const distributionId = process.env.CF_TENANT_DISTRIBUTION_ID?.trim()
  const connectionGroupId = process.env.CF_CONNECTION_GROUP_ID?.trim()
  const routingEndpoint = process.env.CF_ROUTING_ENDPOINT?.trim()
  if (!distributionId || !connectionGroupId || !routingEndpoint) return null
  const { CloudFrontClient } = await import('@aws-sdk/client-cloudfront')
  // CloudFront is a global service; its control plane lives in us-east-1.
  return {
    client: new CloudFrontClient({ region: 'us-east-1' }),
    distributionId,
    connectionGroupId,
    routingEndpoint,
  }
}

/** Tenant names allow [a-zA-Z0-9-] — derive a stable one from the apex. */
function tenantNameFor(associateHost: string): string {
  return associateHost.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64)
}

/** The one true CreateDistributionTenant input — shared by the request path
 *  and the status-poll retry so the two can never drift. */
function cloudFrontTenantCreateInput(
  conn: NonNullable<Awaited<ReturnType<typeof cloudFrontTenantClient>>>,
  plan: CustomDomainPlan,
) {
  return {
    DistributionId: conn.distributionId,
    Name: tenantNameFor(plan.associateHost),
    Domains: plan.servedHosts.map((d) => ({ Domain: d })),
    ConnectionGroupId: conn.connectionGroupId,
    // CloudFront hosts the cert-validation token itself: once DNS points
    // at the routing endpoint, the cert issues with zero extra records.
    ManagedCertificateRequest: { ValidationTokenHost: 'cloudfront' as const },
    Enabled: true,
  }
}

async function requestViaCloudFront(
  orgId: string,
  plan: CustomDomainPlan,
  host: string,
  now: string,
  manualStatus: CustomDomainStatus,
): Promise<CustomDomainResult> {
  let conn: Awaited<ReturnType<typeof cloudFrontTenantClient>> = null
  try {
    conn = await cloudFrontTenantClient()
  } catch {
    conn = null
  }
  if (!conn) {
    const status: CustomDomainStatus = { ...manualStatus, driver: 'cloudfront' }
    await persist(orgId, status)
    return { ok: true, status }
  }

  try {
    const { CreateDistributionTenantCommand } = await import('@aws-sdk/client-cloudfront')
    await conn.client.send(
      new CreateDistributionTenantCommand(cloudFrontTenantCreateInput(conn, plan)),
    )
  } catch (err) {
    const msg = String(err)
    // Ownership not provable YET: CloudFront requires the domain to point at
    // the routing endpoint OR carry the _cf-challenge TXT at create time. A
    // BYO-domain clinic hasn't added records yet (and a purchased domain's
    // records are written right after this call) — persist the full record
    // set as pending; checkViaCloudFront retries the create once they land.
    // NOT the manual state: no operator needed, the flow converges itself.
    const ownershipPending = /Could not verify Domain Name ownership/i.test(msg)
    // Already-exists / domains-already-on-a-tenant (a re-Connect after a
    // partial run, or an operator-created tenant) is fine — the status check
    // reconciles against the live tenant by domain. Anything else degrades to
    // the manual state exactly like the App Runner path (never throw at a clinic).
    const alreadyOurs = /EntityAlreadyExists|already exists|already associated with a different resource/i.test(msg)
    if (!ownershipPending && !alreadyOurs) {
      console.warn('[custom-domain] cloudfront tenant create failed, degrading to manual:', (err as Error).message)
      const status: CustomDomainStatus = { ...manualStatus, driver: 'cloudfront' }
      await persist(orgId, status)
      return { ok: true, status }
    }
  }

  const status: CustomDomainStatus = {
    state: 'pending_dns',
    domain: host,
    associateHost: plan.associateHost,
    servedHosts: plan.servedHosts,
    requestedAt: now,
    lastCheckedAt: now,
    driver: 'cloudfront',
    dnsRecords: cloudFrontDnsRecords(plan, conn.routingEndpoint),
  }
  await persist(orgId, status)
  return { ok: true, status }
}

/** The CloudFront driver's full record set: routing (apex ALIAS/ANAME + www
 *  CNAME) plus a `_cf-challenge` TXT per served host — no ACM validation
 *  CNAMEs on this path (CloudFront hosts the cert validation token itself).
 *  The TXT is CloudFront's explicit domain-ownership signal, which lets the
 *  tenant be created before DNS moves and flips the domain ACTIVE
 *  deterministically instead of waiting on its periodic DNS probe. */
function cloudFrontDnsRecords(plan: CustomDomainPlan, routingEndpoint: string): CustomDomainDnsRecord[] {
  return [
    ...routingRecords(plan, routingEndpoint),
    ...plan.servedHosts.map((h): CustomDomainDnsRecord => ({
      name: `_cf-challenge.${h}`,
      host: relativeHost(`_cf-challenge.${h}`, zoneApex(plan)),
      type: 'TXT',
      value: routingEndpoint,
      purpose: 'certificate',
      note: 'Proves to CloudFront that this domain is meant to point here — required for the domain to activate.',
    })),
  ]
}

async function checkViaCloudFront(
  orgId: string,
  current: CustomDomainStatus,
  now: string,
): Promise<CustomDomainResult> {
  let conn: Awaited<ReturnType<typeof cloudFrontTenantClient>> = null
  try {
    conn = await cloudFrontTenantClient()
  } catch {
    conn = null
  }
  if (!conn) {
    const status = { ...current, lastCheckedAt: now }
    await persist(orgId, status)
    return { ok: true, status }
  }
  try {
    const {
      GetDistributionTenantByDomainCommand,
      GetManagedCertificateDetailsCommand,
      UpdateDistributionTenantCommand,
      VerifyDnsConfigurationCommand,
    } = await import('@aws-sdk/client-cloudfront')
    const res = await conn.client.send(
      new GetDistributionTenantByDomainCommand({
        Domain: current.associateHost || current.domain,
      }),
    )
    let tenant = res.DistributionTenant
    // ATTACH the managed cert once it issues. Issuance alone leaves the
    // tenant's Customizations null and every domain 'inactive' — observed
    // live 2026-07-23: cert 'issued' + DNS verified valid, yet no TLS until
    // Customizations.Certificate was set explicitly, which activated the
    // domain immediately. Best-effort; the next poll retries.
    if (tenant?.Id && !tenant.Customizations?.Certificate?.Arn) {
      try {
        const cert = await conn.client.send(
          new GetManagedCertificateDetailsCommand({ Identifier: tenant.Id }),
        )
        const arn = cert.ManagedCertificateDetails?.CertificateArn
        if (arn && cert.ManagedCertificateDetails?.CertificateStatus === 'issued') {
          const upd = await conn.client.send(
            new UpdateDistributionTenantCommand({
              Id: tenant.Id,
              IfMatch: res.ETag,
              Domains: (tenant.Domains ?? []).map((d) => ({ Domain: d.Domain! })),
              Customizations: { Certificate: { Arn: arn } },
              Enabled: true,
            }),
          )
          tenant = upd.DistributionTenant ?? tenant
        }
      } catch (err) {
        console.warn('[custom-domain] managed-cert attach failed (next poll retries):', (err as Error).message)
      }
    }
    // Nudge activation: VerifyDnsConfiguration is the API twin of the
    // console's "Submit" — CloudFront checks the domain's DNS NOW instead of
    // on its own leisurely probe cycle. Best-effort per host.
    if (tenant?.Id) {
      for (const h of current.servedHosts ?? [current.domain]) {
        await conn.client
          .send(new VerifyDnsConfigurationCommand({ Domain: h, Identifier: tenant.Id }))
          .catch(() => {})
      }
    }
    const domains = tenant?.Domains ?? []
    const served = (current.servedHosts ?? [current.domain]).map((h) => h.toLowerCase())
    const activeHosts = new Set(
      domains
        .filter((d) => String(d.Status ?? '').toLowerCase() === 'active')
        .map((d) => (d.Domain ?? '').toLowerCase()),
    )
    const allActive = served.length > 0 && served.every((h) => activeHosts.has(h))
    // Rebuild the record set from the live plan — a status that degraded to
    // manual earlier may still carry App Runner-era placeholder records.
    const planForRecords = resolveCustomDomain(current.associateHost || current.domain)
    const status: CustomDomainStatus = {
      ...current,
      state: allActive ? 'active' : 'pending_dns',
      lastCheckedAt: now,
      dnsRecords: planForRecords.ok
        ? cloudFrontDnsRecords(planForRecords.plan, conn.routingEndpoint)
        : current.dnsRecords,
      error: undefined,
    }
    await persist(orgId, status)
    await noteWentLive(orgId, current, status)
    return { ok: true, status }
  } catch (err) {
    // Tenant not found: creation was deferred on the domain-ownership check
    // (BYO domain whose records hadn't landed). Retry it now — the clinic's
    // _cf-challenge TXT / routing records may have propagated since — and
    // make sure the stored instructions are the CLOUDFRONT set (a row that
    // degraded under the old code may still show App Runner-era records) with
    // no stale 'manual' flag: this state needs the clinic's DNS, not an operator.
    if (/EntityNotFound|does not exist/i.test(String(err))) {
      const planRes = resolveCustomDomain(current.associateHost || current.domain)
      try {
        if (planRes.ok) {
          const { CreateDistributionTenantCommand } = await import('@aws-sdk/client-cloudfront')
          await conn.client.send(
            new CreateDistributionTenantCommand(cloudFrontTenantCreateInput(conn, planRes.plan)),
          )
        }
      } catch {
        // Still pending (records not there yet) — the next poll retries.
      }
      const status: CustomDomainStatus = {
        ...current,
        state: 'pending_dns',
        lastCheckedAt: now,
        dnsRecords: planRes.ok ? cloudFrontDnsRecords(planRes.plan, conn.routingEndpoint) : current.dnsRecords,
        error: undefined,
      }
      await persist(orgId, status)
      return { ok: true, status }
    }
    console.warn('[custom-domain] cloudfront tenant check failed:', (err as Error).message)
    const status = { ...current, lastCheckedAt: now }
    await persist(orgId, status)
    return { ok: true, status }
  }
}

async function removeViaCloudFront(current: CustomDomainStatus): Promise<void> {
  const conn = await cloudFrontTenantClient()
  if (!conn) return
  const { GetDistributionTenantByDomainCommand, UpdateDistributionTenantCommand, DeleteDistributionTenantCommand } =
    await import('@aws-sdk/client-cloudfront')
  const res = await conn.client.send(
    new GetDistributionTenantByDomainCommand({ Domain: current.associateHost || current.domain }),
  )
  const tenant = res.DistributionTenant
  if (!tenant?.Id) return
  // A tenant must be disabled before it can be deleted.
  const upd = await conn.client.send(
    new UpdateDistributionTenantCommand({ Id: tenant.Id, IfMatch: res.ETag, Enabled: false }),
  )
  await conn.client.send(
    new DeleteDistributionTenantCommand({ Id: tenant.Id, IfMatch: upd.ETag }),
  )
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
  const v = resolveCustomDomain(domain)
  if (!v.ok) return { ok: false, error: v.error }
  const { plan } = v
  const host = plan.canonical
  const now = new Date().toISOString()

  // TENANT ISOLATION: refuse a host another clinic already claims. Without this
  // any clinic owner could set websiteDomain = a rival's live domain; the
  // middleware host→slug map (listActiveCustomDomains) is last-write-wins, so
  // the rival's real visitors would then be served THIS clinic's public site —
  // a cross-tenant domain takeover. We reject BOTH served hosts (an apex + its
  // www. sibling) so the pair can't be split across orgs. A DB unique index on
  // website_domain backstops this against races.
  const claimedHosts = Array.from(new Set([host, ...plan.servedHosts.map((h) => h.toLowerCase())]))
  const conflicts = await db
    .select({ organizationId: clinicProfile.organizationId, domain: clinicProfile.websiteDomain })
    .from(clinicProfile)
    .where(ne(clinicProfile.organizationId, orgId))
  const takenByAnother = conflicts.some(
    (r) => r.domain && claimedHosts.includes(r.domain.trim().toLowerCase()),
  )
  if (takenByAnother) {
    return {
      ok: false,
      error:
        'That domain is already connected to another clinic on Dream Create. ' +
        'If it belongs to you, contact support so we can move it.',
    }
  }

  const manualStatus: CustomDomainStatus = {
    state: 'pending_dns',
    domain: host,
    associateHost: plan.associateHost,
    servedHosts: plan.servedHosts,
    requestedAt: now,
    error: 'manual',
    dnsRecords: [...routingRecords(plan, APP_RUNNER_DEFAULT_HOST), placeholderCertRecord(host)],
  }

  // The scale path: new domains become CloudFront distribution tenants
  // (no per-service cap, zero-touch certs) when the driver env says so.
  if (customDomainDriver() === 'cloudfront') {
    return requestViaCloudFront(orgId, plan, host, now, manualStatus)
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
        DomainName: plan.associateHost,
        // For an apex pair we DO enable the www. variant so App Runner covers
        // both nwasmiles.com and www.nwasmiles.com under one cert. For a lone
        // subdomain we associate just that host.
        EnableWWWSubdomain: plan.enableWww,
      }),
    )
    const target = res.DNSTarget?.trim() || APP_RUNNER_DEFAULT_HOST
    const certRecords = certRecordsFrom(res.CustomDomain?.CertificateValidationRecords, zoneApex(plan))
    const status: CustomDomainStatus = {
      state: 'pending_dns',
      domain: host,
      associateHost: plan.associateHost,
      servedHosts: plan.servedHosts,
      requestedAt: now,
      lastCheckedAt: now,
      dnsRecords: [
        ...routingRecords(plan, target),
        // Certificate records may not be present in the immediate response —
        // a follow-up checkStatus call backfills them. Use a placeholder so
        // the clinic always sees at least the routing record to add now.
        ...(certRecords.length > 0 ? certRecords : [placeholderCertRecord(host)]),
      ],
    }
    await persist(orgId, status)
    return { ok: true, status }
  } catch (err) {
    // The most common non-fatal failure is "already associated" (a re-Connect
    // after a partial run, or an operator who associated it by hand). Recover by
    // reading the existing association back, so the clinic still gets the REAL
    // cert records instead of a placeholder.
    const recovered = await recoverExistingAssociation(conn, plan, now)
    if (recovered) {
      await persist(orgId, recovered)
      return { ok: true, status: recovered }
    }
    // AccessDenied / quota / anything else → degrade to manual, never throw.
    console.warn('[custom-domain] associate failed, degrading to manual:', (err as Error).message)
    await persist(orgId, manualStatus)
    return { ok: true, status: manualStatus }
  }
}

/**
 * Read an already-existing App Runner association for `plan.associateHost` and
 * build a real status from it (routing + whatever cert records exist so far).
 * Returns null when there's no such association (or the describe call fails), so
 * the caller can fall back to the manual state.
 */
async function recoverExistingAssociation(
  conn: { client: import('@aws-sdk/client-apprunner').AppRunnerClient; serviceArn: string },
  plan: CustomDomainPlan,
  now: string,
): Promise<CustomDomainStatus | null> {
  try {
    const { DescribeCustomDomainsCommand } = await import('@aws-sdk/client-apprunner')
    const res = await conn.client.send(
      new DescribeCustomDomainsCommand({ ServiceArn: conn.serviceArn }),
    )
    const match = (res.CustomDomains ?? []).find(
      (d) => d.DomainName?.toLowerCase() === plan.associateHost.toLowerCase(),
    )
    if (!match) return null
    const target = res.DNSTarget?.trim() || APP_RUNNER_DEFAULT_HOST
    const certRecords = certRecordsFrom(match.CertificateValidationRecords, zoneApex(plan))
    const awsStatus = String(match.Status ?? '').toUpperCase()
    return {
      state: awsStatus === 'ACTIVE' ? 'active' : 'pending_dns',
      domain: plan.canonical,
      associateHost: plan.associateHost,
      servedHosts: plan.servedHosts,
      requestedAt: now,
      lastCheckedAt: now,
      dnsRecords: [
        ...routingRecords(plan, target),
        ...(certRecords.length > 0 ? certRecords : [placeholderCertRecord(plan.canonical)]),
      ],
    }
  } catch {
    return null
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

  // Dispatch on the driver STAMPED ON THE STATUS (not the env switch): a
  // domain attached via App Runner keeps polling App Runner even after new
  // domains move to CloudFront.
  if (current.driver === 'cloudfront') {
    return checkViaCloudFront(orgId, current, now)
  }

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
    // App Runner keys the record on the host we associated (the apex for a
    // pair), which may differ from our canonical `domain` (the www variant).
    const matchHost = (current.associateHost || current.domain).toLowerCase()
    const match = (res.CustomDomains ?? []).find(
      (d) => d.DomainName?.toLowerCase() === matchHost,
    )
    if (!match) {
      // App Runner doesn't know this domain — likely the manual path hasn't
      // been finished yet. Keep pending, stamp the check.
      const status = { ...current, lastCheckedAt: now }
      await persist(orgId, status)
      return { ok: true, status }
    }

    const target = res.DNSTarget?.trim() || current.dnsRecords.find((r) => r.purpose === 'routing')?.value || APP_RUNNER_DEFAULT_HOST
    // Rebuild the routing record(s) from the plan so an apex pair keeps BOTH
    // (apex ALIAS + www CNAME), not just the canonical host.
    const planForRecords = resolveCustomDomain(current.associateHost || current.domain)
    const routing = planForRecords.ok
      ? routingRecords(planForRecords.plan, target)
      : current.dnsRecords.filter((r) => r.purpose === 'routing')
    const certRecords = certRecordsFrom(
      match.CertificateValidationRecords,
      planForRecords.ok ? zoneApex(planForRecords.plan) : current.domain,
    )
    const dnsRecords: CustomDomainDnsRecord[] = [
      ...routing,
      ...(certRecords.length > 0
        ? certRecords
        : current.dnsRecords.filter((r) => r.purpose === 'certificate')),
    ]

    let state: CustomDomainState = current.state
    // App Runner's REST API returns the status LOWERCASE ("active",
    // "create_failed", "pending_certificate_dns_validation") even though the SDK
    // types it uppercase — normalize so the match is reliable at runtime.
    const awsStatus = String(match.Status ?? '').toUpperCase()
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
    await noteWentLive(orgId, current, status)
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
  if (current?.driver === 'cloudfront') {
    try {
      await removeViaCloudFront(current)
    } catch (err) {
      // Already gone / transient — fine, still clear ours.
      console.warn('[custom-domain] cloudfront tenant remove failed (clearing anyway):', (err as Error).message)
    }
    await db
      .update(clinicProfile)
      .set({ websiteDomain: null, customDomainStatus: null })
      .where(eq(clinicProfile.organizationId, orgId))
    return { ok: true }
  }
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
          // Disassociate the host we associated (the apex for a pair).
          DomainName: current.associateHost || current.domain,
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

// ── The sweep (2026-10-26) ───────────────────────────────────────────────────
// Until this shipped, `checkCustomDomainStatus` ran only while someone had the
// Domain page open (the card's 45s poll) or pressed Check now. Everything that
// FINISHES a domain lives inside that check — on the CloudFront path the
// managed cert issues on its own but nothing attaches it to the tenant until
// a check runs, and the `VerifyDnsConfiguration` nudge is what makes the edge
// look at the records now rather than on its own leisurely cycle. So a clinic
// that added its records and closed the tab had a domain that never went
// live, and the card's "you can leave this page" was a promise the system
// did not keep. This sweep is the `custom-domains` cron: every 15 minutes it
// runs the same check for every pending domain on a live clinic.

/** How many pending rows one tick asks the edge about. Oldest-checked first,
 *  so a backlog bigger than this drains across ticks rather than starving
 *  its tail — a checked row gets a fresh `lastCheckedAt` and goes to the
 *  back of the queue. */
export const CUSTOM_DOMAIN_SWEEP_MAX = 50
/** Pause between rows. Each check is several CloudFront control-plane calls
 *  and the control plane rate-limits per account, not per tenant. */
export const CUSTOM_DOMAIN_SWEEP_PACING_MS = 2_000
/** Wall-clock budget for one tick, chosen against the route's `maxDuration`
 *  (300s) with room for the slowest row: 50 rows × (2s pace + a few edge
 *  calls) fits; a slow edge stops the walk early instead of being killed. */
export const CUSTOM_DOMAIN_SWEEP_BUDGET_MS = 240_000
/** A domain still pending this long after Connect gets the platform's
 *  attention ONCE — their records never landed, the cert never issued, or
 *  the edge call degraded to the manual state and an operator owes them. */
export const CUSTOM_DOMAIN_STILL_PENDING_AFTER_MS = 24 * 60 * 60 * 1000

export interface CustomDomainSweepResult {
  /** Pending rows on real, live clinics (after the demo + shut-down filters). */
  pending: number
  /** How many this tick actually asked the edge about. */
  checked: number
  /** Rows that flipped pending → active this tick. */
  activated: number
  /** Day-old-and-still-pending alerts sent to the platform this tick. */
  notified: number
  /** Pending rows on shut-down clinics, deliberately left alone. */
  shutDown: number
  /** Org ids whose check threw. Each is reported to the Guardian; the rest
   *  of the walk carried on. */
  errors: string[]
  /** False when the per-tick cap or the time budget stopped the walk before
   *  the list ran out — the next tick picks up the oldest-checked remainder. */
  completed: boolean
}

export interface CustomDomainSweepOptions {
  now?: Date
  max?: number
  pacingMs?: number
  budgetMs?: number
  /** Injectable so tests never sleep. */
  sleep?: (ms: number) => Promise<void>
  /** The budget's clock, injectable for the same reason. */
  clock?: () => number
  /** The per-row check — `checkCustomDomainStatus` by default. Injectable so
   *  the sweep's ORCHESTRATION (filters, order, cap, isolation, the stamp,
   *  the day-old alert) is testable apart from the edge. */
  check?: (orgId: string) => Promise<CustomDomainResult>
}

interface PendingDomainRow {
  organizationId: string
  clinicName: string
  status: CustomDomainStatus
}

/**
 * Every pending custom domain on a real clinic. The demo org is excluded in
 * the query (its domain is never real, and a sweep that reports on it would
 * train the owner to ignore the list); shut-down clinics are excluded by the
 * caller, because `listShutDownOrgIds` is derived from the trial clock, not
 * a column this query could filter on.
 */
async function listPendingCustomDomains(): Promise<PendingDomainRow[]> {
  const rows = await db
    .select({
      organizationId: clinicProfile.organizationId,
      clinicName: organization.name,
      customDomainStatus: clinicProfile.customDomainStatus,
    })
    .from(clinicProfile)
    .innerJoin(organization, eq(organization.id, clinicProfile.organizationId))
    .where(
      and(
        eq(organization.type, 'clinic'),
        eq(organization.isDemo, false),
        sql`${clinicProfile.customDomainStatus} ->> 'state' = 'pending_dns'`,
      ),
    )
  return rows.flatMap((r) => {
    const status = r.customDomainStatus as CustomDomainStatus | null
    // The SQL filter already asked; the JS filter is the same law stated
    // where a reader can see it, and the guard against a malformed row.
    if (!status || typeof status !== 'object' || status.state !== 'pending_dns' || !status.domain) return []
    return [{ organizationId: r.organizationId, clinicName: r.clinicName ?? '', status }]
  })
}

/**
 * Pure: the order one tick walks pending rows in. Oldest `lastCheckedAt`
 * first; a row that has never been checked goes to the FRONT (it is the one
 * nobody has looked at), then by `requestedAt` so two never-checked rows are
 * served in the order their clinics asked.
 */
export function orderPendingForSweep<
  T extends { status: Pick<CustomDomainStatus, 'lastCheckedAt' | 'requestedAt'> },
>(rows: T[]): T[] {
  const stamp = (s: string | undefined) => {
    const t = s ? Date.parse(s) : NaN
    return Number.isFinite(t) ? t : -Infinity
  }
  return [...rows].sort(
    (a, b) =>
      stamp(a.status.lastCheckedAt) - stamp(b.status.lastCheckedAt) ||
      stamp(a.status.requestedAt) - stamp(b.status.requestedAt),
  )
}

/**
 * Pure: has this domain sat pending a full day with nobody told? Measured
 * from `requestedAt` (the Connect click), never from the last check — a row
 * nobody looked at for a week is exactly the row this alert exists for.
 */
export function stillPendingAlertDue(status: CustomDomainStatus, now: Date): boolean {
  if (status.state !== 'pending_dns') return false
  if (status.notifiedAt) return false
  const since = Date.parse(status.requestedAt)
  if (!Number.isFinite(since)) return false
  return now.getTime() - since >= CUSTOM_DOMAIN_STILL_PENDING_AFTER_MS
}

/**
 * Tell the platform a domain has been pending a day. The EXISTING
 * `domain_attach_manual` key — the same alert the buy-a-domain path raises
 * when an attach degrades — so it rides the registry's urgent + forced-email
 * posture and lands with the people who can act on either cause: finish a
 * manual attach by hand, or nudge the practice about its records. Never
 * throws; a failed alert is a `false` and the stamp is NOT written, so the
 * next tick tries again (the `dedupeKey` keeps that retry from minting a
 * second bell row for anyone who already got one).
 */
async function tellPlatformStillPending(row: PendingDomainRow, status: CustomDomainStatus): Promise<boolean> {
  try {
    const { getPlatformOrgId } = await import('./gsc')
    const { notifyOrgMembers } = await import('./notifications')
    const platformOrgId = await getPlatformOrgId()
    if (!platformOrgId) return false
    const clinic = row.clinicName || row.organizationId
    const manual = status.error === 'manual'
    await notifyOrgMembers(
      platformOrgId,
      {
        bucket: 'comments',
        type: 'domain_attach_manual',
        title: `Domain still pending after a day — ${status.domain}`,
        body: manual
          ? `${clinic} connected ${status.domain} a day ago and the edge call never ran — ` +
            `an operator needs to finish it by hand. Runbook: docs/custom-domains.md.`
          : `${clinic} connected ${status.domain} a day ago and it is still waiting — their DNS ` +
            `records haven’t landed, or the certificate hasn’t issued. Worth a look, and a nudge ` +
            `to the practice. Runbook: docs/custom-domains.md.`,
        linkPath: `/ecommerce/customers/${row.organizationId}`,
        forceEmail: true,
        dedupeKey: `domain_pending:${row.organizationId}:${status.requestedAt}`,
      },
      { roles: ['owner', 'admin'] },
    )
    return true
  } catch (err) {
    console.warn('[custom-domain] still-pending alert failed', (err as Error)?.message)
    return false
  }
}

/** One row's leg of the sweep. Extracted so the caller wraps exactly one
 *  tenant's work — one clinic's AWS error is one clinic's. */
async function sweepOne(
  row: PendingDomainRow,
  check: (orgId: string) => Promise<CustomDomainResult>,
  now: Date,
  result: CustomDomainSweepResult,
): Promise<void> {
  const res = await check(row.organizationId)
  // The row was removed between the read and the check — nothing to stamp.
  if (!res.ok) return
  result.checked += 1
  const next: CustomDomainStatus = { ...res.status, lastSweptAt: now.toISOString() }
  if (res.status.state === 'active') {
    // The ledger line was written inside the check (noteWentLive) — the
    // sweep only counts it.
    result.activated += 1
  } else if (stillPendingAlertDue(res.status, now)) {
    if (await tellPlatformStillPending(row, res.status)) {
      next.notifiedAt = now.toISOString()
      result.notified += 1
    }
  }
  await persist(row.organizationId, next)
}

/**
 * Run the check for every pending custom domain on a live clinic. Per-row
 * isolation is the load-bearing part: `checkCustomDomainStatus` swallows the
 * edge's own errors, but a dynamic import, a credential refresh or the
 * persist can still throw, and without the wrap one tenant's bad minute
 * would skip every clinic behind it — silently, because the cron would
 * report a 500 rather than a count. A throw is reported to the Guardian
 * under the clinic's own ledger (one strike per day) and the walk carries on.
 */
export async function sweepPendingCustomDomains(
  opts: CustomDomainSweepOptions = {},
): Promise<CustomDomainSweepResult> {
  const now = opts.now ?? new Date()
  const clock = opts.clock ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const check = opts.check ?? checkCustomDomainStatus
  const max = opts.max ?? CUSTOM_DOMAIN_SWEEP_MAX
  const pacingMs = opts.pacingMs ?? CUSTOM_DOMAIN_SWEEP_PACING_MS
  const result: CustomDomainSweepResult = {
    pending: 0,
    checked: 0,
    activated: 0,
    notified: 0,
    shutDown: 0,
    errors: [],
    completed: true,
  }

  const rows = await listPendingCustomDomains()
  if (rows.length === 0) return result

  // TRIAL EXPIRY KILLS EVERYTHING (owner ruling, 2026-08-10): a shut-down
  // clinic's domain stays exactly where it is until paying revives it.
  const { listShutDownOrgIds } = await import('./billing-state')
  const shutDown = await listShutDownOrgIds(now)
  const live = rows.filter((r) => {
    if (!shutDown.has(r.organizationId)) return true
    result.shutDown += 1
    return false
  })
  result.pending = live.length

  const queue = orderPendingForSweep(live).slice(0, max)
  if (queue.length < live.length) result.completed = false
  const budget = startBudget(opts.budgetMs ?? CUSTOM_DOMAIN_SWEEP_BUDGET_MS, clock())

  for (let i = 0; i < queue.length; i++) {
    const row = queue[i]
    if (i > 0) {
      // Checked BETWEEN rows, never inside one: a row is the atomic unit.
      if (budgetSpent(budget, clock())) {
        result.completed = false
        break
      }
      await sleep(pacingMs)
    }
    try {
      await sweepOne(row, check, now, result)
    } catch (err) {
      result.errors.push(row.organizationId)
      console.warn('[custom-domain] sweep: check failed for', row.organizationId, (err as Error)?.message)
      await reportAutomationFailure(row.organizationId, 'custom_domain', now)
    }
  }
  return result
}
