import { permanentRedirect } from 'next/navigation'

/** Moved with the blog manager → /website/blog/calendar. */
export default function PostsCalendarRedirect() {
  permanentRedirect('/website/blog/calendar')
}
