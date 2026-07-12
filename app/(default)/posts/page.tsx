import { permanentRedirect } from 'next/navigation'

/** The blog manager moved into the Website workspace (/website/blog). 308 so
 *  old bookmarks, emails, and search entries carry over permanently. */
export default function PostsRedirect() {
  permanentRedirect('/website/blog')
}
