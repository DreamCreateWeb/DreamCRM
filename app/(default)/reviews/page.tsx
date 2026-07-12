import { permanentRedirect } from 'next/navigation'

/** The Reviews surface moved into the Growth workspace. 308 so
 *  old bookmarks, emails, and search entries carry over permanently. */
export default function ReviewsRedirect() {
  permanentRedirect('/growth/reviews')
}
