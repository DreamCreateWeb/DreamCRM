import AuthShell from '@/components/auth/auth-shell'

export const metadata = {
  title: 'Patient portal',
  // A door, not content — keep it out of the index.
  robots: { index: false, follow: false },
}

/**
 * The generic patient door: where a timed-out portal session lands when this
 * browser has no remembered clinic. Deliberately NOT the staff sign-in — no
 * "Create an account", no clinic signup. A portal belongs to a practice, so
 * the honest way forward is that practice's own link.
 */
export default async function PatientPortalDoor({
  searchParams,
}: {
  searchParams?: Promise<{ expired?: string }>
}) {
  const expired = (await searchParams)?.expired === '1'
  return (
    <AuthShell
      eyebrow="Patient portal"
      title={expired ? 'Your session ended' : 'Sign in to your patient portal'}
      subtitle={
        expired
          ? 'For your privacy, we signed you out after a while. Use your dental office’s portal link — from their website, a text, an email or your appointment card — to sign in again.'
          : 'Each practice has its own portal. Use the portal link from your dental office’s website, a text, an email or your appointment card.'
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Can’t find it? Call your dental office and they’ll point you to it.
      </p>
    </AuthShell>
  )
}
