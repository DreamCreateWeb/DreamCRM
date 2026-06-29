import { Suspense } from 'react'
import Link from 'next/link'
import AuthShell from '@/components/auth/auth-shell'
import SignUpForm from './signup-form'

export const metadata = {
  title: 'Create your account — DreamCRM',
  description:
    'Set up your practice on Dream Create: website, online booking, patient records, messages, and reviews in one calm system.',
}

export default function SignUp() {
  return (
    <AuthShell
      eyebrow="Start your practice"
      title="Create your account"
      subtitle="A few details now, then a quick practice setup — most clinics are live the same day."
      footer={
        <>
          Already have an account?{' '}
          <Link
            className="font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
            href="/signin"
          >
            Sign in
          </Link>
        </>
      }
    >
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  )
}
