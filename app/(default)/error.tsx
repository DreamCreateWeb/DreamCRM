'use client'

import RouteError from '@/components/ui/route-error'

/** Dashboard error boundary — renders in the content area; the sidebar/header
 *  (DashboardShell) stay put so the staff member never loses their place. */
export default function DashboardError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      {...props}
      inContent
      scope="dashboard"
      message="We hit a snag loading this page. Trying again usually fixes it — your data is safe."
    />
  )
}
