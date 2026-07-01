'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveAccount } from '../actions'
import { changeEmail } from '@/lib/auth/client'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { MAX_IMAGE_MB } from '@/lib/media'
import { SettingsSection, SettingsRow } from '../settings-kit'
import { SettingsTabs } from '../settings-tabs'

interface InitialUser {
  id: string
  name: string
  email: string
  image: string | null
  bio: string | null
}

// Kept in lockstep with the shared server bounds so the client never promises a
// looser limit than the API (or the Zod contract) will accept.
const NAME_MAX = 200 // AccountInput.name.max(200)
const BIO_MAX = 1000 // AccountInput.bio.max(1000)
// The avatar upload route (/api/upload) sniffs magic bytes; SVG is rejected, so
// only these raster formats are actually accepted. Stated up front (below) so a
// rejected upload is never a surprise.
const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
const AVATAR_FORMATS = 'JPG, PNG, WebP or GIF'
const AVATAR_MAX_BYTES = MAX_IMAGE_MB * 1024 * 1024

export default function AccountPanel({ initialUser }: { initialUser: InitialUser }) {
  const router = useRouter()
  const [name, setName] = useState(initialUser.name)
  const [bio, setBio] = useState(initialUser.bio ?? '')
  const [image, setImage] = useState(initialUser.image)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Email is its own verified flow — better-auth's changeEmail (a confirmation
  // link to the current mailbox); the new address only takes effect after the
  // click, so currentEmail keeps showing what's actually on the account.
  const currentEmail = initialUser.email
  const [email, setEmail] = useState(initialUser.email)
  const [emailPending, startEmailTransition] = useTransition()
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [emailFeedback, setEmailFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  const dirty = name !== initialUser.name || bio !== (initialUser.bio ?? '') || image !== initialUser.image
  const bioRemaining = BIO_MAX - bio.length
  const bioNearCap = bioRemaining <= 50

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so re-picking the same file after an error still fires.
    e.target.value = ''
    if (!file) return
    setFeedback(null)
    // Validate BEFORE the round-trip so the same limits we advertise are the
    // ones enforced — a too-large / wrong-type file fails instantly with a clear
    // message instead of after a full upload.
    if (!file.type.startsWith('image/')) {
      setFeedback({ error: `That file isn’t an image. Use ${AVATAR_FORMATS}.` })
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setFeedback({ error: `That image is too large (max ${MAX_IMAGE_MB} MB).` })
      return
    }
    setUploading(true)
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
        setToast('Profile saved')
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
                {/* Avatar — constraints shown BEFORE picking so a rejected upload
                    is never a surprise. Round preview kept for the personal profile. */}
                <div className="flex items-center gap-4 border-b border-gray-100 dark:border-gray-700/50 pb-4 mb-1">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="w-16 h-16 rounded-full object-cover" src={image} alt={name} width={64} height={64} loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-500/30 flex items-center justify-center text-xl font-semibold text-teal-700 dark:text-teal-200">
                      {(name?.[0] ?? 'U').toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <label className="btn-sm dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300 cursor-pointer">
                      {uploading ? 'Uploading…' : image ? 'Change photo' : 'Upload photo'}
                      <input type="file" accept={AVATAR_ACCEPT} className="hidden" onChange={handleAvatarChange} disabled={uploading} />
                    </label>
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {AVATAR_FORMATS} · up to <span className="font-mono-num tabular-nums">{MAX_IMAGE_MB}</span> MB.
                    </p>
                  </div>
                </div>

                <form id="account-form" onSubmit={handleSubmit}>
                  <SettingsRow
                    label="Full name"
                    htmlFor="acct-name"
                    description={`Up to ${NAME_MAX} characters.`}
                    control={
                      <input
                        id="acct-name"
                        className="form-input w-full sm:w-80"
                        type="text"
                        maxLength={NAME_MAX}
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
                      <div className="w-full sm:w-80">
                        <textarea
                          id="acct-bio"
                          className="form-textarea w-full"
                          rows={3}
                          maxLength={BIO_MAX}
                          placeholder="Front-desk lead, here to make your visit easy."
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          aria-describedby="acct-bio-count"
                        />
                        <p
                          id="acct-bio-count"
                          className={`mt-1 text-right text-xs font-mono-num tabular-nums ${
                            bioNearCap ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {bio.length} / {BIO_MAX}
                        </p>
                      </div>
                    }
                  />
                </form>

                <div className="mt-4 flex items-center justify-end gap-3">
                  {feedback?.error && <span className="mr-auto text-sm text-rose-600 dark:text-rose-400">{feedback.error}</span>}
                  {feedback?.ok && <span className="mr-auto text-sm text-emerald-600 dark:text-emerald-400">{feedback.ok}</span>}
                  <ActionButton variant="primary" type="submit" form="account-form" disabled={pending || uploading || !dirty}>
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
                <SettingsRow
                  label="Sign-in email"
                  htmlFor={pendingEmail ? undefined : 'acct-email'}
                  description={
                    pendingEmail
                      ? 'A change is awaiting confirmation.'
                      : 'The address you use to sign in and receive account emails.'
                  }
                  control={
                    pendingEmail ? (
                      <div className="w-full max-w-md rounded-[var(--r-md)] border-l-4 border-l-indigo-500 bg-indigo-500/10 px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                        <p className="font-semibold text-indigo-700 dark:text-indigo-300">Confirm your new email</p>
                        <p className="mt-1 leading-relaxed">
                          We emailed a confirmation link to your <span className="font-medium">current</span> inbox
                          (<span className="font-medium">{currentEmail}</span>). Open it and click the link to move your
                          sign-in email to <span className="font-medium">{pendingEmail}</span>.
                        </p>
                        <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-400">
                          Nothing changes until you click that link — you can keep signing in with{' '}
                          <span className="font-medium">{currentEmail}</span> in the meantime.
                        </p>
                        <button
                          type="button"
                          className="mt-2.5 text-indigo-700 dark:text-indigo-300 underline underline-offset-2 hover:no-underline"
                          onClick={() => {
                            setPendingEmail(null)
                            setEmail(currentEmail)
                            setEmailFeedback(null)
                          }}
                        >
                          Cancel — use a different address
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
                    )
                  }
                />
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
              <SettingsSection description="Manage your password and review the devices you're signed in on.">
                <SettingsRow
                  label="Password & devices"
                  description="Your password and signed-in devices live on the Security page."
                  control={
                    <ActionButton href="/settings/security" variant="secondary">
                      Go to Security
                    </ActionButton>
                  }
                />
              </SettingsSection>
            ),
          },
        ]}
      />
      {toast && <FlashToast message={toast} tone="ok" onDone={() => setToast(null)} />}
    </div>
  )
}
