import { pageMetadata } from '@/lib/marketing/seo'
import { TERMS_OF_SERVICE } from '@/lib/marketing/legal'
import { LegalPage } from '../legal-page'

export const metadata = pageMetadata({
  title: 'DreamCRM Terms of Service: the trial, billing and cancelling',
  description: TERMS_OF_SERVICE.summary,
  path: TERMS_OF_SERVICE.path,
})

/** The Terms of Service. The words live in `lib/marketing/legal.ts`. */
export default function TermsPage() {
  return <LegalPage doc={TERMS_OF_SERVICE} />
}
