export const metadata = {
  title: 'Sign In - Dream Create',
  description: 'Sign in to your Dream Create dashboard',
}

import Link from 'next/link'
import AuthHeader from '../auth-header'
import AuthImage from '../auth-image'

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
              {/* Form */}
              <form>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="email">Email Address</label>
                    <input id="email" className="form-input w-full" type="email" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
                    <input id="password" className="form-input w-full" type="password" autoComplete="on" />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-6">
                  <div className="mr-1">
                    <Link className="text-sm underline hover:no-underline" href="/reset-password">Forgot Password?</Link>
                  </div>
                  <Link className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-3" href="/">Sign In</Link>
                </div>
              </form>
              {/* Footer */}
              <div className="pt-5 mt-6 border-t border-gray-100 dark:border-gray-700/60">
                <div className="text-sm">
                  Don't you have an account? <Link className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400" href="/signup">Sign Up</Link>
                </div>
                {/* Info */}
                <div className="mt-5">
                  <div className="bg-violet-500/20 text-violet-700 dark:text-violet-400 px-3 py-2 rounded-lg">
                    <svg className="inline w-3 h-3 shrink-0 fill-current mr-2" viewBox="0 0 12 12">
                      <path d="M6 0C2.7 0 0 2.7 0 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 10c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H5V3h2v4z" />
                    </svg>
                    <span className="text-sm">
                      Infrastructure for modern dental clinics. HIPAA-aligned &amp; built for Arkansas practices.
                    </span>
                  </div>
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
