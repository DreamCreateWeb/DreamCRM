'use client'

import { useRealtimeRefresh } from '@/components/realtime/realtime-provider'

/**
 * Makes the patient portal live. The portal chrome + pages are server-rendered
 * (the unread-messages badge, the messages thread, the records/documents list
 * are all computed server-side), so a soft router.refresh() on the relevant
 * realtime topics is the simplest correct live update — client state (an
 * in-progress reply draft) is preserved across it.
 *
 * The stream this listens to is patient-scoped server-side, so a patient only
 * ever receives events for THEIR OWN record — never another patient's.
 */
export default function PortalLiveRefresh() {
  useRealtimeRefresh(['messages', 'documents'])
  return null
}
