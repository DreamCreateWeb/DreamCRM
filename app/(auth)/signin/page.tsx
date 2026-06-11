export const metadata = {
  title: 'Sign In - DreamCRM',
  description: 'Page description',
}

import { Suspense } from 'react'
import Link from 'next/link'
import AuthHeader from '../auth-header'
import AuthImage from '../auth-image'
import SignInForm from './signin-form'

export default function SignIn() {
  return (
    <main className="bg-white dark:bg-gray-900">

      <div className="relative md:flex">

        {/* Content */}
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">

            <AuthHeader />

            <div className="max-w-sm mx-auto w-full px-4 py-8">
              <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6">Welcome back!</h1>
              <Suspense fallback={null}>
                <SignInForm />
              </Suspense>
              <div className="pt-5 mt-6 border-t border-gray-100 dark:border-gray-700/60">
                <div className="text-sm">
                  Don&apos;t have an account? <Link className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300" href="/signup">Sign Up</Link>
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
