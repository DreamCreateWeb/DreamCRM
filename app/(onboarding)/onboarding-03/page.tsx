import { redirect } from 'next/navigation'

/**
 * Setup is three screens now (account → practice → software + web address).
 * The old step-3 web-address screen lives on /onboarding-02; this keeps a
 * bookmarked or in-flight tab landing somewhere true.
 */
export default function Onboarding03() {
  redirect('/onboarding-02')
}
