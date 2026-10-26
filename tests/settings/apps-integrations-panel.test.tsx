import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * /settings/apps — the connected-accounts view. These are PRESENTATION guards:
 * every status/health value shown must be backed by a real column (mailbox
 * sync_status / sync_error / last_sync_at / unread count), env-var integrations
 * a clinic can't touch read as administrator-managed (not a dead env-var
 * instruction), and the primary Connect action reads distinct from a
 * connected/managed state. The OAuth + disconnect wiring is untouched by design.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// disconnectMailbox is a server action — stub it so importing the panel doesn't
// pull the server module graph. (We never invoke it in these render tests.)
vi.mock('@/app/(default)/settings/apps/integration-actions', () => ({
  disconnectMailbox: vi.fn(),
}))

import IntegrationsPanel, { type Integration } from '@/app/(default)/settings/apps/integrations-panel'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { clinicStripeRowStatus } from '@/lib/billing-status'

function renderPanel(integrations: Integration[], tenantType: 'clinic' | 'platform' = 'clinic') {
  return render(
    <ConfirmProvider>
      <IntegrationsPanel integrations={integrations} tenantType={tenantType} />
    </ConfirmProvider>,
  )
}

const gmailConnected: Integration = {
  key: 'gmail',
  name: 'Gmail',
  category: 'Inbox',
  description: 'Connect a workspace mailbox.',
  icon: 'mail',
  accent: 'rose',
  status: { kind: 'connected', detail: '1 mailbox connected' },
  accounts: [
    {
      id: 'acc_1',
      label: 'Front Desk',
      sub: 'frontdesk@acme.com',
      syncStatus: 'ready',
      syncError: null,
      lastSyncAtIso: new Date(Date.now() - 5 * 60_000).toISOString(),
      unreadCount: 3,
    },
  ],
  connectHref: '/api/oauth/gmail/start',
  manageHref: '/inbox/settings',
}

const gmailAvailable: Integration = {
  key: 'gmail',
  name: 'Gmail',
  category: 'Inbox',
  description: 'Connect a workspace mailbox.',
  icon: 'mail',
  accent: 'rose',
  status: { kind: 'available', detail: 'No mailbox connected yet.' },
  accounts: [],
  connectHref: '/api/oauth/gmail/start',
  manageHref: '/inbox/settings',
}

describe('IntegrationsPanel — connected mailbox health (real columns)', () => {
  it('shows the mailbox address, an Active pill, a "Synced …" line and the live unread count', () => {
    renderPanel([gmailConnected])
    expect(screen.getByText('frontdesk@acme.com')).toBeTruthy()
    // sync_status='ready' → an ok-toned "Active" pill.
    const activePill = screen.getByText('Active')
    expect(activePill.getAttribute('data-tone')).toBe('ok')
    // last_sync_at present → a relative "Synced" line; unread=3 surfaces.
    expect(screen.getByText(/Synced .*ago/)).toBeTruthy()
    expect(screen.getByText('3 unread')).toBeTruthy()
    // Disconnect stays on the mailbox row.
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeTruthy()
  })

  it('never fabricates a "Synced" line when last_sync_at is null', () => {
    const noSync: Integration = {
      ...gmailConnected,
      accounts: [
        { id: 'acc_2', label: 'New Box', sub: 'new@acme.com', syncStatus: 'pending', syncError: null, lastSyncAtIso: null, unreadCount: 0 },
      ],
    }
    renderPanel([noSync])
    expect(screen.queryByText(/Synced/)).toBeNull()
    // pending → an in-flight (info) pill, not a fake "synced" claim.
    const pending = screen.getByText('First sync pending')
    expect(pending.getAttribute('data-tone')).toBe('info')
  })

  it('surfaces the real sync_error message (urgent) when a mailbox failed', () => {
    const errored: Integration = {
      ...gmailConnected,
      accounts: [
        { id: 'acc_3', label: 'Broken', sub: 'oops@acme.com', syncStatus: 'error', syncError: 'invalid_grant: token revoked', lastSyncAtIso: null, unreadCount: 0 },
      ],
    }
    renderPanel([errored])
    expect(screen.getByText('invalid_grant: token revoked')).toBeTruthy()
    expect(screen.getByText('Sync error').getAttribute('data-tone')).toBe('urgent')
  })
})

