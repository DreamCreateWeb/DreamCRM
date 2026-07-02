import { redirect } from 'next/navigation'
import { FlyoutProvider } from '@/app/flyout-context'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured } from '@/lib/services/gmail'
import {
  backfillRfcMessageIds,
  classifyPendingIntents,
  countMessagesByCategory,
  countMessagesByIntent,
  getThreadDetail,
  getThreadIdForMessage,
  listOrgEmailAccounts,
  listThreadsForOrg,
  resolvePendingInlineImages,
  syncAccount,
  type ListMessagesOpts,
} from '@/lib/services/mailbox'
import { getInboxPatientContext } from '@/lib/services/patient-context'
import { sanitizeEmailHtml } from '@/lib/email-sanitize'
import { inboxTerminology, type TenantType } from '@/lib/inbox-terminology'
import ConnectPrompt from './connect-prompt'
import MessagesSurfaceTabs from '../messages/surface-tabs'
import MailboxSidebar from './components/mailbox-sidebar'
import ThreadView from './components/thread-view'
import KeyboardHandler from './components/keyboard-handler'
import InboxLiveUpdater from './components/inbox-live-updater'
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
  // Clinic tenants reach /inbox via the Mailbox tab inside Messages, so they
  // get the surface tabs here too (a way back to Patients). Platform tenants
  // keep Inbox and Messages as separate surfaces — no tabs.
  const showSurfaceTabs = ctx.tenantType === 'clinic'
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
        <div className="flex flex-col h-full">
          {showSurfaceTabs && <MessagesSurfaceTabs active="mailbox" />}
          <div className="relative flex flex-1 min-h-0">
            <ConnectPrompt configured={gmailOAuthConfigured()} />
          </div>
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

  // Backfill the RFC Message-ID for messages ingested before migration
  // 0012 added the column. Without this, Reply on a pre-existing thread
  // sends without In-Reply-To/References and the recipient's mail
  // client opens it as a new conversation. The reply path also does a
  // just-in-time backfill on the specific message being replied to as
  // a belt-and-suspenders — this one drains the backlog over a few
  // visits so the rest of the inbox catches up too.
  await backfillRfcMessageIds(ctx.organizationId, { limit: 50 }).catch((err) => {
    console.warn('[inbox.page] rfc-id backfill failed:', (err as Error).message)
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

  const [threads, intentCounts, categoryCounts] = await Promise.all([
    listThreadsForOrg(ctx.organizationId, listOpts),
    countMessagesByIntent(ctx.organizationId),
    countMessagesByCategory(ctx.organizationId),
  ])
  const unreadCount = accounts.reduce((sum, a) => sum + a.unreadCount, 0)

  // The URL still uses `m=<messageId>` for back-compat with old notification
  // links — derive the thread containing that message and load it whole.
  const activeThreadId = activeMessageId
    ? await getThreadIdForMessage(activeMessageId, ctx.organizationId)
    : null
  const activeThread = activeThreadId
    ? await getThreadDetail(activeThreadId, ctx.organizationId)
    : null

  // Sanitize each message body server-side so the iframe renderer just emits.
  const sanitizedBodies: Record<string, string> = {}
  if (activeThread) {
    for (const m of activeThread.messages) {
      if (m.bodyHtml) sanitizedBodies[m.id] = sanitizeEmailHtml(m.bodyHtml)
    }
  }

  const patientContext = activeThread?.patientId
    ? await getInboxPatientContext(activeThread.patientId, ctx.organizationId)
    : null

  return (
    <FlyoutProvider initialState={true}>
      <SelectionProvider>
        <InboxLiveUpdater />
        <KeyboardHandler
          threadList={threads.map((t) => ({ threadId: t.threadId, latestMessageId: t.latestMessageId }))}
          activeThreadId={activeThread?.threadId ?? null}
          activeIsRead={activeThread ? activeThread.messages.every((m) => m.isRead) : true}
          activeIsStarred={activeThread ? activeThread.messages.some((m) => m.isStarred) : false}
          baseUrl={buildBaseUrl({ activeAccountId, activeCategory, activeIntent, unreadOnly, starredOnly, patientsOnly })}
        />
        <div className="flex flex-col h-full">
          {showSurfaceTabs && <MessagesSurfaceTabs active="mailbox" />}
          {/* Gmail push watch lapsed → new mail only arrives when the page
              syncs (open/refresh). Quiet strip so the degradation is VISIBLE
              instead of silent; the renew cron usually heals it within a day. */}
          {accounts.some((a) => !a.watchExpiresAt || new Date(a.watchExpiresAt).getTime() < Date.now()) && (
            <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
              Real-time delivery is paused for {accounts.length === 1 ? 'this mailbox' : 'a connected mailbox'} —
              new email still arrives each time you open or refresh the inbox, and live updates
              usually resume on their own within a day.
            </div>
          )}
          <div className="relative flex flex-1 min-h-0">
            <MailboxSidebar
              accounts={accounts}
              activeAccountId={activeAccountId}
              threads={threads}
              activeThreadId={activeThread?.threadId ?? null}
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
            <ThreadView
              thread={activeThread}
              sanitizedBodies={sanitizedBodies}
              patientContext={patientContext}
              terminology={terminology}
            />
          </div>
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
