'use client'

import RouteError from '@/components/ui/route-error'

/** Catch-all error boundary — covers anything a closer boundary doesn't,
 *  including a route-group layout (e.g. DashboardShell) throwing. Full-surface
 *  because there may be no chrome left to render inside. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} scope="app" />
}
