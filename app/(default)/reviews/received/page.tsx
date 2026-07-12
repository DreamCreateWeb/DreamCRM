import { permanentRedirect } from 'next/navigation'

/** Received reviews moved with the Reviews surface into the Growth workspace.
 *  Notification emails link here — the 308 keeps every historical link alive. 308 so
 *  old bookmarks, emails, and search entries carry over permanently. */
export default function ReviewsReceivedRedirect() {
  permanentRedirect('/growth/reviews/received')
}
