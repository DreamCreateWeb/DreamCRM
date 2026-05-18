'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Renders an email body inside a sandboxed iframe via `srcdoc`. Gives us:
 * - Full CSS isolation: newsletter `<style>` blocks (now stripped at the
 *   sanitizer for safety, but defense-in-depth) and inline styles can't
 *   leak into the rest of the DreamCRM page.
 * - Restored visual fidelity: emails render with their intended layout,
 *   colors, and typography just like in Gmail's preview pane.
 *
 * Auto-sizes to content via a tiny height-reporter script injected into
 * the iframe document. Sandboxed with `allow-popups` so external links
 * still work via target="_blank" but the email cannot navigate the parent
 * or run cross-origin code.
 */
export default function EmailIframe({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState(80)

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return
      if (e.data.type === 'email-iframe-height' && typeof e.data.height === 'number') {
        // Clamp so a 30000px email can't blow up the page; user can scroll
        // inside if it overflows.
        setHeight(Math.min(8000, Math.max(80, e.data.height + 8)))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Wrap the email body in a minimal document. base target=_blank means any
  // <a> click opens in a new tab without needing per-link rewriting. The
  // height-reporter posts up to the parent on load + whenever body resizes.
  const srcDoc = `<!doctype html>
<html><head>
<base target="_blank">
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.55;
    color: #1c1917;
    background: transparent;
    padding: 4px 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #047857; }
</style>
</head><body>
${html}
<script>
  (function () {
    function post() {
      try {
        parent.postMessage({ type: 'email-iframe-height', height: document.documentElement.scrollHeight }, '*')
      } catch (e) {}
    }
    window.addEventListener('load', post)
    document.addEventListener('readystatechange', post)
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(post).observe(document.documentElement)
    }
    // Some emails load images after onload; re-post on each image's load.
    document.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('load', post)
      img.addEventListener('error', post)
    })
    setTimeout(post, 100)
    setTimeout(post, 500)
  })()
</script>
</body></html>`

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts"
      title="Email body"
      className="w-full block border-0"
      style={{ height: `${height}px` }}
    />
  )
}
