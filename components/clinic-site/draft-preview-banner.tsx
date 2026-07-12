'use client'

import { useEffect, useState } from 'react'

/**
 * The "you're seeing your draft" pill — mounted by the site layout ONLY when
 * the viewer is a verified editor of this clinic with staged (unpublished)
 * edits. Patients never get the overlay, so they never get this banner.
 *
 * Hidden inside the Website Studio canvas (`?edit=1`): the Studio's own
 * publish bar already carries the draft state there, and a second pill would
 * sit on top of the editing surface. Checked client-side because this mounts
 * from the layout, which can't read searchParams.
 */
export default function DraftPreviewBanner({ appUrl }: { appUrl: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setShow(params.get('edit') !== '1')
  }, [])
  if (!show) return null
  return (
    <div className="fixed bottom-4 left-4 z-[60] max-w-xs rounded-full bg-gray-900/90 text-white shadow-lg backdrop-blur px-4 py-2.5 text-xs leading-snug">
      <span className="font-semibold">Unpublished changes</span>
      <span className="text-gray-300"> — you’re seeing your draft. Patients see the published site. </span>
      <a
        href={`${appUrl}/website`}
        className="font-semibold text-teal-300 hover:text-teal-200 underline underline-offset-2"
      >
        Publish
      </a>
    </div>
  )
}
