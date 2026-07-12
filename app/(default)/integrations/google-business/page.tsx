import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getZernioConnection } from '@/lib/services/zernio'
import { zernioConfigured } from '@/lib/zernio'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'
import { BrandLogo } from '@/components/integrations/brand-logos'
import GbpDetailControls from './gbp-detail-controls'
import GbpLocationPicker from './location-picker'

export const metadata = {
  title: 'Google Business Profile - Integrations - DreamCRM',
  description: 'Your connected Google Business Profile — reviews, hours, photos, and local search.',
}

export const dynamic = 'force-dynamic'

/**
 * Google Business detail page — a light management surface for the connected
 * GBP listing (the marketplace card's "Manage" links here). Shows the connected
 * account, links to where its value shows up (Reviews · Local search · the
 * Settings "Sync from Google" card), and the connect/refresh/disconnect
 * controls. GBP is free on every plan; owner/admin to mutate (enforced in the
 * actions). No plan gate on viewing.
 */
export default async function GoogleBusinessDetailPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const zernio = await getZernioConnection(ctx.organizationId)
  // Multi-location accounts: the header + everything downstream follow the
  // clinic's persisted pick (resolveGbpAccount uses the same rule).
  const account =
    zernio.googleBusinessAccounts.find((a) => a.id === zernio.preferredGbpAccountId) ??
    zernio.googleBusinessAccounts[0] ??
    null
  const connected = zernio.status === 'connected' && !!account
  const errored = zernio.status === 'error'
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  const backLink = (
    <Link
      href="/integrations"
      className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      All integrations
    </Link>
  )

  const pill = connected ? (
    <StatusPill tone="ok" label="Connected" />
  ) : errored ? (
    <StatusPill tone="urgent" label="Needs attention" />
  ) : (
    <StatusPill tone="neutral" label="Not connected" />
  )

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <div className="mb-4">{backLink}</div>

      <PageHeader
        eyebrow={`Google · ${ctx.organizationName}`}
        title="Google Business Profile"
        subtitle="Pull your reviews, verified hours, photos, and local search performance — through Zernio's secure sign-in. Free on every plan."
      />

      {/* ── Status panel ──────────────────────────────────────────────── */}
      <section className="v2-panel p-5 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-11 h-11 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-[#4285F4]/10 ring-1 ring-inset ring-[#4285F4]/25">
            <BrandLogo id="googlebusiness" size={26} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {connected ? account?.displayName || account?.username || 'Your Google Business listing' : 'Google Business Profile'}
              </h2>
              {pill}
            </div>
            {connected && account?.username && account?.displayName && (
              <p className="text-sm text-gray-500 dark:text-gray-400 font-mono-num truncate">{account.username}</p>
            )}
            {connected && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Synced through Zernio — reviews, hours, photos, and local metrics update automatically.
              </p>
            )}
          </div>
        </div>

        {connected && zernio.googleBusinessAccounts.length > 1 && account && (
          <GbpLocationPicker
            accounts={zernio.googleBusinessAccounts.map((a) => ({
              id: a.id,
              label: a.displayName || a.username || a.id,
            }))}
            selectedId={account.id}
            canManage={canManage}
          />
        )}

        <GbpDetailControls connected={connected} configured={zernioConfigured()} />
      </section>

      {/* ── Where it shows up ─────────────────────────────────────────── */}
      {connected ? (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Where this shows up</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ValueLink
              href="/growth/reviews/received"
              title="Reviews"
              body="Read &amp; reply to your Google reviews. They power your public star rating."
            />
            <ValueLink
              href="/website/seo"
              title="Local search"
              body="Impressions, calls, directions &amp; website clicks from Google."
            />
            <ValueLink
              href="/settings/clinic"
              title="Sync from Google"
              body="Pull verified hours, address, phone &amp; photos into your site."
            />
          </div>
        </section>
      ) : (
        <section className="v2-well p-5">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">What you get when you connect</h2>
          <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 mt-2">
            <li>· Your real Google reviews, with one-click replies — and a legit star rating on your website.</li>
            <li>· Verified hours, address, phone &amp; photos synced into your site automatically.</li>
            <li>· Local search performance: impressions, calls, directions &amp; website clicks.</li>
          </ul>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            No Google API verification paperwork on your end — Zernio handles the secure sign-in.
          </p>
        </section>
      )}

      {zernio.lastError && (
        <p className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2">
          {zernio.lastError}
        </p>
      )}
    </div>
  )
}

function ValueLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="block h-full">
      <div className="v2-card-interactive p-4 h-full">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{body}</p>
      </div>
    </Link>
  )
}
