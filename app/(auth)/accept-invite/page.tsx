'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { authClient } from '@/lib/auth/client'
import AuthHeader from '../auth-header'
import AuthImage from '../auth-image'

function AcceptInviteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    if (!token) {
      setErrorMsg('Invalid invitation link — no token found.')
      setStatus('error')
      return
    }

    authClient.organization.acceptInvitation({ invitationId: token })
      .then((result) => {
        if (result.error) {
          setErrorMsg(result.error.message ?? 'This invitation is invalid or has expired.')
          setStatus('error')
          return
        }
        const name = (result.data as { invitation?: { organizationId?: string }; organization?: { name?: string } } | null)
          ?.organization?.name ?? ''
        setOrgName(name)
        setStatus('success')
      })
      .catch(() => {
        setErrorMsg('Something went wrong. Please try again or ask for a new invitation.')
        setStatus('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div className="max-w-sm mx-auto w-full px-4 py-8">
      {status === 'loading' && (
        <>
          <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-4">Accepting invitation…</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Please wait a moment.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 mb-6">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">You're in!</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            {orgName ? `You've joined ${orgName} on DreamCRM.` : "You've successfully joined the organization."}
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="btn w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            Go to dashboard
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/20 mb-6">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">Invitation failed</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">{errorMsg}</p>
          <button
            onClick={() => router.push('/signin')}
            className="btn w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            Back to sign in
          </button>
        </>
      )}
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative md:flex">
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">
            <AuthHeader />
            <Suspense fallback={<div className="max-w-sm mx-auto w-full px-4 py-8 text-sm text-gray-400">Loading…</div>}>
              <AcceptInviteInner />
            </Suspense>
          </div>
        </div>
        <AuthImage />
      </div>
    </main>
  )
}
