import SettingsSidebar from '../settings-sidebar'
import IntegrationsPanel, { type Integration } from './integrations-panel'
import { PageHeader } from '@/components/ui/page-header'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { listOrgEmailAccounts } from '@/lib/services/mailbox'
import { gmailOAuthConfigured } from '@/lib/services/gmail'

export const metadata = {
  title: 'Integrations - DreamCRM',
  description: 'Connected services for this workspace',
}

export const dynamic = 'force-dynamic'

export default async function AppsSettings() {
  await requireUser()
  const ctx = await getTenantContext()
  const tenantType = ctx?.tenantType ?? 'clinic'

  // ─── Gmail ───
  const gmailAccounts = ctx
    ? await listOrgEmailAccounts(ctx.organizationId).catch(() => [])
    : []
  const gmailReady = gmailOAuthConfigured()

  const integrations: Integration[] = []

  // Gmail (all tenants — clinic + platform both connect mailboxes; patient
  // tenants don't have a real workspace inbox but the row still shows the
  // family of features connected to their clinic).
  if (tenantType !== 'patient') {
    integrations.push({
      key: 'gmail',
      name: 'Gmail',
      category: 'Inbox',
      description:
        'Connect a workspace mailbox to power the unified inbox, AI triage, and outbound campaign sends.',
      icon: 'mail',
      accent: 'rose',
      status: gmailReady
        ? gmailAccounts.length > 0
          ? { kind: 'connected', detail: `${gmailAccounts.length} account${gmailAccounts.length === 1 ? '' : 's'} connected` }
          : { kind: 'available' }
        : { kind: 'misconfigured', detail: 'OAuth client not configured — set GOOGLE_OAUTH_* env vars.' },
      accounts: gmailAccounts.map((a) => ({ id: a.id, label: a.displayName ?? a.emailAddress, sub: a.emailAddress })),
      connectHref: '/api/oauth/gmail/start',
      manageHref: '/inbox/settings',
    })
  }

  // Stripe (clinic = paying customer / platform = SaaS owner)
  if (tenantType === 'clinic') {
    integrations.push({
      key: 'stripe',
      name: 'Stripe',
      category: 'Billing',
      description:
        'Your subscription is managed through Stripe. Use the Stripe customer portal to change card, update billing address, or download invoices.',
      icon: 'card',
      accent: 'sky',
      status: { kind: 'connected', detail: 'Subscription managed by Stripe' },
      manageHref: '/settings/billing',
    })
  } else if (tenantType === 'platform') {
    integrations.push({
      key: 'stripe',
      name: 'Stripe',
      category: 'Billing',
      description:
        'You collect clinic subscription revenue through Stripe. Manage prices, taxes, and webhooks in the Stripe dashboard.',
      icon: 'card',
      accent: 'sky',
      status: process.env.STRIPE_SECRET_KEY
        ? { kind: 'connected', detail: 'API key configured' }
        : { kind: 'misconfigured', detail: 'Set STRIPE_SECRET_KEY env var to enable.' },
      manageHref: 'https://dashboard.stripe.com',
    })
  }

  // Resend (platform-only — used for transactional + marketing email)
  if (tenantType === 'platform') {
    integrations.push({
      key: 'resend',
      name: 'Resend',
      category: 'Email',
      description:
        'Sends transactional and marketing email from Dream Create. Webhook handler at /api/webhooks/resend records bounces and complaints.',
      icon: 'send',
      accent: 'amber',
      status: process.env.RESEND_API_KEY
        ? process.env.RESEND_WEBHOOK_SECRET
          ? { kind: 'connected', detail: 'API key + webhook configured' }
          : { kind: 'partial', detail: 'API key set, webhook secret missing' }
        : { kind: 'misconfigured', detail: 'Set RESEND_API_KEY env var to enable.' },
      manageHref: 'https://resend.com/dashboard',
    })
  }

  // Anthropic (platform-only — powers AI triage, drafts, marketing AI)
  if (tenantType === 'platform') {
    integrations.push({
      key: 'anthropic',
      name: 'Anthropic',
      category: 'AI',
      description:
        'Powers inbox triage (Haiku), AI-drafted replies (Sonnet with adaptive thinking), and the marketing module copy assist.',
      icon: 'sparkle',
      accent: 'violet',
      status: process.env.ANTHROPIC_API_KEY
        ? { kind: 'connected', detail: 'API key configured' }
        : { kind: 'misconfigured', detail: 'Set ANTHROPIC_API_KEY env var to enable.' },
      manageHref: 'https://console.anthropic.com',
    })
  }

  // Google Pub/Sub (platform-only — powers real-time Gmail push notifications)
  if (tenantType === 'platform') {
    integrations.push({
      key: 'gcp-pubsub',
      name: 'Google Pub/Sub',
      category: 'Inbox',
      description:
        'Receives real-time push notifications from Gmail mailboxes so the inbox updates without polling. Daily cron renews the watch subscription.',
      icon: 'cloud',
      accent: 'emerald',
      status:
        process.env.GMAIL_PUBSUB_TOPIC && process.env.GMAIL_PUBSUB_SA_EMAIL
          ? { kind: 'connected', detail: 'Topic + service account configured' }
          : { kind: 'misconfigured', detail: 'Set GMAIL_PUBSUB_TOPIC and GMAIL_PUBSUB_SA_EMAIL to enable.' },
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Connected accounts" subtitle="External services connected to your workspace." />
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx?.tenantType} />
          <IntegrationsPanel integrations={integrations} tenantType={tenantType} />
        </div>
      </div>
    </div>
  )
}
