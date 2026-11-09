import { notFound } from 'next/navigation'

/**
 * Any URL under a clinic site that matches no page. Without this catch-all an
 * unmatched path falls through to the ROOT 404 (no clinic, no chrome). Throwing
 * notFound() here lands in `../not-found.tsx` inside the site layout, so the
 * visitor sees the clinic's own 404 (real 404 status, Next adds noindex).
 */
export default function UnmatchedClinicPath() {
  notFound()
}
