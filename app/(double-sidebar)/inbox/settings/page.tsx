import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured } from '@/lib/services/gmail'
import { listOrgEmailAccounts } from '@/lib/services/mailbox'
import SettingsPanel from './settings-panel'

export const metadata = {
  title: 'Inbox settings - DreamCRM',
  description: 'Manage connected email accounts',
}

export const dynamic = 'force-dynamic'

export default async function InboxSettings({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  const accounts = await listOrgEmailAccounts(ctx.organizationId)
  const params = await searchParams

  return (
    <div className="grow overflow-y-auto bg-gray-50 dark:bg-gray-900/40">
      <SettingsPanel
        accounts={accounts}
        configured={gmailOAuthConfigured()}
        flash={{
          connectedEmail: params.connected ?? null,
          error: params.error ?? null,
        }}
      />
    </div>
  )
}
