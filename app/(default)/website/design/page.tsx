import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { mergeWebsiteDraft } from '@/lib/website-draft'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import DesignPanel from './design-panel'

export const metadata = {
  title: 'Website Design - DreamCRM',
  description: 'Your site’s look — design, brand color, and hero media.',
}

export const dynamic = 'force-dynamic'

/**
 * Website → Design — the site's look-and-feel in one place: the design
 * (template) picker with preview-on-your-own-content, brand color, hero
 * media, and the intro video. The editor keeps its quick 🎨 picker — same
 * actions, two doors. The logo stays with the Business profile (it's shared
 * identity: site header, email, and dashboard chrome).
 */
export default async function WebsiteDesignPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/website')

  // Narrow select + draft merge: the design surface shows what the editor
  // has staged (a saved-but-unpublished design/color reads back as current).
  const [row] = await db
    .select({
      template: clinicProfile.template,
      brandColor: clinicProfile.brandColor,
      heroImageUrl: clinicProfile.heroImageUrl,
      heroImageUrl2: clinicProfile.heroImageUrl2,
      differenceVideoUrl: clinicProfile.differenceVideoUrl,
      imagePositions: clinicProfile.imagePositions,
      websiteDraft: clinicProfile.websiteDraft,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  const profile = row ? mergeWebsiteDraft(row, row.websiteDraft) : undefined

  if (!profile) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <EmptyState
          icon="🎨"
          title="Your clinic profile isn’t set up yet"
          body="Finish setting up your clinic first — then your site’s design lives here."
          action={
            <ActionButton variant="primary" size="sm" href="/settings/clinic">
              Set up your clinic
            </ActionButton>
          }
        />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/website" className="hover:underline underline-offset-4">
            ‹ Website
          </Link>
        }
        title="Design"
        subtitle="How your site looks. Your content never belongs to a design — switching is instant and reversible."
        actions={
          <ActionButton variant="secondary" size="sm" href="/website/editor">
            Open the editor
          </ActionButton>
        }
      />
      <DesignPanel
        currentTemplate={profile.template ?? 'modern'}
        brandColor={profile.brandColor}
        heroImageUrl={profile.heroImageUrl}
        heroImageUrl2={profile.heroImageUrl2}
        differenceVideoUrl={profile.differenceVideoUrl}
        imagePositions={(profile.imagePositions as Record<string, string> | null) ?? {}}
      />
    </div>
  )
}
