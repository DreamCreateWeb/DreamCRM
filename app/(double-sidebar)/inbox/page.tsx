import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { FlyoutProvider } from '@/app/flyout-context'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured } from '@/lib/services/gmail'
import {
  countMessagesByCategory,
  countMessagesByIntent,
  getThreadDetail,
  getThreadIdForMessage,
  listOrgEmailAccounts,
  listThreadsForOrg,
  type ListMessagesOpts,
} from '@/lib/services/mailbox'
import { kickMailboxSync, markMailboxesWanted } from '@/lib/services/gmail-sync'
import { getInboxPatientContext } from '@/lib/services/patient-context'
import { sanitizeEmailHtml } from '@/lib/email-sanitize'
import { inboxTerminology, type TenantType } from '@/lib/inbox-terminology'
import ConnectPrompt from './connect-prompt'
import MessagesSurfaceTabs from '../messages/surface-tabs'
import MailboxSidebar from './components/mailbox-sidebar'
import ThreadView from './components/thread-view'
import KeyboardHandler from './components/keyboard-handler'
import InboxLiveUpdater from './components/inbox-live-updater'
import SyncedLine from './components/synced-line'
import { SelectionProvider } from './components/selection-context'

export const metadata = {
  title: 'Inbox - DreamCRM',
  description: 'Email inbox',
}

export const dynamic = 'force-dynamic'

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
  if (ctx.tenantType === 'caller') redirect('/calls')

  const accounts = await listOrgEmailAccounts(ctx.organizationId)
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

  // THE PAGE IS A VIEW OF WHAT WE ALREADY HAVE (ML-59). No Gmail call and no
  // backfill on this request: stamp the mailbox as wanted (one cheap UPDATE —
  // the 5-minute sync sweep serves wanted mailboxes first) and kick a
  // rate-aware, idempotent background sync AFTER the response. The list below
  // reads the database only; the live updater refreshes it when a sync lands.
  await markMailboxesWanted(ctx.organizationId, { accountId: activeAccountId })
  after(() => kickMailboxSync(ctx.organizationId, { accountId: activeAccountId }))

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
              new email still arrives every few minutes, and live updates usually resume on
              their own within a day.
            </div>
          )}
          <SyncedLine
            accounts={accounts.map((a) => ({
              lastSyncAt: a.lastSyncAt ? new Date(a.lastSyncAt).toISOString() : null,
              syncStatus: a.syncStatus,
            }))}
          />
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
