import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getAutomationTemplate } from '@/lib/services/marketing-templates'
import { isRetentionKind, RETENTION_KIND_LABELS } from '@/lib/types/retention'
import { PageHeader } from '@/components/ui/page-header'
import AutomationMessageEditor from './message-editor'

export const metadata = {
  title: 'Automation message - DreamCRM',
  description: 'Read and edit the message this automation sends',
}

export const dynamic = 'force-dynamic'

/** Cadence + audience facts per kind — shown so the clinic knows exactly
 *  when this message goes out and to whom (honesty over mystery). */
const KIND_FACTS: Record<string, { cadence: string; audience: string }> = {
  birthday: { cadence: 'Sends daily', audience: "patients whose birthday is today (email opt-in only)" },
  reactivation: { cadence: 'Sends monthly', audience: 'patients whose last visit was 9–10 months ago' },
  benefits: { cadence: 'Sends monthly, October–December', audience: 'insured patients with no upcoming visit and 4+ months since the last' },
  welcome: { cadence: 'Sends weekly', audience: 'patients whose first visit was in the past 7 days' },
}

export default async function AutomationMessagePage({
  params,
}: {
  params: Promise<{ kind: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/marketing')

  const { kind } = await params
  if (!isRetentionKind(kind)) notFound()

  const message = await getAutomationTemplate(ctx.organizationId, kind)
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'
  const facts = KIND_FACTS[kind]

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/growth/outreach" className="hover:underline underline-offset-4">
            ‹ Recall &amp; Outreach
          </Link>
        }
        title={`${RETENTION_KIND_LABELS[kind]} — the message`}
        subtitle={`${facts.cadence} to ${facts.audience}. This is the exact email that goes out under your name — edit anything.`}
      />
      <AutomationMessageEditor
        kind={kind}
        initial={{ subject: message.subject, previewText: message.previewText ?? '', bodyHtml: message.bodyHtml }}
        isCustom={message.isCustom}
        canManage={canManage}
      />
    </div>
  )
}
