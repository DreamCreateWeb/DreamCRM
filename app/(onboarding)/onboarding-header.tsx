import Link from 'next/link'
import Logo from '@/components/ui/logo'

export default function OnboardingHeader({ showSignIn = false }: { showSignIn?: boolean } = {}) {
  return (
    <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
      <Logo />
      {/* The "Sign In" link only makes sense before there's a session — and
          every onboarding step runs AFTER signup signs the owner in, so the
          default is now hidden (it used to show "Have an account? Sign In" to
          an already-signed-in owner on steps 1–4). Opt in explicitly if a
          genuinely signed-out surface ever mounts this header. */}
      {showSignIn && (
        <div className="text-sm">
          Have an account?{' '}
          <Link
            className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
            href="/signin"
          >
            Sign In
          </Link>
        </div>
      )}
    </div>
  )
}
