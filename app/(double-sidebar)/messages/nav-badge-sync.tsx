'use client'

import { useEffect } from 'react'

/**
 * Nudges the sidebar to re-fetch its unread-Messages badge immediately, instead
 * of waiting for the 60s poll. Opening a patient thread marks it read on the
 * server (and revalidates /messages); this fires `nav-badges:refresh` on mount
 * and whenever the active thread changes, so the badge drops within a moment of
 * reading. The sidebar listens for the event (tenant-sidebar.tsx).
 */
export default function NavBadgeSync({ signal }: { signal?: string | number | null }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('nav-badges:refresh'))
  }, [signal])
  return null
}
