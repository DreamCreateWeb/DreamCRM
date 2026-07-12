import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { listLibraryForPicker } from '@/lib/services/service-library'
import { contentSectionsFor } from '@/lib/website-content-sections'
import ClinicSettingsNav, { type NavGroup } from '../../settings/clinic/clinic-settings-nav'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import ContentPanel from './content-panel'

export const metadata = {
  title: 'Website Content - DreamCRM',
  description: 'Everything your site says — services, team, photos, FAQ, and policies, as plain forms.',
}

export const dynamic = 'force-dynamic'

/**
 * Website → Content — the plain-form home for everything the site SAYS.
 * The Studio's section modals stay as the quick in-context door; this page is
 * the sit-down door: every section at once, per-section saves (each save
 * rides the same scoped actions + undo history the Studio uses, so nothing
 * here can null out a section it didn't touch).
 */
export default async function WebsiteContentPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/website')

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

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
  const sections = contentSectionsFor(profile.template)
  const navGroups: NavGroup[] = [
    {
      label: 'Content',
      items: sections
        .filter((s) => !['insurance', 'methods', 'financing', 'cancellation'].includes(s.id))
        .map((s) => ({ id: s.id, label: s.label })),
    },
    {
      label: 'Insurance & payments',
      items: sections
        .filter((s) => ['insurance', 'methods', 'financing', 'cancellation'].includes(s.id))
        .map((s) => ({ id: s.id, label: s.label })),
    },
  ]

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/website" className="hover:underline underline-offset-4">
            ‹ Website
          </Link>
        }
        title="Content"
        subtitle="Everything your site says, as plain forms. Prefer editing in place? The same sections open right on the page in the editor."
        actions={
          <ActionButton variant="secondary" size="sm" href="/website/editor">
            Open the editor
          </ActionButton>
        }
      />
      <ClinicSettingsNav groups={navGroups} />
      <div className="v2-panel mb-8">
        <ContentPanel profile={profile} orgId={ctx.organizationId} library={library} />
      </div>
    </div>
  )
}
