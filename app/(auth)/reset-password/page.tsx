export const metadata = {
  title: 'Reset Password - Mosaic',
  description: 'Page description',
}

import AuthHeader from '../auth-header'
import AuthImage from '../auth-image'
import ResetForm from './reset-form'

export default function ResetPassword() {
  return (
    <main className="bg-white dark:bg-gray-900">

      <div className="relative md:flex">

        {/* Content */}
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">

            <AuthHeader />

            <div className="max-w-sm mx-auto w-full px-4 py-8">
              <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6">Reset your Password</h1>
              <ResetForm />
            </div>

          </div>
        </div>

        <AuthImage />

      </div>

    </main>
  )
}
