import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getEffectiveWebsiteProfile, getWebsiteDraftStatus } from '@/lib/services/website-draft'
import { listLibraryForPicker } from '@/lib/services/service-library'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { contentSectionsFor, toContentSectionView } from '@/lib/website-content-sections'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import ContentWorkspace from './content-workspace'
import PublishCard from '../publish-card'

export const metadata = {
  title: 'Website Content - DreamCRM',
  description: 'Everything your site says — services, team, photos, FAQ, and policies, as plain forms.',
}

export const dynamic = 'force-dynamic'

/**
 * Website → Content — the plain-form home for everything the site SAYS.
 * The Studio's section modals stay as the quick in-context door; this page is
 * the sit-down door: a rail of every section with its honest state, one
 * section's editor at a time, per-section saves (each save rides the same
 * scoped actions + undo history the Studio uses, so nothing here can null
 * out a section it didn't touch). Redesigned 2026-10-15 — see
 * content-workspace.tsx for the shape and why.
 */
export default async function WebsiteContentPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/website')

  // The EFFECTIVE (draft-merged) profile — a staged edit reads back exactly
  // like a saved one on every editing surface.
  const effective = await getEffectiveWebsiteProfile(ctx.organizationId)
  const profile = effective?.profile

  if (!profile) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <EmptyState
          icon="🌐"
          title="Your clinic profile isn’t set up yet"
          body="Finish setting up your clinic first — then all your website content lives here."
          action={
            <ActionButton variant="primary" size="sm" href="/settings/clinic">
              Set up your clinic
            </ActionButton>
          }
        />
      </div>
    )
  }

  const library = await listLibraryForPicker(ctx.organizationId)
  const draftStatus = await getWebsiteDraftStatus(ctx.organizationId).catch(() => ({ count: 0, changes: [] as { column: string; label: string }[] }))

  const sections = contentSectionsFor(profile.template)
  const filledIds = sections.filter((s) => s.filled(profile)).map((s) => s.id)
  const summaries = Object.fromEntries(sections.map((s) => [s.id, s.summary(profile)]))
  const siteUrl = publicSiteUrl({ slug: ctx.organizationSlug ?? '', profile })

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/website" className="hover:underline underline-offset-4">
            ‹ Website
          </Link>
        }
        title="Content"
        subtitle="Everything your site says, one section at a time. Pick a section, save it, and publish when you’re ready."
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
      <div className="mb-8">
        <ContentWorkspace
          profile={profile}
          orgId={ctx.organizationId}
          library={library}
          sections={sections.map((s) => toContentSectionView(s, profile.template))}
          filledIds={filledIds}
          summaries={summaries}
          siteUrl={siteUrl}
        />
      </div>
    </div>
  )
}
