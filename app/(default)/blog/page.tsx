import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ComingSoon from '@/components/ui/coming-soon'

export const metadata = {
  title: 'Blog - DreamCRM',
}

export const dynamic = 'force-dynamic'

export default async function BlogPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  return (
    <ComingSoon
      title="Blog Posts"
      phase="Phase 1 (website CMS)"
      oneLiner="Publish patient-facing content — oral health tips, new-treatment announcements, staff spotlights — directly to your DreamCRM-hosted website."
      features={[
        'Tiptap rich editor with image upload + embed support',
        'SEO meta + Open Graph image generation per post',
        'Draft / scheduled / published lifecycle, with preview links',
        'Category + tag taxonomy, with archive pages auto-generated',
        'RSS feed for syndication; structured data for Google News',
        'AI-assisted drafts grounded in your clinic\'s voice + services',
      ]}
      matching="ProSites, PBHS, GreatDentalWebsites (the dental-website incumbents)"
      todayAlternative={{
        label: 'Edit your clinic site content',
        href: '/settings/clinic',
      }}
    />
  )
}
