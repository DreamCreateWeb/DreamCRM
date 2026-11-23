import { pageMetadata } from '@/lib/marketing/seo'
import { PRIVACY_POLICY } from '@/lib/marketing/legal'
import { LegalPage } from '../legal-page'

export const metadata = pageMetadata({
  title: 'DreamCRM Privacy Policy: what we collect and who receives it',
  description: PRIVACY_POLICY.summary,
  path: PRIVACY_POLICY.path,
})

/** The Privacy Policy. The words live in `lib/marketing/legal.ts`. */
export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY_POLICY} />
}
