import 'server-only'

/**
 * DNS-provider detection for the self-serve custom-domain flow.
 *
 * Given a clinic's domain we look up its authoritative nameservers (via DNS
 * over HTTPS — the server has NAT egress, and it's best-effort so a failure
 * just falls back to generic guidance) and match them to a known registrar/DNS
 * host. That lets the settings card show provider-specific instructions + a
 * deep link to the right DNS panel, and make the apex ALIAS-vs-forwarding call
 * for the clinic instead of making them guess.
 *
 * Nothing here is load-bearing for routing — it's pure UX help. All lookups are
 * wrapped and return null on any failure.
 */

export interface DnsProviderInfo {
  id: string
  /** Human name shown in the card ("GoDaddy"). */
  name: string
  /** Deep link to the provider's DNS-records panel (may be a generic help URL). */
  dnsPanelUrl: string
  /** One warm line on where records live in this provider's UI. */
  addRecordHelp: string
  /** Whether the provider supports an ALIAS/ANAME (or CNAME flattening) at the
   *  apex. When false, the card steers the clinic to apex→www forwarding. */
  supportsApexAlias: boolean
}

export interface DnsDetection {
  /** Matched provider, or null when we couldn't identify it. */
  provider: DnsProviderInfo | null
  /** The domain's authoritative nameservers (lowercased), for display/debug. */
  nameservers: string[]
  /** True when the domain advertises Domain Connect (_domainconnect TXT) — a
   *  signal that a future one-click apply could work there. Informational. */
  domainConnect: boolean
}

/**
 * Known providers, matched by a substring in any authoritative nameserver host.
 * Ordered most-specific-first. `supportsApexAlias` reflects whether the apex can
 * point at an App Runner hostname directly (ALIAS/ANAME/flattening) vs. needing
 * forwarding.
 */
const PROVIDERS: Array<DnsProviderInfo & { nsMatch: string[] }> = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    nsMatch: ['cloudflare.com'],
    dnsPanelUrl: 'https://dash.cloudflare.com/',
    addRecordHelp: 'In Cloudflare, open your domain → DNS → Records → Add record. Cloudflare flattens the apex automatically, so the “@” record works as a CNAME here.',
    supportsApexAlias: true,
  },
  {
    id: 'route53',
    name: 'AWS Route 53',
    nsMatch: ['awsdns'],
    dnsPanelUrl: 'https://console.aws.amazon.com/route53/v2/hostedzones',
    addRecordHelp: 'In Route 53, open the hosted zone → Create record. For “@”, choose the Alias toggle and point it at the value below.',
    supportsApexAlias: true,
  },
  {
    id: 'dreamhost',
    name: 'DreamHost',
    nsMatch: ['dreamhost.com'],
    dnsPanelUrl: 'https://panel.dreamhost.com/index.cgi?tree=domain.manage',
    addRecordHelp: 'In the DreamHost panel, go to Domains → Manage Domains → DNS, and add these under Custom DNS Records. DreamHost supports the ALIAS record for “@”.',
    supportsApexAlias: true,
  },
  {
    id: 'namecheap',
    name: 'Namecheap',
    nsMatch: ['registrar-servers.com'],
    dnsPanelUrl: 'https://ap.www.namecheap.com/domains/list/',
    addRecordHelp: 'In Namecheap, open Domain List → Manage → Advanced DNS → Add New Record. Use the ALIAS Record type for “@”.',
    supportsApexAlias: true,
  },
  {
    id: 'ionos',
    name: 'IONOS',
    nsMatch: ['ui-dns.'],
    dnsPanelUrl: 'https://my.ionos.com/domains',
    addRecordHelp: 'In IONOS, open your domain → DNS, and add these records. IONOS supports an ALIAS-style record for the “@” root.',
    supportsApexAlias: true,
  },
  {
    id: 'godaddy',
    name: 'GoDaddy',
    nsMatch: ['domaincontrol.com'],
    dnsPanelUrl: 'https://dcc.godaddy.com/control/portfolio',
    addRecordHelp: 'In GoDaddy, open your domain → DNS → DNS Records → Add. GoDaddy has no ALIAS record, so for the bare domain use their Forwarding tool (Domain → Forwarding) to send it to your www address.',
    supportsApexAlias: false,
  },
  {
    id: 'google',
    name: 'Google Domains / Squarespace',
    nsMatch: ['googledomains.com', 'google.com'],
    dnsPanelUrl: 'https://domains.squarespace.com/',
    addRecordHelp: 'Open your domain’s DNS settings and add these records. There’s no ALIAS at the root, so set the bare domain to forward to your www address.',
    supportsApexAlias: false,
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    nsMatch: ['squarespacedns.com'],
    dnsPanelUrl: 'https://account.squarespace.com/domains',
    addRecordHelp: 'In Squarespace, open the domain → DNS Settings → Add record. Use a forward for the bare domain (no ALIAS at the root).',
    supportsApexAlias: false,
  },
  {
    id: 'wix',
    name: 'Wix',
    nsMatch: ['wixdns.net'],
    dnsPanelUrl: 'https://www.wix.com/my-account/domains',
    addRecordHelp: 'In Wix, open the domain → Manage DNS Records → Add. Wix has no ALIAS, so forward the bare domain to your www address.',
    supportsApexAlias: false,
  },
  {
    id: 'networksolutions',
    name: 'Network Solutions',
    nsMatch: ['worldnic.com'],
    dnsPanelUrl: 'https://www.networksolutions.com/my-account/',
    addRecordHelp: 'In Network Solutions, open Advanced DNS and add these records. Use domain forwarding for the bare domain.',
    supportsApexAlias: false,
  },
  {
    id: 'bluehost',
    name: 'Bluehost',
    nsMatch: ['bluehost.com'],
    dnsPanelUrl: 'https://my.bluehost.com/',
    addRecordHelp: 'In Bluehost, open Domains → your domain → DNS, and add these records. Use forwarding for the bare domain.',
    supportsApexAlias: false,
  },
  {
    id: 'namecom',
    name: 'Name.com',
    nsMatch: ['name.com'],
    dnsPanelUrl: 'https://www.name.com/account/domains',
    addRecordHelp: 'In Name.com, open the domain → DNS Records. Name.com supports an ALIAS record for the “@” root.',
    supportsApexAlias: true,
  },
]

