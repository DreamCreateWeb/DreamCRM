export const metadata = {
  title: 'Sign In - DreamCRM',
  description: 'Sign in to your Dream Create dashboard.',
}

import { Suspense } from 'react'
import Link from 'next/link'
import AuthShell from '@/components/auth/auth-shell'
import SignInForm from './signin-form'

export default function SignIn() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your dashboard"
      subtitle="Your practice — website, schedule, patients, and messages — in one calm place."
      footer={
        <>
          New to Dream Create?{' '}
          <Link
            className="font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
            href="/signup"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  )
}
