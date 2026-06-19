'use client'

import RouteError from '@/components/ui/route-error'

/** Patient portal error boundary — calm, plain-language copy for patients. */
export default function PortalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      {...props}
      inContent
      scope="portal"
      title="We couldn't load this"
      message="Something went wrong on our end. Please try again — if it keeps happening, give the office a call."
    />
  )
}
