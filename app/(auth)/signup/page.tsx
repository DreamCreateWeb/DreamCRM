import { Suspense } from 'react'
import Link from 'next/link'
import AuthHeader from '../auth-header'
import AuthImage from '../auth-image'
import SignUpForm from './signup-form'

export const metadata = {
  title: 'Create your account — DreamCRM',
  description:
    'Set up your practice on DreamCRM: website, online booking, patient records, messages, and reviews in one calm system.',
}

export default function SignUp() {
  return (
    <main className="bg-white dark:bg-gray-900">

      <div className="relative md:flex">

        {/* Content */}
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">

            <AuthHeader />

            <div className="max-w-sm mx-auto w-full px-4 py-8">
              <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">Create your account</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                A few details now, then a quick practice setup — most clinics are live the same day.
              </p>
              <Suspense>
                <SignUpForm />
              </Suspense>
              {/* Footer */}
              <div className="pt-5 mt-6 border-t border-gray-100 dark:border-gray-700/60">
                <div className="text-sm">
                  Have an account? <Link className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400" href="/signin">Sign In</Link>
                </div>
              </div>
            </div>

          </div>
        </div>

        <AuthImage />

      </div>

    </main>
  )
}
