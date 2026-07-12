import { permanentRedirect } from 'next/navigation'

/** The Social Posts composer moved into the Growth workspace. 308 so
 *  old bookmarks, emails, and search entries carry over permanently. */
export default function SocialPostsRedirect() {
  permanentRedirect('/growth/social')
}
