import RouteNotFound from '@/components/ui/route-not-found'

export const metadata = { title: 'Not found - DreamCRM' }

/** In-dashboard 404 — a stale link or deleted record keeps the sidebar/header
 *  (DashboardShell) and points back to the dashboard, instead of falling
 *  through to the chrome-less root 404. */
export default function DashboardNotFound() {
  return (
    <RouteNotFound
      inContent
      title="We couldn't find that"
      message="That page or record doesn't exist, or it may have been removed. It might have been deleted since you last saw the link."
      href="/dashboard"
      linkLabel="Back to dashboard"
    />
  )
}
