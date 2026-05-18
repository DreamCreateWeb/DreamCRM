import { redirect } from 'next/navigation'
import { FlyoutProvider } from '@/app/flyout-context'
import MailboxSidebar from './mailbox-sidebar'
import MessageView from './message-view'
import ConnectPrompt from './connect-prompt'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured } from '@/lib/services/gmail'
import { getMessageDetail, listMessagesForOrg, listOrgEmailAccounts } from '@/lib/services/mailbox'

export const metadata = {
  title: 'Inbox - DreamCRM',
  description: 'Email inbox',
}

export const dynamic = 'force-dynamic'

interface SP {
  account?: string
  m?: string
}

export default async function Inbox({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  const accounts = await listOrgEmailAccounts(ctx.organizationId)
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
