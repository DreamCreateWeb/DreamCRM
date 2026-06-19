'use client'

import RouteError from '@/components/ui/route-error'

/** Public clinic-site error boundary — a visitor must never see a raw crash. */
export default function SiteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      {...props}
      scope="public-site"
      title="This page didn't load"
      message="Something went wrong loading this page. Please try again in a moment."
    />
  )
}
