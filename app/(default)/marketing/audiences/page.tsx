import { permanentRedirect } from 'next/navigation'

/** Audiences moved into the Growth workspace (both tenants). 308 so
 *  old bookmarks, emails, and search entries carry over permanently. */
export default function AudiencesRedirect() {
  permanentRedirect('/growth/audiences')
}
