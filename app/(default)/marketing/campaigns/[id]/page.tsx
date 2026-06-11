import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { marketingTerminology } from '@/lib/marketing/terminology'
import {
  listAudiences,
  resolveAudience,
  type AudienceFilterT,
  type PatientAudienceFilterT,
} from '@/lib/services/marketing'
import {
  getCampaignStats,
  getMarketingCampaign,
  getRecipientBreakdown,
} from '@/lib/services/marketing-campaigns'
import { listOrgEmailAccounts } from '@/lib/services/mailbox'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import CampaignEditor from './campaign-editor'
import RecipientsTable from './recipients-table'
import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'

export const metadata = {
  title: 'Campaign editor - DreamCRM',
}

export const dynamic = 'force-dynamic'

// Mirrors the tone map in ../page.tsx (campaign list). draft = inert,
// scheduled/active = in flight (info), completed = sent + done (ok).
const CAMPAIGN_STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  scheduled: 'info',
  active: 'info',
  completed: 'ok',
  paused: 'neutral',
}

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Sending',
  completed: 'Sent',
  paused: 'Paused',
}

function channelLabel(channel: string): string {
  switch (channel) {
    case 'resend': return 'Email (branded)'
    case 'gmail': return 'From your Gmail'
    case 'twilio_sms': return 'SMS'
    default: return channel
  }
}

export default async function CampaignEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id)) notFound()

  const campaign = await getMarketingCampaign(ctx.organizationId, id)
  if (!campaign) notFound()

  const t = marketingTerminology(ctx.tenantType)
  const [audiences, gmailAccounts, stats, recipients, sender] = await Promise.all([
    listAudiences(ctx.organizationId),
    listOrgEmailAccounts(ctx.organizationId).catch(() => []),
    getCampaignStats(id),
    getRecipientBreakdown(id),
    // Only the clinic timezone is needed here (a hint next to the scheduler).
    getClinicSenderIdentity(ctx.organizationId).catch(() => null),
  ])

  const sent = campaign.status === 'completed' || campaign.status === 'active'

  const audienceCounts: Record<number, number> = {}
  for (const a of audiences) {
    const rows = await resolveAudience(ctx.organizationId, {
      recipientSource: (a.recipientSource ?? 'customers') as 'customers' | 'patients',
      filter: (a.filter ?? {}) as AudienceFilterT,
      patientFilter: (a.patientFilter ?? {}) as PatientAudienceFilterT,
    })
    audienceCounts[a.id] = rows.length
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/marketing/campaigns"
          className="text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
        >
          ← Campaigns
        </Link>
        <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
        <StatusPill
          tone={CAMPAIGN_STATUS_TONE[campaign.status] ?? 'neutral'}
          label={CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status}
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">{channelLabel(campaign.sendChannel)}</span>
      </div>

      <CampaignEditor
        campaign={{
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject ?? '',
          previewText: campaign.previewText ?? '',
          bodyHtml: campaign.bodyHtml ?? '',
          bodyJson: campaign.bodyJson as Record<string, unknown> | null,
          audienceId: campaign.audienceId,
          sendChannel: campaign.sendChannel,
          status: campaign.status,
          sentAt: campaign.sentAt ? campaign.sentAt.toISOString() : null,
          scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
        }}
        clinicTimeZone={sender?.timeZone ?? 'America/New_York'}
        audiences={audiences.map((a) => ({
          id: a.id,
          name: a.name,
          recipientCount: audienceCounts[a.id] ?? 0,
        }))}
        gmailAccounts={gmailAccounts.map((g) => ({
          id: g.id,
          emailAddress: g.emailAddress,
          displayName: g.displayName,
        }))}
        defaultFromEmail={t.defaultFromEmail}
        stats={stats}
      />

      {sent && recipients.length > 0 && (
        <div className="mt-4">
          <RecipientsTable
            rows={recipients.map((r) => ({
              email: r.email,
              sentAt: r.sentAt?.toISOString() ?? null,
              openedAt: r.openedAt?.toISOString() ?? null,
              clickedAt: r.clickedAt?.toISOString() ?? null,
              bouncedAt: r.bouncedAt?.toISOString() ?? null,
              unsubAt: r.unsubAt?.toISOString() ?? null,
              failedAt: r.failedAt?.toISOString() ?? null,
            }))}
          />
        </div>
      )}
    </div>
  )
}
