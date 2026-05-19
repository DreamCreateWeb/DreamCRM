import { redirect } from 'next/navigation'
import { FlyoutProvider } from '@/app/flyout-context'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured } from '@/lib/services/gmail'
import {
  classifyPendingIntents,
  countMessagesByCategory,
  countMessagesByIntent,
  getMessageDetail,
  listMessagesForOrg,
  listOrgEmailAccounts,
  resolvePendingInlineImages,
  syncAccount,
  type ListMessagesOpts,
} from '@/lib/services/mailbox'
import { getInboxPatientContext } from '@/lib/services/patient-context'
import { sanitizeEmailHtml } from '@/lib/email-sanitize'
import { inboxTerminology, type TenantType } from '@/lib/inbox-terminology'
import ConnectPrompt from './connect-prompt'
import MailboxSidebar from './components/mailbox-sidebar'
import MessageView from './components/message-view'
import KeyboardHandler from './components/keyboard-handler'
import { SelectionProvider } from './components/selection-context'

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
  cat?: string // 'primary' (default) | 'updates' | 'promotions' | 'spam'
}

const VALID_CATEGORIES = new Set(['primary', 'updates', 'promotions', 'spam'])

export default async function Inbox({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  let accounts = await listOrgEmailAccounts(ctx.organizationId)
  const params = await searchParams
  const activeAccountId = params.account && accounts.some((a) => a.id === params.account) ? params.account : null
  const activeMessageId = params.m ?? null
  const terminology = inboxTerminology(ctx.tenantType as TenantType)
  const activeCategory = params.cat && VALID_CATEGORIES.has(params.cat) ? params.cat : 'primary'
  // Intent filter only applies inside the Primary tab — on other tabs the
  // intent buckets aren't meaningful (everything in Promotions is marketing).
  const activeIntent = activeCategory === 'primary' ? (params.intent ?? null) : null
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

  // Always poke the classifier on page load — covers the case where a sync
  // was skipped (recent lastSyncAt) but there's still a backlog of
  // unclassified messages from a recent schema migration. Cheap when nothing
  // is pending (returns immediately).
  await classifyPendingIntents(ctx.organizationId, { limit: 50 }).catch((err) => {
    console.warn('[inbox.page] classify call failed:', (err as Error).message)
  })

  // Backfill inline images for messages ingested before resolveInlineImages
  // was wired in. Bounded to 10 per load so it doesn't blow up page latency
  // — self-terminates as the backlog drains.
  await resolvePendingInlineImages(ctx.organizationId, { limit: 10 }).catch((err) => {
    console.warn('[inbox.page] inline-image backfill failed:', (err as Error).message)
  })

  const listOpts: ListMessagesOpts = {
    accountId: activeAccountId ?? undefined,
    folder: 'inbox',
    intent: activeIntent ?? undefined,
    category: activeCategory,
    unreadOnly,
    starredOnly,
    patientsOnly,
  }

  const [messages, intentCounts, categoryCounts] = await Promise.all([
    listMessagesForOrg(ctx.organizationId, listOpts),
    countMessagesByIntent(ctx.organizationId),
    countMessagesByCategory(ctx.organizationId),
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
      <SelectionProvider>
        <KeyboardHandler
          messageIds={messages.map((m) => m.id)}
          activeMessageId={activeMessage?.id ?? null}
          activeIsRead={activeMessage?.isRead ?? true}
          activeIsStarred={activeMessage?.isStarred ?? false}
          baseUrl={buildBaseUrl({ activeAccountId, activeCategory, activeIntent, unreadOnly, starredOnly, patientsOnly })}
        />
        <div className="relative flex h-full">
          <MailboxSidebar
            accounts={accounts}
            activeAccountId={activeAccountId}
            messages={messages}
            activeMessageId={activeMessage?.id ?? null}
            intentCounts={intentCounts}
            categoryCounts={categoryCounts}
            activeCategory={activeCategory}
            activeIntent={activeIntent}
            unreadOnly={unreadOnly}
            starredOnly={starredOnly}
            patientsOnly={patientsOnly}
            unreadCount={unreadCount}
            terminology={terminology}
          />
          <MessageView
            message={activeMessage}
            bodyHtml={sanitizedHtml}
            patientContext={patientContext}
            accountId={activeMessage?.accountId ?? null}
            terminology={terminology}
          />
        </div>
      </SelectionProvider>
    </FlyoutProvider>
  )
}

// Reconstruct the URL the keyboard handler should navigate to without the
// `m=` (message id) so j/k navigation can append it. Keeps filter state
// stable as you cursor through the list.
function buildBaseUrl(s: {
  activeAccountId: string | null
  activeCategory: string
  activeIntent: string | null
  unreadOnly: boolean
  starredOnly: boolean
  patientsOnly: boolean
}): string {
  const p = new URLSearchParams()
  if (s.activeAccountId) p.set('account', s.activeAccountId)
  if (s.activeCategory !== 'primary') p.set('cat', s.activeCategory)
  if (s.activeIntent) p.set('intent', s.activeIntent)
  if (s.unreadOnly) p.set('view', 'unread')
  if (s.starredOnly) p.set('view', 'starred')
  if (s.patientsOnly) p.set('patients', '1')
  const qs = p.toString()
  return qs ? `/inbox?${qs}` : '/inbox'
}
