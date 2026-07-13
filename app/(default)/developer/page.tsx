import { redirect } from 'next/navigation'

/** Retired Mosaic 'Developer' route — never had a real page behind it. Old
 *  bookmarks land on the dashboard instead of a 404 (mirrors /calendar). */
export default function DeveloperRedirect() {
  redirect('/dashboard')
}
