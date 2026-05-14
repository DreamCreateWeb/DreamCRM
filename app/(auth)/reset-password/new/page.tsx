export const metadata = {
  title: 'Set New Password - Dream Create',
  description: 'Choose a new password for your DreamCRM account.',
}

import { Suspense } from 'react'
import Link from 'next/link'
import AuthHeader from '../../auth-header'
import AuthImage from '../../auth-image'
import NewPasswordForm from './new-password-form'

export default function NewPasswordPage() {
  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative md:flex">

        {/* Content */}
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">

            <AuthHeader />

            <div className="max-w-sm mx-auto w-full px-4 py-8">
              <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">
                Set New Password
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Choose a strong password of at least 8 characters.
              </p>

              <Suspense>
                <NewPasswordForm />
              </Suspense>

              <div className="pt-5 mt-6 border-t border-gray-100 dark:border-gray-700/60">
                <div className="text-sm">
                  <Link
                    className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
                    href="/reset-password"
                  >
                    ← Request a new reset link
                  </Link>
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
