'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveAccount } from '../actions'
import { changePassword } from '@/lib/auth-client'

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
  const [businessId, setBusinessId] = useState('')
  const [location, setLocation] = useState(initialUser.city ?? '')
  const [email, setEmail] = useState(initialUser.email)
  const [image, setImage] = useState(initialUser.image)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  // Password change UI
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwFeedback, setPwFeedback] = useState<{ ok?: string; error?: string } | null>(null)

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
        await saveAccount({
          name,
          companyName: companyName || null,
          city: location || null,
          image: image || null,
          email,
        })
        setFeedback({ ok: 'Saved' })
        router.refresh()
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwFeedback(null)
    setPwBusy(true)
    const { error } = await changePassword({
      currentPassword: currentPw,
      newPassword: newPw,
      revokeOtherSessions: true,
    })
    setPwBusy(false)
    if (error) {
      setPwFeedback({ error: error.message ?? 'Unable to change password' })
      return
    }
    setPwFeedback({ ok: 'Password updated' })
    setCurrentPw('')
    setNewPw('')
    setPwOpen(false)
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
            <div className="text-sm">Update your display name, company and address.</div>
            <div className="sm:flex sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mt-5">
              <div className="sm:w-1/3">
                <label className="block text-sm font-medium mb-1" htmlFor="acct-name">Full Name</label>
                <input id="acct-name" className="form-input w-full" type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="sm:w-1/3">
                <label className="block text-sm font-medium mb-1" htmlFor="acct-company">Business Name</label>
                <input id="acct-company" className="form-input w-full" type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="sm:w-1/3">
                <label className="block text-sm font-medium mb-1" htmlFor="acct-bizid">Business ID</label>
                <input id="acct-bizid" className="form-input w-full" type="text" value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1" htmlFor="acct-location">Location</label>
              <input id="acct-location" className="form-input w-full sm:w-1/2" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </section>

          <section>
            <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Email</h2>
            <div className="text-sm">Used for sign-in and account notifications.</div>
            <div className="flex flex-wrap mt-5">
              <div className="mr-2 w-full sm:w-auto">
                <label className="sr-only" htmlFor="acct-email">Business email</label>
                <input id="acct-email" className="form-input w-full sm:w-80" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </section>
        </form>

        <section>
          <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">Password</h2>
          <div className="text-sm">Set a new password. You&apos;ll be signed out of other devices.</div>
          {!pwOpen ? (
            <div className="mt-5">
              <button onClick={() => setPwOpen(true)} className="btn dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300">
                Set New Password
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="mt-5 space-y-3 max-w-md">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="cur-pw">Current Password</label>
                <input id="cur-pw" type="password" className="form-input w-full" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required minLength={8} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="new-pw">New Password</label>
                <input id="new-pw" type="password" className="form-input w-full" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
              </div>
              {pwFeedback?.error && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{pwFeedback.error}</div>
              )}
              {pwFeedback?.ok && (
                <div className="text-sm text-green-700 bg-green-50 dark:bg-green-500/10 px-3 py-2 rounded">{pwFeedback.ok}</div>
              )}
              <div className="flex space-x-2">
                <button type="button" onClick={() => { setPwOpen(false); setCurrentPw(''); setNewPw('') }} className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300">Cancel</button>
                <button type="submit" disabled={pwBusy} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60">
                  {pwBusy ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>

      <footer>
        <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
          {feedback?.error && (
            <div className="mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{feedback.error}</div>
          )}
          {feedback?.ok && (
            <div className="mb-3 text-sm text-green-700 bg-green-50 dark:bg-green-500/10 px-3 py-2 rounded">{feedback.ok}</div>
          )}
          <div className="flex self-end">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="btn dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="account-form"
              disabled={pending}
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-3 disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
