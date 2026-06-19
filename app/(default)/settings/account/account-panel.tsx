'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveAccount } from '../actions'
import { changeEmail } from '@/lib/auth/client'
import { ActionButton } from '@/components/ui/action-button'
import { SettingsSection, SettingsRow } from '../settings-kit'
import { SettingsTabs } from '../settings-tabs'

interface InitialUser {
  id: string
  name: string
  email: string
  image: string | null
  bio: string | null
}

export default function AccountPanel({ initialUser }: { initialUser: InitialUser }) {
  const router = useRouter()
  const [name, setName] = useState(initialUser.name)
  const [bio, setBio] = useState(initialUser.bio ?? '')
  const [image, setImage] = useState(initialUser.image)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  // Email is its own verified flow — better-auth's changeEmail (a confirmation
  // link to the current mailbox); the new address only takes effect after the
  // click, so currentEmail keeps showing what's actually on the account.
  const currentEmail = initialUser.email
  const [email, setEmail] = useState(initialUser.email)
  const [emailPending, startEmailTransition] = useTransition()
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [emailFeedback, setEmailFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  const dirty = name !== initialUser.name || bio !== (initialUser.bio ?? '') || image !== initialUser.image

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
        await saveAccount({ name, image: image || null, bio: bio.trim() || null })
        setFeedback({ ok: 'Saved.' })
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
    <div className="p-6">
      <SettingsTabs
        tabs={[
          {
            id: 'profile',
            label: 'Profile',
            content: (
              <SettingsSection description="Your name, photo, and a short bio.">
        {/* Avatar */}
        <div className="flex items-center gap-4 border-b border-gray-100 dark:border-gray-700/50 pb-4 mb-1">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="w-16 h-16 rounded-full object-cover" src={image} alt={name} width={64} height={64} loading="lazy" decoding="async" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-500/30 flex items-center justify-center text-xl font-semibold text-teal-700 dark:text-teal-200">
              {(name?.[0] ?? 'U').toUpperCase()}
            </div>
          )}
          <label className="btn-sm dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300 cursor-pointer">
            {uploading ? 'Uploading…' : 'Change photo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </label>
        </div>

        <form id="account-form" onSubmit={handleSubmit}>
          <SettingsRow
            label="Full name"
            htmlFor="acct-name"
            control={
              <input
                id="acct-name"
                className="form-input w-full sm:w-80"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            }
          />
          <SettingsRow
            label="Bio"
            htmlFor="acct-bio"
            description="A sentence or two about you."
            control={
              <textarea
                id="acct-bio"
                className="form-textarea w-full sm:w-80"
                rows={3}
                maxLength={1000}
                placeholder="Front-desk lead, here to make your visit easy."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            }
          />
        </form>

        <div className="mt-4 flex items-center justify-end gap-3">
          {feedback?.error && <span className="mr-auto text-sm text-rose-600 dark:text-rose-400">{feedback.error}</span>}
          {feedback?.ok && <span className="mr-auto text-sm text-emerald-600 dark:text-emerald-400">{feedback.ok}</span>}
          <ActionButton variant="primary" type="submit" form="account-form" disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save profile'}
          </ActionButton>
        </div>
              </SettingsSection>
            ),
          },
          {
            id: 'email',
            label: 'Email',
            content: (
              <SettingsSection
                description={
          <>
            Used for sign-in and account notifications. Changing it sends a confirmation link — your sign-in email
            stays <span className="font-medium text-gray-700 dark:text-gray-300">{currentEmail}</span> until you confirm.
          </>
        }
      >
        {pendingEmail ? (
          <div className="text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 px-3 py-3 rounded-[var(--r-sm)]">
            <p className="font-medium">Confirm your new email</p>
            <p className="mt-1">
              We sent a confirmation link to verify the change to{' '}
              <span className="font-medium">{pendingEmail}</span>. Your sign-in email won&apos;t change until you click it.
            </p>
            <button
              type="button"
              className="mt-2 text-indigo-700 dark:text-indigo-300 underline hover:no-underline"
              onClick={() => {
                setPendingEmail(null)
                setEmail(currentEmail)
              }}
            >
              Cancel / use a different address
            </button>
          </div>
        ) : (
          <form id="email-form" onSubmit={handleEmailChange} className="flex flex-wrap items-end gap-2">
            <div className="w-full sm:w-auto">
              <label className="sr-only" htmlFor="acct-email">
                Email address
              </label>
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
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{emailFeedback.error}</p>
        )}
              </SettingsSection>
            ),
          },
          {
            id: 'password',
            label: 'Password',
            content: (
              <SettingsSection
                description="Manage your password and review the devices you're signed in on."
                action={
          <ActionButton href="/settings/security" variant="secondary">
            Go to Security
          </ActionButton>
        }
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your password and signed-in devices live on the Security page.
        </p>
              </SettingsSection>
            ),
          },
        ]}
      />
    </div>
  )
}
