import { redirect } from 'next/navigation'
import { FlyoutProvider } from '@/app/flyout-context'
import MailboxSidebar from './mailbox-sidebar'
import MessageView from './message-view'
import ConnectPrompt from './connect-prompt'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured } from '@/lib/services/gmail'
import {
  getMessageDetail,
  listMessagesForOrg,
  listOrgEmailAccounts,
  syncAccount,
} from '@/lib/services/mailbox'

export const metadata = {
  title: 'Inbox - DreamCRM',
  description: 'Email inbox',
}

export const dynamic = 'force-dynamic'

const AUTO_SYNC_STALE_MS = 60 * 1000 // refetch if last sync was > 60s ago

interface SP {
  account?: string
  m?: string
}

export default async function Inbox({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  let accounts = await listOrgEmailAccounts(ctx.organizationId)
  const params = await searchParams
  const activeAccountId = params.account && accounts.some((a) => a.id === params.account) ? params.account : null
  const activeMessageId = params.m ?? null

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

  const messages = await listMessagesForOrg(ctx.organizationId, {
    accountId: activeAccountId ?? undefined,
    folder: 'inbox',
  })

  const activeMessage = activeMessageId ? await getMessageDetail(activeMessageId, ctx.organizationId) : null

  return (
    <FlyoutProvider initialState={true}>
      <div className="relative flex h-full">
        <MailboxSidebar
          accounts={accounts}
          activeAccountId={activeAccountId}
          messages={messages}
          activeMessageId={activeMessage?.id ?? null}
        />
        <MessageView message={activeMessage} />
      </div>
    </FlyoutProvider>
  )
}