describe('IntegrationsPanel — Connect prominence', () => {
  it('an available integration shows a primary Connect (not "Add another")', () => {
    renderPanel([gmailAvailable])
    const connect = screen.getByRole('link', { name: 'Connect' }) as HTMLAnchorElement
    expect(connect.getAttribute('href')).toBe('/api/oauth/gmail/start')
    expect(screen.queryByRole('link', { name: /Add another/i })).toBeNull()
  })

  it('a connected integration steps the connect action down to "Add another mailbox"', () => {
    renderPanel([gmailConnected])
    // No bare "Connect" primary once mailboxes exist — it becomes secondary.
    expect(screen.queryByRole('link', { name: 'Connect' })).toBeNull()
    expect(screen.getByRole('link', { name: /Add another mailbox/i })).toBeTruthy()
  })
})

describe('IntegrationsPanel — administrator-managed env integrations', () => {
  it('shows a calm "Configured by your Dream Create administrator" line, no dead env-var text', () => {
    const managed: Integration = {
      key: 'anthropic',
      name: 'Anthropic',
      category: 'AI',
      description: 'Powers AI features.',
      icon: 'sparkle',
      accent: 'violet',
      status: { kind: 'misconfigured', managed: true },
      manageHref: 'https://console.anthropic.com',
    }
    renderPanel([managed], 'platform')
    // The per-card managed line (the platform intro copy also mentions the
    // administrator, so match the card line's trailing period specifically).
    expect(screen.getByText('Configured by your Dream Create administrator.')).toBeTruthy()
    // The old actionable-by-nobody instruction must be gone.
    expect(screen.queryByText(/env var/i)).toBeNull()
    // Status stays truthful (urgent "Not configured").
    expect(screen.getByText('Not configured').getAttribute('data-tone')).toBe('urgent')
  })
})

describe('IntegrationsPanel — empty', () => {
  it('renders the no-integrations empty state', () => {
    renderPanel([])
    expect(screen.getByText(/No integrations available/i)).toBeTruthy()
  })
})

/**
 * The clinic's Stripe row is READ from the billing columns
 * (lib/billing-status.ts `clinicStripeRowStatus`), never asserted — it used
 * to print "Connected · Subscription managed by Stripe" for every clinic,
 * including a no-card trial with no subscription and a comped clinic that
 * never has one (a status that cannot be false is a dishonest status).
 */
describe('IntegrationsPanel — the clinic Stripe row tells the billing truth', () => {
  const stripeRow = (input: Parameters<typeof clinicStripeRowStatus>[0]): Integration => {
    const row = clinicStripeRowStatus(input)
    return {
      key: 'stripe',
      name: 'Stripe',
      category: 'Billing',
      description: row.description,
      icon: 'card',
      accent: 'violet',
      status: row.status,
      ...(row.connectHref ? { connectHref: row.connectHref } : {}),
      manageHref: '/settings/billing',
    }
  }

  it('a no-card trial clinic reads "Not connected" with the trial named — never a green Connected pill', () => {
    renderPanel([stripeRow({ stripeSubscriptionId: null, subscriptionStatus: null, billingMode: 'self_serve', onTrial: true })])
    expect(screen.queryByText('Connected')).toBeNull()
    expect(screen.getByText('Not connected').getAttribute('data-tone')).toBe('neutral')
    expect(screen.getByText(/Free trial — no card on file yet/)).toBeTruthy()
    expect((screen.getByRole('link', { name: 'Connect' }) as HTMLAnchorElement).getAttribute('href')).toBe('/settings/billing')
  })

  it('a past-due subscription reads warn, not Connected', () => {
    renderPanel([stripeRow({ stripeSubscriptionId: 'sub_1', subscriptionStatus: 'past_due', billingMode: 'self_serve', onTrial: false })])
    expect(screen.queryByText('Connected')).toBeNull()
    expect(screen.getByText('Partial').getAttribute('data-tone')).toBe('warn')
    expect(screen.getByText(/Past due/)).toBeTruthy()
  })
})
