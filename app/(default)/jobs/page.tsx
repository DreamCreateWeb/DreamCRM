import { redirect } from 'next/navigation'

/**
 * Legacy Mosaic job-board route — never wired to a module (hiring lives in
 * the Careers module: roles + ATS pipeline + public postings). Permanent
 * redirect so an old bookmark never lands on template dummy content.
 */
export default function JobsRedirect() {
  redirect('/careers')
}
