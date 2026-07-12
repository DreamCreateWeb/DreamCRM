import { permanentRedirect } from 'next/navigation'

/** Analytics moved into the Growth workspace. 308 so
 *  old bookmarks, emails, and search entries carry over permanently. */
export default function AnalyticsRedirect() {
  permanentRedirect('/growth/analytics')
}
