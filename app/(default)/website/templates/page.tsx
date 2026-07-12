import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getEffectiveWebsiteProfile, getWebsiteDraftStatus } from '@/lib/services/website-draft'
import { SITE_TEMPLATE_CATALOG } from '@/lib/site-templates/catalog'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import TemplatesGallery from './templates-gallery'
import PublishCard from '../publish-card'

export const metadata = {
  title: 'Website Templates - DreamCRM',
  description: 'Every site design, previewed live on your own content — organized by practice type.',
}

export const dynamic = 'force-dynamic'

/**
 * Website → Templates — the design gallery: every registered template as a
 * card with a LIVE preview of this clinic's own site rendered in that
 * template (a scaled same-origin iframe of the side-effect-free
 * /site/<slug>/tf/<id> frame route), organized by practice type with style
 * filters and sorting. Preview opens the editor's full preview flow; Apply
 * stages the design to the draft (Publish makes it live).
 */
export default async function WebsiteTemplatesPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/website')

  // Effective (draft-merged): a staged-but-unpublished design reads as current.
  const effective = await getEffectiveWebsiteProfile(ctx.organizationId)
  if (!effective) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <EmptyState
          icon="🎨"
          title="Your clinic profile isn’t set up yet"
          body="Finish setting up your clinic first — then every site design lives here, previewed on your own content."
          action={
            <ActionButton variant="primary" size="sm" href="/settings/clinic">
              Set up your clinic
            </ActionButton>
          }
        />
      </div>
    )
  }

  const draftStatus = await getWebsiteDraftStatus(ctx.organizationId).catch(() => ({ count: 0, changes: [] as { column: string; label: string }[] }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/website/design" className="hover:underline underline-offset-4">
            ‹ Design
          </Link>
        }
        title="Templates"
        subtitle="Every design, previewed live on your own content. Your content never belongs to a design — switching is instant and reversible."
        actions={
          <ActionButton variant="secondary" size="sm" href="/website/editor">
            Open the editor
          </ActionButton>
        }
      />
      {/* Publish state travels with every editing surface — saved-but-
          unpublished changes are visible wherever they were made. */}
      {draftStatus.count > 0 && (
        <PublishCard count={draftStatus.count} labels={draftStatus.changes.map((c) => c.label)} />
      )}
      <TemplatesGallery
        entries={SITE_TEMPLATE_CATALOG}
        currentId={effective.profile.template ?? 'modern'}
        slug={ctx.organizationSlug}
      />
    </div>
  )
}
