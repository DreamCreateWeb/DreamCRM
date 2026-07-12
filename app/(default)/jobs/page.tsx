import { permanentRedirect } from 'next/navigation'

/**
 * Legacy Mosaic job-board route — never wired to a module (hiring lives in
 * the Careers manager inside the Website workspace). Straight to the new
 * home, no double hop through /careers.
 */
export default function JobsRedirect() {
  permanentRedirect('/website/careers')
}
