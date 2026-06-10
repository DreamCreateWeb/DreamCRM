import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getServerSession } from '@/lib/session'
import MarketingHome from '@/components/marketing/marketing-home'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'DreamCRM — the all-in-one front office for dental practices',
  description:
    'Website, online booking, patient portal, messages, reviews, recall, and a shop — one calm system wrapped around the PMS you already run. From $99/mo.',
  openGraph: {
    title: 'DreamCRM — the all-in-one front office for dental practices',
    description:
      'Replace five or six subscriptions with one system: website, booking, patient portal, communications, reviews, recall, and a shop. Keep your PMS.',
    type: 'website',
  },
}

/**
 * Root of www.dreamcreatestudio.com:
 *   - signed-out visitors get the marketing site (this is the front door),
 *   - patients land in their clinic's portal,
 *   - clinic staff + platform admins land on their dashboard,
 *   - a signed-up user who abandoned onboarding resumes it (previously this
 *     bounced them to /signin in a loop).
 */
export default async function Home() {
  const ctx = await getTenantContext()
  if (ctx) {
    if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
    redirect('/dashboard')
  }

  // Session but no resolvable tenant = signup that never finished onboarding.
  const session = await getServerSession()
  if (session?.user) redirect('/onboarding-01')

  return <MarketingHome />
}
