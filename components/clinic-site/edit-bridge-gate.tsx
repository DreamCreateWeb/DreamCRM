'use client'

import { useEffect, useState } from 'react'
import EditBridge from './edit-bridge'

/**
 * Mounts the EditBridge on any clinic public page when (a) the server has
 * confirmed this viewer may edit this clinic (`canEdit`, resolved in the
 * `/site/[slug]` layout) and (b) the URL carries `?edit=1`. Mounting here —
 * in the shared layout — means the Website Studio canvas stays editable as
 * the clinic navigates between their own pages (Home, About, Services, …),
 * without each page wiring the bridge itself.
 *
 * The `?edit=1` check is client-side because Next.js layouts don't receive
 * searchParams; the auth half is server-side via `canEdit`.
 */
export default function EditBridgeGate({ canEdit }: { canEdit: boolean }) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!canEdit) {
      setActive(false)
      return
    }
    const edit = new URLSearchParams(window.location.search).get('edit') === '1'
    setActive(edit)
  }, [canEdit])

  return active ? <EditBridge /> : null
}
