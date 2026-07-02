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
    autoSendEnabled: config.autoSendEnabled,
    featureMinStars: config.featureMinStars,
    showPrivateFeedback: config.showPrivateFeedback,
    starGateEnabled: config.starGateEnabled,
  })
  const [showYelp, setShowYelp] = useState(!!config.yelpBusinessSlug)
  const [showMore, setShowMore] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function update<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
    setSaved(false)
  }

  const placeId = draft.googlePlaceId.trim()
  const googlePreview = placeId
    ? `https://search.google.com/local/writereview?placeid=${placeId}`
    : null

  function save() {
    startTransition(async () => {
      await updateReviewConfigAction({
        googlePlaceId: draft.googlePlaceId.trim() || null,
        healthgradesUrl: draft.healthgradesUrl.trim() || null,
        facebookPageId: draft.facebookPageId.trim() || null,
        yelpBusinessSlug: showYelp ? draft.yelpBusinessSlug.trim() || null : null,
        minDaysBetweenRequests: draft.minDaysBetweenRequests,
        autoSendEnabled: draft.autoSendEnabled,
        featureMinStars: draft.featureMinStars,
        showPrivateFeedback: draft.showPrivateFeedback,
        starGateEnabled: draft.starGateEnabled,
      })
      setSaved(true)
      setToast('Review settings saved.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* HERO — the Google review link is the one setting that makes the whole
          loop work, so it leads. */}
      <div className="rounded-xl border border-[color:var(--color-hairline)] p-4">
        <label className="text-sm font-semibold text-gray-800 dark:text-gray-100 block mb-1">
          Your Google review link
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          This is where patients go to leave you a Google review. Paste your Place ID
          below — or connect your Google Business Profile on the{' '}
          <a href="/integrations" className="underline">Integrations</a> page and we&apos;ll
          fill it in for you automatically.
        </p>
        <input
          value={draft.googlePlaceId}
          onChange={(e) => update('googlePlaceId', e.target.value)}
          placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
          className="form-input w-full font-mono text-sm"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Find your Place ID at{' '}
          <a
            href="https://developers.google.com/maps/documentation/places/web-service/place-id"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            google.com/maps place-id finder
          </a>
          .
        </p>
        {googlePreview ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2 break-all">
            ✓ Patients will land on: {googlePreview}
          </p>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
            Until this is set, review requests can&apos;t send to Google.
          </p>
        )}
      </div>

      {/* AUTOMATION — how the loop behaves */}
      <div className="rounded-xl border border-[color:var(--color-hairline)] p-4 space-y-4">
        <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
          Automatic reviews
        </p>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.autoSendEnabled}
            onChange={(e) => update('autoSendEnabled', e.target.checked)}
            className="form-checkbox h-4 w-4 mt-0.5"
          />
          <span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Ask for a review automatically after each completed visit
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              When your front desk marks a visit completed, the patient gets a review
              request. (Only patients who opted into email, once per year.)
            </span>
          </span>
        </label>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
            Auto-feature these reviews on your website
          </p>
          <div className="inline-flex rounded-lg border border-[color:var(--color-hairline)] overflow-hidden">
            {[
              { v: 4, label: '4★ and 5★' },
              { v: 5, label: '5★ only' },
            ].map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => update('featureMinStars', opt.v)}
                className={`px-4 py-1.5 text-sm font-medium transition ${
                  draft.featureMinStars === opt.v
                    ? 'bg-[color:var(--color-primary)] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-black/[0.03]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            Your best Google reviews appear on your site on their own. You can still
            hide any individual one on the “Reviews received” page.
          </p>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.showPrivateFeedback}
            onChange={(e) => update('showPrivateFeedback', e.target.checked)}
            className="form-checkbox h-4 w-4 mt-0.5"
          />
          <span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Offer a “tell us privately” option on the review page
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Gives an unhappy patient a way to reach you directly instead of posting a
              public review. Their note lands in your private feedback inbox.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.starGateEnabled}
            onChange={(e) => update('starGateEnabled', e.target.checked)}
            className="form-checkbox h-4 w-4 mt-0.5"
          />
          <span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Ask “how was your visit?” first (star triage)
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Patients tap a star before seeing the links. Everyone gets the same public
              review options (that keeps it FTC-clean) — a 1–3★ tap simply leads with the
              private note to your team, so an unhappy patient reaches a human faster.
            </span>
          </span>
        </label>
      </div>

      {/* MORE PLATFORMS — collapsed by default (Google is the star) */}
      <div>
        {!showMore ? (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="text-sm underline text-gray-500 dark:text-gray-400"
          >
            More platforms (Healthgrades, Facebook, Yelp) →
          </button>
        ) : (
          <div className="space-y-4">
            <Field
              label="Healthgrades URL"
              help="The full link to your practice's Healthgrades page. Healthgrades carries more weight than Facebook for dental reputation."
              value={draft.healthgradesUrl}
              onChange={(v) => update('healthgradesUrl', v)}
              placeholder="https://www.healthgrades.com/dental-practice/..."
            />
            <Field
              label="Facebook Page ID or username"
              help="The page name from your Facebook page link (facebook.com/{this-part}). Good for reaching a slightly older crowd."
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
                  className="form-checkbox h-4 w-4"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Also offer Yelp on the review page
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
                    className="form-input w-full"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Yelp business slug from yelp.com/biz/{'{this-part}'}
                  </p>
                </div>
              )}
            </div>
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
          className="form-select text-sm"
        >
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
          <option value={365}>365 days (recommended)</option>
          <option value={730}>2 years</option>
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Keeps you from over-asking. 365 days fits how often most patients visit — once or twice a year.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-[color:var(--color-hairline)]">
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
        className="form-input w-full"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{help}</p>
    </div>
  )
}
