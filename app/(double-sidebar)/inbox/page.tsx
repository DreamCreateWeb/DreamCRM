import { redirect } from 'next/navigation'
import { FlyoutProvider } from '@/app/flyout-context'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured } from '@/lib/services/gmail'
import {
  countMessagesByIntent,
  getMessageDetail,
  listMessagesForOrg,
  listOrgEmailAccounts,
  syncAccount,
  type ListMessagesOpts,
} from '@/lib/services/mailbox'
import { getInboxPatientContext } from '@/lib/services/patient-context'
import { sanitizeEmailHtml } from '@/lib/email-sanitize'
import ConnectPrompt from './connect-prompt'
import MailboxSidebar from './components/mailbox-sidebar'
import MessageView from './components/message-view'
import KeyboardHandler from './components/keyboard-handler'

export const metadata = {
  title: 'Inbox - DreamCRM',
  description: 'Email inbox',
}

export const dynamic = 'force-dynamic'

const AUTO_SYNC_STALE_MS = 60 * 1000 // refetch if last sync was > 60s ago

interface SP {
  account?: string
  m?: string
  intent?: string
  view?: string // 'unread' | 'starred'
  patients?: string
}

export default async function Inbox({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  let accounts = await listOrgEmailAccounts(ctx.organizationId)
  const params = await searchParams
  const activeAccountId = params.account && accounts.some((a) => a.id === params.account) ? params.account : null
  const activeMessageId = params.m ?? null
  const activeIntent = params.intent ?? null
  const unreadOnly = params.view === 'unread'
  const starredOnly = params.view === 'starred'
  const patientsOnly = params.patients === '1'

  if (accounts.length === 0) {
    return (
      <FlyoutProvider>
        <div className="relative flex h-full">
          <ConnectPrompt configured={gmailOAuthConfigured()} />
        </div>
      </FlyoutProvider>
    )
  }

  // Auto-sync any account whose last sync is stale or has never synced. This
  // catches the case where the fire-and-forget initial sync from the OAuth
  // callback was killed by the serverless function returning early.
  const now = Date.now()
  const stale = accounts.filter((a) => {
    if (activeAccountId && a.id !== activeAccountId) return false
    if (a.syncStatus === 'syncing') return false
    if (!a.lastSyncAt) return true
    return now - new Date(a.lastSyncAt).getTime() > AUTO_SYNC_STALE_MS
  })
  if (stale.length > 0) {
    await Promise.allSettled(
      stale.map((a) => syncAccount(a.id, ctx.organizationId, { limit: 50 })),
    )
    accounts = await listOrgEmailAccounts(ctx.organizationId)
  }

  const listOpts: ListMessagesOpts = {
    accountId: activeAccountId ?? undefined,
    folder: 'inbox',
    intent: activeIntent ?? undefined,
    unreadOnly,
    starredOnly,
    patientsOnly,
  }

  const [messages, intentCounts] = await Promise.all([
    listMessagesForOrg(ctx.organizationId, listOpts),
    countMessagesByIntent(ctx.organizationId),
  ])
  const unreadCount = accounts.reduce((sum, a) => sum + a.unreadCount, 0)

  const activeMessage = activeMessageId ? await getMessageDetail(activeMessageId, ctx.organizationId) : null

  // Sanitize the HTML body server-side so the client component just renders.
  const sanitizedHtml = activeMessage?.bodyHtml ? sanitizeEmailHtml(activeMessage.bodyHtml) : null

  // Patient context for the side panel — only if the active message matches.
  const patientContext = activeMessage?.patientId
    ? await getInboxPatientContext(activeMessage.patientId, ctx.organizationId)
    : null

  return (
    <FlyoutProvider initialState={true}>
      <KeyboardHandler
        messageIds={messages.map((m) => m.id)}
        activeMessageId={activeMessage?.id ?? null}
        activeIsRead={activeMessage?.isRead ?? true}
        activeIsStarred={activeMessage?.isStarred ?? false}
        baseUrl={buildBaseUrl({ activeAccountId, activeIntent, unreadOnly, starredOnly, patientsOnly })}
      />
      <div className="relative flex h-full">
        <MailboxSidebar
          accounts={accounts}
          activeAccountId={activeAccountId}
          messages={messages}
          activeMessageId={activeMessage?.id ?? null}
          intentCounts={intentCounts}
          activeIntent={activeIntent}
          unreadOnly={unreadOnly}
          starredOnly={starredOnly}
          patientsOnly={patientsOnly}
          unreadCount={unreadCount}
        />
        <MessageView
          message={activeMessage}
          bodyHtml={sanitizedHtml}
          patientContext={patientContext}
          accountId={activeMessage?.accountId ?? null}
        />
      </div>
    </FlyoutProvider>
  )
}

// Reconstruct the URL the keyboard handler should navigate to without the
// `m=` (message id) so j/k navigation can append it. Keeps filter state
// stable as you cursor through the list.
function buildBaseUrl(s: {
  activeAccountId: string | null
  activeIntent: string | null
  unreadOnly: boolean
  starredOnly: boolean
  patientsOnly: boolean
}): string {
  const p = new URLSearchParams()
  if (s.activeAccountId) p.set('account', s.activeAccountId)
  if (s.activeIntent) p.set('intent', s.activeIntent)
  if (s.unreadOnly) p.set('view', 'unread')
  if (s.starredOnly) p.set('view', 'starred')
  if (s.patientsOnly) p.set('patients', '1')
  const qs = p.toString()
  return qs ? `/inbox?${qs}` : '/inbox'
}
