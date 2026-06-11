import Link from 'next/link'
import Logo from '@/components/ui/logo'

export default function OnboardingHeader() {
  return (
    <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
      <Logo />
      <div className="text-sm">
        Have an account? <Link className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300" href="/signin">Sign In</Link>
      </div>
    </div>
  )
}
