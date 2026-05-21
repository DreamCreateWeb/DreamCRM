import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ComingSoon from '@/components/ui/coming-soon'

export const metadata = {
  title: 'SEO - DreamCRM',
}

export const dynamic = 'force-dynamic'

export default async function SeoPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  return (
    <ComingSoon
      title="SEO Dashboard"
      phase="Live (base) + Phase 3 (dashboard)"
      oneLiner="The technical SEO foundations — sitemap, robots.txt, JSON-LD Dentist schema, dynamic OG images, canonical URLs — are already shipped on every clinic site. This dashboard surfaces the visibility numbers."
      features={[
        'Per-page Google ranking + impression trend (via Search Console integration)',
        'Local-pack tracking: where you rank in Google Maps for "dentist near me"',
        'Page health: missing alt text, slow LCP, missing meta, broken links',
        'AI-suggested page-title + meta-description rewrites based on what ranks',
        'Schema validator: confirms your Dentist JSON-LD is valid + parsed',
      ]}
      matching="BrightLocal, Whitespark (local SEO) + Ahrefs/Semrush (technical SEO) — replaced by one built-in surface"
      todayAlternative={{
        label: 'Your site\'s SEO foundations are already live — check the public URL',
        href: '/settings/clinic',
      }}
    />
  )
}
