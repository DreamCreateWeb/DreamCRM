'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateReviewConfigAction } from './actions'
import type { ReviewConfig } from '@/lib/services/reviews'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'

interface Props {
  config: ReviewConfig
}

export default function ReviewConfigPanel({ config }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState({
    googlePlaceId: config.googlePlaceId ?? '',
    healthgradesUrl: config.healthgradesUrl ?? '',
    facebookPageId: config.facebookPageId ?? '',
    yelpBusinessSlug: config.yelpBusinessSlug ?? '',
    minDaysBetweenRequests: config.minDaysBetweenRequests,
  })
  const [showYelp, setShowYelp] = useState(!!config.yelpBusinessSlug)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function update<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
    setSaved(false)
  }

  function save() {
    startTransition(async () => {
      await updateReviewConfigAction({
        googlePlaceId: draft.googlePlaceId.trim() || null,
        healthgradesUrl: draft.healthgradesUrl.trim() || null,
        facebookPageId: draft.facebookPageId.trim() || null,
        yelpBusinessSlug: showYelp ? draft.yelpBusinessSlug.trim() || null : null,
        minDaysBetweenRequests: draft.minDaysBetweenRequests,
      })
      setSaved(true)
      setToast('Review settings saved.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Field
        label="Google Place ID"
        help="Most important platform — ~80% of dental review value. Find your Place ID at https://developers.google.com/maps/documentation/places/web-service/place-id"
        value={draft.googlePlaceId}
        onChange={(v) => update('googlePlaceId', v)}
        placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
      />
      <Field
        label="Healthgrades URL"
        help="The full URL to your practice's Healthgrades page. Healthgrades > Facebook for dental healthcare reputation."
        value={draft.healthgradesUrl}
        onChange={(v) => update('healthgradesUrl', v)}
        placeholder="https://www.healthgrades.com/dental-practice/..."
      />
      <Field
        label="Facebook Page ID or username"
        help="The page slug from your Facebook page URL (facebook.com/{this-part}). Captures older patient demographics."
        value={draft.facebookPageId}
        onChange={(v) => update('facebookPageId', v)}
        placeholder="acme-dental-austin"
      />

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showYelp}
            onChange={(e) => setShowYelp(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-400"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Also surface Yelp on the landing page
          </span>
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
          Heads up: Yelp filters solicited reviews into a hidden &quot;not recommended&quot; bucket, so prompting can hurt
          more than it helps. Most dental practices skip Yelp. Only enable if you have a specific reason.
        </p>
        {showYelp && (
          <div className="mt-2 ml-6">
            <input
              value={draft.yelpBusinessSlug}
              onChange={(e) => update('yelpBusinessSlug', e.target.value)}
              placeholder="acme-dental-austin"
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Yelp business slug from yelp.com/biz/{'{this-part}'}
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
          Don&apos;t ask the same patient more than every
        </label>
        <select
          value={draft.minDaysBetweenRequests}
          onChange={(e) => update('minDaysBetweenRequests', Number(e.target.value))}
          className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
          <option value={365}>365 days (recommended)</option>
          <option value={730}>2 years</option>
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Spam-prevention rate limit. 365 days matches dental visit cadence — most patients come in 1-2× a year.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-700/40">
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          {saved ? '✓ Saved' : 'Changes apply to new sends. Existing queued requests are unaffected.'}
        </p>
        <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </ActionButton>
      </div>

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function Field({
  label,
  help,
  value,
  onChange,
  placeholder,
}: {
  label: string
  help: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{help}</p>
    </div>
  )
}
