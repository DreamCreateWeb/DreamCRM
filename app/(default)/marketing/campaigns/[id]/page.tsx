import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { marketingTerminology } from '@/lib/marketing/terminology'
import { listAudiences, resolveAudience, type AudienceFilterT } from '@/lib/services/marketing'
import { getCampaignStats, getMarketingCampaign } from '@/lib/services/marketing-campaigns'
import { listOrgEmailAccounts } from '@/lib/services/mailbox'
import CampaignEditor from './campaign-editor'

export const metadata = {
  title: 'Campaign editor - DreamCRM',
}

export const dynamic = 'force-dynamic'

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
  const [audiences, gmailAccounts, stats] = await Promise.all([
    listAudiences(ctx.organizationId),
    listOrgEmailAccounts(ctx.organizationId).catch(() => []),
    getCampaignStats(id),
  ])

  const audienceCounts: Record<number, number> = {}
  for (const a of audiences) {
    const rows = await resolveAudience(ctx.organizationId, (a.filter ?? {}) as AudienceFilterT)
    audienceCounts[a.id] = rows.length
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/marketing/campaigns"
          className="text-[12px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          ← Campaigns
        </Link>
        <span className="text-stone-300 dark:text-stone-600">·</span>
        <span className="text-[12px] text-stone-500 dark:text-stone-400">
          {campaign.status} · {campaign.sendChannel}
        </span>
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
        }}
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
    </div>
  )
}
