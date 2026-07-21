import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listMarketingCampaigns } from '@/lib/services/marketing-campaigns'
import { listAudiences } from '@/lib/services/marketing'
import { formatRelativeDate } from '@/lib/utils/format'
import NewCampaignButton from './new-campaign-button'
import CancelScheduledButton from './cancel-scheduled-button'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import type { Tone } from '@/lib/ui/encodings'

export const metadata = {
  title: 'Campaigns - DreamCRM',
  description: 'Marketing campaigns',
}

export const dynamic = 'force-dynamic'

// Tone contract: draft = inert (neutral), scheduled = queued/in-flight
// (info), active = sending now (info), completed = sent + done (ok),
// paused = parked (neutral). No status carries warn/urgent — a campaign's
// own state never demands the front desk act on it.
const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  scheduled: 'info',
  active: 'info',
  completed: 'ok',
  paused: 'neutral',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Sending',
  completed: 'Sent',
  paused: 'Paused',
}

const STATUS_MEANING: Record<string, string> = {
  draft: "Saved, not sent — nobody's received it yet",
  scheduled: 'Queued to go out at a set time',
  active: 'Sending to recipients right now',
  completed: 'Delivered — opens and clicks are tracking',
  paused: 'Parked mid-flight; resume when ready',
}

const STATUS_ORDER = ['draft', 'scheduled', 'active', 'completed', 'paused'] as const

/** User-facing label for the send channel. Hides vendor names (Resend) +
 * surfaces the deliverability story instead (Email vs. From your Gmail). */
function channelLabel(channel: string): string {
  switch (channel) {
    case 'resend': return 'Email (branded)'
    case 'gmail': return 'From your Gmail'
    case 'twilio_sms': return 'SMS'
    default: return channel
  }
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill_audience?: string; prefill_template?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  const { prefill_audience, prefill_template } = await searchParams

  // Phase-3 fold: the clinic's campaign home is the Outreach hub — this
  // standalone list serves ONLY the platform tenant now. Clinic hits (old
  // bookmarks, stale deep links) forward with their prefill params intact,
  // so a queue CTA from a cached page still lands pre-targeted. The [id]
  // editor below this route is untouched and serves both tenants.
  if (ctx.tenantType === 'clinic') {
    const qs = new URLSearchParams()
    if (prefill_audience) qs.set('prefill_audience', prefill_audience)
    if (prefill_template) qs.set('prefill_template', prefill_template)
    redirect(`/growth/outreach${qs.size > 0 ? `?${qs}` : ''}`)
  }

  const campaigns = await listMarketingCampaigns(ctx.organizationId)
  // Platform composes from blank (the dental templates would be wrong) —
  // the picker hides itself when no templates are passed.
  const templates: never[] = []
  const prefillAudienceId =
    prefill_audience && Number.isFinite(Number(prefill_audience)) ? Number(prefill_audience) : undefined
  const prefillTemplateId =
    prefill_template && Number.isFinite(Number(prefill_template)) ? Number(prefill_template) : undefined

  // "To" picker in the modal — the platform org's customer audiences.
  const audiences = (await listAudiences(ctx.organizationId))
    .filter((a) => (a.recipientSource ?? 'customers') === 'customers')
    .map((a) => ({ id: a.id, name: a.name }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/growth" className="hover:underline underline-offset-4">
            ‹ Growth
          </Link>
        }
        title="Campaigns"
        subtitle="Email campaigns you've drafted, scheduled, or sent."
        legend={
          <EncodingLegend
            pills={STATUS_ORDER.map((s) => ({
              tone: STATUS_TONE[s],
              label: STATUS_LABEL[s],
              meaning: STATUS_MEANING[s],
            }))}
          />
        }
        actions={
          <>
            <ActionButton variant="secondary" href="/growth/audiences">
              Audiences
            </ActionButton>
            <NewCampaignButton
              templates={templates}
              audiences={audiences}
              prefillAudienceId={prefillAudienceId}
              prefillTemplateId={prefillTemplateId}
            />
          </>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon="✉️"
          title="No campaigns yet."
          body='Use "+ New campaign" above to start your first email — name it, pick who it goes to, and write.'
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="v2-well border-b border-[color:var(--color-hairline)]">
              <tr className="text-left text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[color:var(--color-hairline)] last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/growth/campaigns/${c.id}`}
                      className="font-medium text-gray-800 dark:text-gray-100 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 max-w-[24rem] truncate">
                    {c.subject || <span className="italic text-gray-400 dark:text-gray-500">no subject</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusPill
                        tone={STATUS_TONE[c.status] ?? 'neutral'}
                        label={STATUS_LABEL[c.status] ?? c.status}
                        title={STATUS_MEANING[c.status]}
                      />
                      {c.status === 'scheduled' && <CancelScheduledButton campaignId={c.id} />}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                    {channelLabel(c.sendChannel)}
                  </td>
                  <td
                    className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums"
                    suppressHydrationWarning
                  >
                    {c.sentAt
                      ? formatRelativeDate(c.sentAt)
                      : c.status === 'scheduled' && c.scheduledAt
                        ? `→ ${formatRelativeDate(c.scheduledAt)}`
                        : '—'}
                  </td>
                  <td
                    className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums"
                    suppressHydrationWarning
                  >
                    {formatRelativeDate(c.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
