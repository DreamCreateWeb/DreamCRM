export const metadata = {
  title: 'Sign Up - Dream Create',
  description: 'Create your Dream Create account',
}

import AuthHeader from '../auth-header'
import AuthImage from '../auth-image'
import SignUpForm from './signup-form'

export default function SignUp() {
  return (
    <main className="bg-white dark:bg-gray-900">

      <div className="relative md:flex">

        {/* Content */}
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">

            <AuthHeader />

            <div className="max-w-sm mx-auto w-full px-4 py-8">
              <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6">Create your Account</h1>
              <SignUpForm />
            </div>

          </div>
        </div>

        <AuthImage />

      </div>

    </main>
  )
}
