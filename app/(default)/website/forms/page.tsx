import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { listLeads, getNewLeadsSince } from '@/lib/services/leads'
import { resolveLeadForm, LEAD_FORM_LABELS, type LeadFormsConfig, type LeadFormKey } from '@/lib/types/lead-forms'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import FormsPanel from './forms-panel'

export const metadata = {
  title: 'Website Forms - DreamCRM',
  description: 'The forms on your site, what they ask, and where the submissions land.',
}

export const dynamic = 'force-dynamic'

/**
 * Website → Forms — the site's intake points in one place: what each form
 * asks (the same builders the editor opens in a modal), the "Message us"
 * bubble (moved from its odd home in Practice settings — it renders on every
 * public page), and where submissions land (Leads).
 */
export default async function WebsiteFormsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/website')

  const [profile] = await db
    .select({
      leadForms: clinicProfile.leadForms,
      chatWidgetEnabled: clinicProfile.chatWidgetEnabled,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  if (!profile) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <EmptyState
          icon="🌐"
          title="Your clinic profile isn’t set up yet"
          body="Finish setting up your clinic first — then your site’s forms live here."
          action={
            <ActionButton variant="primary" size="sm" href="/settings/clinic">
              Set up your clinic
            </ActionButton>
          }
        />
      </div>
    )
  }

  const config = (profile.leadForms as LeadFormsConfig | null) ?? null
  const forms = (['contact', 'insurance_verifier'] as LeadFormKey[]).map((key) => ({
    key,
    label: LEAD_FORM_LABELS[key],
    fields: resolveLeadForm(config, key),
    customized: !!config?.[key],
  }))

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [recent, count7d] = await Promise.all([
    listLeads(ctx.organizationId, { limit: 5 }).catch(() => []),
    getNewLeadsSince(ctx.organizationId, since7d).catch(() => 0),
  ])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/website" className="hover:underline underline-offset-4">
            ‹ Website
          </Link>
        }
        title="Forms"
        subtitle="What your site asks visitors, and where their answers land."
        actions={
          <ActionButton variant="secondary" size="sm" href="/leads">
            All leads →
          </ActionButton>
        }
      />
      <FormsPanel
        forms={forms}
        chatEnabled={profile.chatWidgetEnabled}
        recent={recent.map((l) => ({
          id: l.id,
          name: l.name,
          status: l.status,
          ageHours: l.ageHours,
          sourcePage: l.sourcePage,
        }))}
        count7d={count7d}
      />
    </div>
  )
}
