'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveAccount } from '../actions'
import { changeEmail } from '@/lib/auth/client'
import { ActionButton } from '@/components/ui/action-button'

interface InitialUser {
  id: string
  name: string
  email: string
  image: string | null
  companyName: string | null
  city: string | null
  postalCode: string | null
  streetAddress: string | null
  country: string | null
}

export default function AccountPanel({ initialUser }: { initialUser: InitialUser }) {
  const router = useRouter()
  const [name, setName] = useState(initialUser.name)
  const [companyName, setCompanyName] = useState(initialUser.companyName ?? '')
  const [location, setLocation] = useState(initialUser.city ?? '')
  // Email is its own flow — it doesn't ride the profile Save. Changing it
  // routes through better-auth's verified changeEmail (a confirmation link to
  // the current mailbox); the new address only takes effect after that click,
  // so `currentEmail` keeps showing what's actually on the account.
  const currentEmail = initialUser.email
  const [email, setEmail] = useState(initialUser.email)
  const [image, setImage] = useState(initialUser.image)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [emailPending, startEmailTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)
  // Set after a successful changeEmail request — surfaces the pending-confirm
  // state inline ("verify the link we sent") until the user confirms.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [emailFeedback, setEmailFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setFeedback(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'avatars')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Upload failed')
      }
      const json = (await res.json()) as { url: string }
      setImage(json.url)
    } catch (err) {
      setFeedback({ error: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      try {
        // Email is intentionally NOT sent here — it has its own verified flow.
        await saveAccount({
          name,
          companyName: companyName || null,
          city: location || null,
          image: image || null,
        })
        setFeedback({ ok: 'Saved' })
        router.refresh()
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function handleEmailChange(e: React.FormEvent) {
    e.preventDefault()
    setEmailFeedback(null)
    const next = email.trim()
    if (!next || next.toLowerCase() === currentEmail.toLowerCase()) {
      setEmailFeedback({ error: 'Enter a different email address.' })
      return
    }
    startEmailTransition(async () => {
      // better-auth sends a confirmation link (to the current mailbox when the
      // account is verified, otherwise a verification link to the new address).
      // Nothing changes on the account until that link is clicked.
      const { error } = await changeEmail({ newEmail: next, callbackURL: '/settings/account' })
      if (error) {
        setEmailFeedback({ error: error.message ?? 'Could not start the email change. Please try again.' })
        return
      }
      setPendingEmail(next)
      setEmailFeedback(null)
    })
  }

  return (
    <div className="grow">
      <div className="p-6 space-y-6">
        <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-5">My Account</h2>

        <section>
          <div className="flex items-center">
            <div className="mr-4">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="w-20 h-20 rounded-full object-cover" src={image} alt={name} />
              ) : (
                <div className="w-20 h-20 rounded-full bg-violet-200 dark:bg-violet-500/30 flex items-center justify-center text-2xl font-semibold text-violet-700 dark:text-violet-200">
                  {(name?.[0] ?? 'U').toUpperCase()}
                </div>
              )}
            </div>
            <label className="btn-sm dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300 cursor-pointer">
              {uploading ? 'Uploading…' : 'Change'}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
          </div>
        </section>

        <form id="account-form" onSubmit={handleSubmit} className="space-y-6">
          <section>
            <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Profile</h2>
            <div className="text-sm text-gray-500 dark:text-gray-400">Update your display name, company and address.</div>
            <div className="sm:flex sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mt-5">
              <div className="sm:w-1/2">
                <label className="block text-sm font-medium mb-1" htmlFor="acct-name">Full Name</label>
                <input id="acct-name" className="form-input w-full" type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="sm:w-1/2">
                <label className="block text-sm font-medium mb-1" htmlFor="acct-company">Business Name</label>
                <input id="acct-company" className="form-input w-full" type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1" htmlFor="acct-location">Location</label>
              <input id="acct-location" className="form-input w-full sm:w-1/2" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </section>
        </form>

        {/* Email is its own verified flow — separate form, separate button, so it
            never piggybacks on the profile Save. */}
        <section>
          <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Email</h2>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Used for sign-in and account notifications. Changing it sends a confirmation link — your sign-in email
            stays <span className="font-medium text-gray-700 dark:text-gray-300">{currentEmail}</span> until you confirm.
          </div>
          {pendingEmail ? (
            <div className="mt-5 text-sm text-sky-700 dark:text-sky-300 bg-sky-500/10 px-3 py-3 rounded">
              <p className="font-medium">Confirm your new email</p>
              <p className="mt-1">
                We sent a confirmation link to verify the change to{' '}
                <span className="font-medium">{pendingEmail}</span>. Your sign-in email won't change until you click it.
              </p>
              <button
                type="button"
                className="mt-2 text-sky-700 dark:text-sky-300 underline hover:no-underline"
                onClick={() => {
                  setPendingEmail(null)
                  setEmail(currentEmail)
                }}
              >
                Cancel / use a different address
              </button>
            </div>
          ) : (
            <form id="email-form" onSubmit={handleEmailChange} className="flex flex-wrap items-end gap-2 mt-5">
              <div className="w-full sm:w-auto">
                <label className="sr-only" htmlFor="acct-email">Business email</label>
                <input
                  id="acct-email"
                  className="form-input w-full sm:w-80"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <ActionButton
                variant="secondary"
                type="submit"
                form="email-form"
                disabled={emailPending || email.trim().toLowerCase() === currentEmail.toLowerCase()}
              >
                {emailPending ? 'Sending…' : 'Change email'}
              </ActionButton>
            </form>
          )}
          {emailFeedback?.error && (
            <div className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">{emailFeedback.error}</div>
          )}
        </section>

        <section>
          <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Password & sessions</h2>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Manage your password and signed-in devices on the{' '}
            <Link href="/settings/security" className="text-violet-600 dark:text-violet-400 hover:underline">
              Security
            </Link>{' '}
            tab.
          </div>
        </section>
      </div>

      <footer>
        <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
          {feedback?.error && (
            <div className="mb-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">{feedback.error}</div>
          )}
          {feedback?.ok && (
            <div className="mb-3 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded">{feedback.ok}</div>
          )}
          <div className="flex self-end gap-3">
            <ActionButton variant="secondary" onClick={() => router.refresh()}>
              Cancel
            </ActionButton>
            <ActionButton variant="primary" type="submit" form="account-form" disabled={pending}>
              {pending ? 'Saving…' : 'Save Changes'}
            </ActionButton>
          </div>
        </div>
      </footer>
    </div>
  )
}
