export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listPendingInvitations } from '@/lib/services/messages'
import SettingsHome, { type TileBadge } from './settings-home'

export const metadata = { title: 'Settings - DreamCRM' }

// `/settings` is the card-grid home (the settings navigation). Patient/partner
// tenants don't have a settings surface → send them to their own home.
export default async function SettingsIndex() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' && ctx.tenantType !== 'platform') redirect('/')

  // Live state for the tiles that HAVE state — an invite waiting or a trial
  // running is exactly what a settings home should surface. Best-effort.
  const invitations = await listPendingInvitations(ctx.organizationId).catch(() => [])
  const badges: Record<string, TileBadge> = {}
  if (invitations.length > 0) {
    badges['/settings/team'] = {
      tone: 'warn',
      label: `${invitations.length} invite${invitations.length === 1 ? '' : 's'} pending`,
    }
  }
  if (ctx.onTrial && ctx.trialEndsAt) {
    const daysLeft = Math.max(
      0,
      Math.ceil((ctx.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    )
    badges['/settings/billing'] = {
      tone: 'warn',
      label: `Trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
    }
  }

  return (
    <SettingsHome
      tenantType={ctx.tenantType === 'platform' ? 'platform' : 'clinic'}
      badges={badges}
    />
  )
}
