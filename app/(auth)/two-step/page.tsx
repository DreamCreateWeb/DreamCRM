export const metadata = {
  title: 'Two-step sign-in - DreamCRM',
  description: 'Set up two-step sign-in for your account.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import AuthShell from '@/components/auth/auth-shell'
import { getServerSession } from '@/lib/session'
import EnrolClient from './enrol-client'

/**
 * The enrol page a REQUIRED person is sent to (the platform admin; staff of a
 * clinic whose owner turned the team switch on). It reads only the session —
 * never `getTenantContext` / `requireUser`, which redirect an un-enrolled
 * required person HERE — so it is the one signed-in page reachable until the
 * second factor is on.
 */
export default async function TwoStepPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/signin')
  const enrolled = (session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled === true
  if (enrolled) redirect('/')
  return (
    <AuthShell
      eyebrow="One more step"
      title="Set up two-step sign-in"
      subtitle="Your account needs a second step before you continue. It takes about a minute."
    >
      <EnrolClient />
    </AuthShell>
  )
}
