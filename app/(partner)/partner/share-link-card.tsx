'use client'

import { useState } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'

/**
 * "Your link" — the one URL a partner puts in an email signature. A clinic
 * that signs up through it is credited automatically; nobody at Dream Create
 * touches a form. The Copy button writes to the clipboard in the viewer's own
 * browser (no server action), with a text fallback when the clipboard API is
 * blocked — the URL is also shown in a read-only field to select by hand.
 */
export default function ShareLinkCard({ url, signedUp }: { url: string; signedUp: number }) {
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'urgent' } | null>(null)
  const [copying, setCopying] = useState(false)

  async function copy() {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(url)
      setToast({ msg: 'Link copied', tone: 'ok' })
    } catch {
      setToast({ msg: 'Couldn’t copy — select the link and copy it by hand', tone: 'urgent' })
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="v2-card p-5">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Your link</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        Share this link. A practice that signs up through it is credited to you automatically.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          readOnly
          aria-label="Your share link"
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="form-input flex-1 font-mono-num text-sm"
        />
        <ActionButton variant="primary" pending={copying} onClick={copy}>
          Copy link
        </ActionButton>
      </div>
      <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
        {signedUp === 0
          ? 'No practices have signed up through it yet.'
          : `${signedUp} ${signedUp === 1 ? 'practice' : 'practices'} signed up through it.`}
      </p>
      {toast && <FlashToast message={toast.msg} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}
