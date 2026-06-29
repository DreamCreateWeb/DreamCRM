export const metadata = {
  title: 'Reset Password - DreamCRM',
  description: 'Reset your Dream Create password.',
}

import { Suspense } from 'react'
import Link from 'next/link'
import AuthShell from '@/components/auth/auth-shell'
import ResetForm from './reset-form'

export default function ResetPassword() {
  return (
    <AuthShell
      eyebrow="Password reset"
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link
            className="font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
            href="/signin"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  )
}
