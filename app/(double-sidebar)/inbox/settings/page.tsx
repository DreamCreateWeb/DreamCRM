import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured } from '@/lib/services/gmail'
import { listOrgEmailAccounts } from '@/lib/services/mailbox'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { clinicProfile } from '@/lib/db/schema/platform'
import SettingsPanel from './settings-panel'

export const metadata = {
  title: 'Inbox settings - DreamCRM',
  description: 'Manage connected email accounts',
}

export const dynamic = 'force-dynamic'

/** Raw OAuth error codes → copy a front desk can act on. */
function friendlyOAuthError(raw: string | null): string | null {
  if (!raw) return null
  if (raw === 'access_denied') {
    return 'Google connection was cancelled — no access was granted. You can try again whenever you’re ready.'
  }
  return raw
}

export default async function InboxSettings({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  const params = await searchParams
  const [accounts, profileRow] = await Promise.all([
    listOrgEmailAccounts(ctx.organizationId),
    ctx.tenantType === 'clinic'
      ? db
          .select({ emailSendingAccountId: clinicProfile.emailSendingAccountId })
          .from(clinicProfile)
          .where(eq(clinicProfile.organizationId, ctx.organizationId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ])

  return (
    <div className="grow overflow-y-auto bg-gray-50 dark:bg-gray-900/40">
      <SettingsPanel
        accounts={accounts}
        configured={gmailOAuthConfigured()}
        flash={{
          connectedEmail: params.connected ?? null,
          error: friendlyOAuthError(params.error ?? null),
        }}
        patientSender={{
          accountId: profileRow?.emailSendingAccountId ?? null,
          offerDesignation:
            ctx.tenantType === 'clinic' && (ctx.role === 'owner' || ctx.role === 'admin'),
        }}
      />
    </div>
  )
}
