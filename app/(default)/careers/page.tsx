import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ComingSoon from '@/components/ui/coming-soon'

export const metadata = {
  title: 'Careers - DreamCRM',
}

export const dynamic = 'force-dynamic'

export default async function CareersPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  return (
    <ComingSoon
      title="Careers Page"
      phase="Phase 1 (website CMS)"
      oneLiner="Post hygienist, assistant, and front-desk openings on your own site. Replace the $400/mo dental-jobs board with a built-in hiring page."
      features={[
        'Job postings with structured data so Google for Jobs indexes them',
        'Application form with resume upload (Vercel Blob)',
        'Reviewer workflow: new / phone-screen / interview / hired / passed',
        'Per-role optional video pitch from the practice owner',
        'Automatic share to Indeed + DentalPost via integrations (Phase 4)',
      ]}
      matching="DentalPost, Cloud Dentistry, ZipRecruiter — except those are paid job boards. Yours is a private hiring channel."
      todayAlternative={{
        label: 'Add team members under your clinic profile',
        href: '/settings/clinic',
      }}
    />
  )
}
