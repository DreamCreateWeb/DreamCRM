'use client'

import { useEffect, useState } from 'react'

/**
 * The fixed strip an editing owner sees while previewing a different site
 * template (`dc-template-preview` cookie, resolved server-side in the layout).
 * Suppressed inside the Website Studio canvas (`?edit=1`) — the Studio shows
 * its own Apply/Discard chrome there. The `?edit` check is client-side for the
 * same reason as EditBridgeGate: layouts don't receive searchParams.
 */
export default function TemplatePreviewBanner({
  slug,
  basePath,
  label,
}: {
  slug: string
  basePath: string
  label: string
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const inStudio = new URLSearchParams(window.location.search).get('edit') === '1'
    setVisible(!inStudio)
  }, [])

  if (!visible) return null
  const exitHref = `${basePath}/template-preview?template=off&return=${encodeURIComponent(
    window.location.pathname + window.location.search,
  )}`
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        background: 'var(--c-deep, #26221D)',
        color: 'var(--c-deep-ink, #F4F0E7)',
      }}
      className="flex items-center justify-center gap-3 px-4 py-2.5 text-sm"
      data-template-preview={slug}
    >
      <span>
        Previewing the <strong>{label}</strong> design — only you can see this.
      </span>
      <a href={exitHref} className="underline underline-offset-2 font-medium whitespace-nowrap">
        Exit preview
      </a>
    </div>
  )
}
