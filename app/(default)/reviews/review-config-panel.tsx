'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateReviewConfigAction } from './actions'
import type { ReviewConfig } from '@/lib/services/reviews'

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
            className="h-4 w-4 rounded border-stone-300 dark:border-stone-600"
          />
          <span className="text-[12px] font-medium text-stone-700 dark:text-stone-200">
            Also surface Yelp on the landing page
          </span>
        </label>
        <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1 ml-6">
          Heads up: Yelp filters solicited reviews into a hidden &quot;not recommended&quot; bucket, so prompting can hurt
          more than it helps. Most dental practices skip Yelp. Only enable if you have a specific reason.
        </p>
        {showYelp && (
          <div className="mt-2 ml-6">
            <input
              value={draft.yelpBusinessSlug}
              onChange={(e) => update('yelpBusinessSlug', e.target.value)}
              placeholder="acme-dental-austin"
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
            />
            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">
              Yelp business slug from yelp.com/biz/{'{this-part}'}
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
          Don&apos;t ask the same patient more than every
        </label>
        <select
          value={draft.minDaysBetweenRequests}
          onChange={(e) => update('minDaysBetweenRequests', Number(e.target.value))}
          className="text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
        >
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
          <option value={365}>365 days (recommended)</option>
          <option value={730}>2 years</option>
        </select>
        <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">
          Spam-prevention rate limit. 365 days matches dental visit cadence — most patients come in 1-2× a year.
        </p>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-700/40">
        <p className="text-[11px] text-stone-400 dark:text-stone-500 italic">
          {saved ? '✓ Saved' : 'Changes apply to new sends. Existing queued requests are unaffected.'}
        </p>
        <button
          onClick={save}
          disabled={pending}
          className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
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
      <label className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
      />
      <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">{help}</p>
    </div>
  )
}
