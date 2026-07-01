'use client'

import { useState } from 'react'

/**
 * "Why us?" ambient-video URL field for the Branding section. URL-only by design
 * (no in-product uploader in v1 — clinics paste a public mp4/webm from their own
 * CDN, Pexels, etc.). Adds light client-side validation + a tiny muted-loop
 * preview so a clinic can confirm the link resolves before saving.
 *
 * Persists EXACTLY the old field — a plain URL string under `name`
 * (`differenceVideoUrl`) — so `updateClinicProfile` (`clean(...)`) reads it
 * unchanged; blank falls back to the hero image on the public site. The public
 * template plays it as an autoplay/muted/loop background, so this preview mirrors
 * those attributes.
 */

const VIDEO_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i

type UrlState = 'empty' | 'ok' | 'ok-unknown-ext' | 'invalid'

function classify(raw: string): UrlState {
  const v = raw.trim()
  if (!v) return 'empty'
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return 'invalid'
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'invalid'
  return VIDEO_EXT.test(u.pathname) ? 'ok' : 'ok-unknown-ext'
}

export default function DifferenceVideoField({
  name,
  defaultValue,
}: {
  name: string
  defaultValue: string | null
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const state = classify(value)
  // Only build a live <video> for a well-formed http(s) URL — an invalid string
  // would just 404 the media element.
  const previewSrc = state === 'ok' || state === 'ok-unknown-ext' ? value.trim() : null

  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        &ldquo;Why us?&rdquo; ambient video URL
        <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">(optional)</span>
      </label>
      <input
        id={name}
        name={name}
        type="url"
        inputMode="url"
        className={`form-input w-full ${state === 'invalid' ? 'border-rose-400 dark:border-rose-500' : ''}`}
        placeholder="https://…/video.mp4"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={state === 'invalid'}
      />
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Plays as a silent autoplay loop in the &ldquo;Why us?&rdquo; section. Paste a
        direct MP4 or WebM link (not a YouTube page). Falls back to your hero image
        when blank.
      </p>

      {state === 'invalid' && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          That doesn&apos;t look like a valid URL. It should start with https://
        </p>
      )}
      {state === 'ok-unknown-ext' && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          This link doesn&apos;t end in .mp4 or .webm — double-check it points
          straight at a video file, not a web page.
        </p>
      )}

      {previewSrc && (
        <div className="mt-3">
          <div className="v2-well inline-block overflow-hidden rounded-lg">
            {/* Ambient-loop preview mirroring the public render. `key` forces a
                reload when the URL changes so a corrected link re-fetches. */}
            <video
              key={previewSrc}
              src={previewSrc}
              className="block h-28 w-auto max-w-full bg-black"
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Preview (muted). If it stays black, the link may not be a direct video file.
          </p>
        </div>
      )}
    </div>
  )
}
