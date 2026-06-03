'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { saveInlineField } from './website-actions'

interface Props {
  slug: string
  siteUrl: string
}

type Status = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Website Studio — the full-screen, chrome-less editor. It hosts the clinic's
 * real site in an iframe opened in edit mode (`/site/[slug]?edit=1`) and the
 * `EditBridge` inside that iframe drives inline editing. The studio is the
 * authed half: it receives edit intents over postMessage and calls the server
 * actions (so persistence is always gated server-side), then echoes results
 * back to the bridge.
 *
 * 3a foundation: inline text save. Image-replace + section modals + the AI
 * command bar layer on next (the postMessage protocol already carries
 * `editImage` / `openModal` intents).
 */
export default function WebsiteStudio({ slug, siteUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const origin = window.location.origin
    const reloadFrame = () => {
      const f = iframeRef.current
      if (f) f.src = f.src
    }

    async function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return
      const d = e.data as { source?: string; type?: string; field?: string; value?: string }
      if (!d || d.source !== 'dreamcrm-edit') return

      if (d.type === 'save' && d.field) {
        setStatus('saving')
        setErrorMsg(null)
        const res = await saveInlineField(d.field, d.value ?? '')
        if (res.ok) {
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1800)
        } else {
          setStatus('error')
          setErrorMsg(res.error)
          // Reset the canvas to the persisted (unchanged) state.
          reloadFrame()
        }
      }
      // 'editImage' / 'openModal' intents are handled in the next slice.
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-stone-900">
      {/* Studio toolbar — the only chrome; the canvas below is the real site. */}
      <div className="h-12 shrink-0 flex items-center justify-between gap-3 px-4 bg-stone-900 text-stone-100 border-b border-stone-700">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="text-sm text-stone-300 hover:text-white whitespace-nowrap"
          >
            ← Exit
          </Link>
          <span className="text-sm font-semibold whitespace-nowrap">Editing your website</span>
          <span className="hidden sm:inline text-[11px] text-stone-400 truncate">
            Click your headline to change it — it saves to your live site instantly.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status === 'saving' && <span className="text-[12px] text-stone-300">Saving…</span>}
          {status === 'saved' && <span className="text-[12px] text-emerald-400">Saved ✓ live</span>}
          {status === 'error' && (
            <span className="text-[12px] text-rose-400 max-w-[16rem] truncate">{errorMsg ?? 'Could not save'}</span>
          )}
          <Link
            href="/settings/clinic"
            className="hidden sm:inline text-[12px] text-stone-300 hover:text-white"
          >
            Advanced edits
          </Link>
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-semibold px-3 py-1 rounded bg-white text-stone-900 hover:bg-stone-100"
          >
            View live ↗
          </a>
        </div>
      </div>

      {/* Canvas — the clinic's real, production-rendered site in edit mode. */}
      <iframe
        ref={iframeRef}
        src={`/site/${slug}?edit=1`}
        title="Your website — edit mode"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  )
}
