import { jsonLdHtml } from '@/lib/json-ld'

/**
 * The one place the app renders structured data into the page.
 *
 * Every JSON-LD block goes through here so the `</script>`-in-clinic-content
 * escaping in `jsonLdHtml` can never be forgotten on the next page that wants
 * structured data. `tests/clinic-site/jsonld-escaping.test.ts` fails CI if a
 * second `application/ld+json` script tag appears anywhere else.
 */
export default function JsonLdScript({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />
}
