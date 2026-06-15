import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import type { ZernioConnectionView } from '@/lib/types/zernio'

/**
 * Google Business Profile status card for the Integrations page. As of the
 * Channels surface (Phase 3 PR 2), connecting / disconnecting Google Business
 * (and every social channel) lives on the Channels page — the single
 * connection-management surface. This card no longer carries its own connect /
 * disconnect buttons (no competing controls); it shows the current GBP status +
 * a link to Channels. Demo connections render their seeded "connected" state.
 */
export default function GoogleBusinessCard({
  connection,
  configured,
}: {
  connection: ZernioConnectionView
  configured: boolean
}) {
  const connected = connection.status === 'connected' && connection.googleBusinessAccounts.length > 0
  const account = connection.googleBusinessAccounts[0]

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Google &amp; social</h2>
      <div className="v2-panel p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-[color:var(--color-brand-soft,theme(colors.teal.500/15))] text-teal-700 dark:text-teal-300 text-lg">
            📍
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Google Business Profile</h3>
              {connected ? (
                <StatusPill tone="ok" label="Connected" />
              ) : connection.status === 'error' ? (
                <StatusPill tone="urgent" label="Needs attention" />
              ) : (
                <StatusPill tone="neutral" label="Not connected" />
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your Google reviews, verified hours, photos, and local search stats — plus Instagram, Facebook, and more —
              connect on the Channels page.
            </p>
          </div>
        </div>

        {connected && (
          <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-3 py-2.5 mb-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {account?.displayName || account?.username || 'Your Google Business listing'}
            </p>
            {account?.username && account?.displayName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono-num">{account.username}</p>
            )}
          </div>
        )}

        {configured ? (
          <ActionButton variant={connected ? 'secondary' : 'primary'} size="sm" href="/channels">
            {connected ? 'Manage channels' : 'Connect on the Channels page'}
          </ActionButton>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            Google Business isn&apos;t enabled on this DreamCRM instance yet.
          </p>
        )}
      </div>
    </section>
  )
}
