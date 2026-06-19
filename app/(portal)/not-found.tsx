import RouteNotFound from '@/components/ui/route-not-found'

export const metadata = { title: 'Not found' }

export default function PortalNotFound() {
  return (
    <RouteNotFound
      inContent
      title="We couldn't find that"
      message="This page isn't available. It may have moved, or the link may be out of date."
      href="/patient/dashboard"
      linkLabel="Back to my portal"
    />
  )
}
