import { redirect } from 'next/navigation'

/**
 * Setup is three screens now; the trial start moved onto /onboarding-02. This
 * keeps a bookmarked or in-flight tab (and a browser Back after completion)
 * landing somewhere true.
 */
export default function Onboarding04() {
  redirect('/onboarding-02')
}
