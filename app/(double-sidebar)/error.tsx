'use client'

import RouteError from '@/components/ui/route-error'

/** Inbox / Messages error boundary — renders inside the dashboard chrome. */
export default function MessagesError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} inContent scope="messages" message="We couldn't load this conversation view. Trying again usually fixes it." />
}