/**
 * Pure: match a set of nameserver hosts to a known provider (or null). Exposed
 * for tests — the substring match against `nsMatch` is the whole heuristic.
 */
export function matchProviderByNameservers(nameservers: string[]): DnsProviderInfo | null {
  const hosts = nameservers.map((h) => h.trim().replace(/\.$/, '').toLowerCase()).filter(Boolean)
  for (const p of PROVIDERS) {
    if (hosts.some((h) => p.nsMatch.some((m) => h.includes(m)))) {
      const { nsMatch: _nsMatch, ...info } = p
      return info
    }
  }
  return null
}

/** DNS-over-HTTPS query (Google) → array of record data strings. Best-effort. */
async function doh(name: string, type: string): Promise<string[]> {
  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const data = (await res.json()) as { Answer?: Array<{ data?: string }> }
    return (data.Answer ?? []).map((a) => a.data ?? '').filter(Boolean)
  } catch {
    return []
  }
}

/** The apex (registrable root) of a host — best-effort last-two-labels. */
function apexOf(host: string): string {
  const labels = host.trim().replace(/\.$/, '').toLowerCase().split('.')
  return labels.length <= 2 ? labels.join('.') : labels.slice(-2).join('.')
}

/**
 * Detect the DNS provider for a domain. Looks up NS at the apex + checks for a
 * `_domainconnect` TXT record. Never throws — returns nulls on any failure.
 */
export async function detectDnsProvider(domain: string): Promise<DnsDetection> {
  const apex = apexOf(domain)
  const [nsAnswers, dcAnswers] = await Promise.all([
    doh(apex, 'NS'),
    doh(`_domainconnect.${apex}`, 'TXT'),
  ])
  const nameservers = nsAnswers.map((n) => n.replace(/\.$/, '').toLowerCase())
  return {
    provider: matchProviderByNameservers(nameservers),
    nameservers,
    domainConnect: dcAnswers.length > 0,
  }
}
