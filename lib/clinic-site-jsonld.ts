// Pure, client-safe schema.org JSON-LD builders for the clinic public site.
//
// These mirror the patterns of the existing `clinicJsonLd` (lib/services/
// clinic-site.ts) and `jobPostingJsonLd` (lib/types/careers.ts) but live in a
// dependency-free module so every public page (server component) can call them
// without pulling a server-only import. Each returns a plain object; the page
// renders it via the standard
//   <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
// pattern.
//
// Honesty rules carried over from clinicJsonLd: we never fabricate ratings,
// availability, or prices. A field is emitted only when we hold real data for
// it (e.g. Product `offers` only when the variant carries a price).

interface BreadcrumbStep {
  name: string
  /** Absolute URL. The last crumb (current page) may omit it. */
  url?: string
}

/**
 * BreadcrumbList — emitted on every detail page (service / team / blog /
 * careers) so search engines render the Home › Section › Page trail. Pass the
 * crumbs in order; positions are assigned 1-based.
 */
export function breadcrumbJsonLd(steps: BreadcrumbStep[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: steps.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.name,
      ...(s.url ? { item: s.url } : {}),
    })),
  }
}

/**
 * FAQPage — emitted on pages that render a real Q&A accordion (/insurance,
 * /payment-financing, and any page with a meaningful FAQ block). Skips any
 * entry missing a question or answer. Returns null when there's nothing valid
 * to emit so callers can conditionally render.
 */
export function faqPageJsonLd(
  items: Array<{ question: string; answer: string }>,
): Record<string, unknown> | null {
  const valid = items.filter((f) => f?.question?.trim() && f?.answer?.trim())
  if (valid.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: valid.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }
}

interface ProcedureItem {
  name: string
  description?: string | null
  url: string
}

/**
 * ItemList of MedicalProcedure — emitted on the /services index. Each clinic
 * service becomes a MedicalProcedure entry the search engine can surface as a
 * carousel item. `clinicName` is used for the procedure's `provider`.
 */
export function servicesItemListJsonLd(
  items: ProcedureItem[],
  clinicName: string,
  clinicUrl: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'MedicalProcedure',
        name: s.name,
        url: s.url,
        ...(s.description ? { description: s.description } : {}),
        provider: { '@type': 'Dentist', name: clinicName, url: clinicUrl },
      },
    })),
  }
}

export interface PersonLite {
  name: string
  /** Page URL for this person (the /team/[slug] page). Optional. */
  url?: string | null
  jobTitle?: string | null
  description?: string | null
  image?: string | null
}

/**
 * Build a single Person node (used standalone on /team/[slug] and as the items
 * of the /team ItemList). `worksFor` ties them to the clinic (a Dentist org).
 * On the detail page, pass `mainEntityOfPage` = the page URL so the node is
 * unambiguously the page's primary entity.
 */
export function personJsonLd(
  person: PersonLite,
  clinic: { name: string; url: string },
  mainEntityOfPage?: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: person.name,
    ...(person.url ? { url: person.url } : {}),
    ...(person.jobTitle ? { jobTitle: person.jobTitle } : {}),
    ...(person.description ? { description: person.description } : {}),
    ...(person.image ? { image: person.image } : {}),
    ...(mainEntityOfPage ? { mainEntityOfPage } : {}),
    worksFor: { '@type': 'Dentist', name: clinic.name, url: clinic.url },
  }
}

/**
 * ItemList of Person — the /team index. Each entry is a positioned Person node.
 */
export function teamItemListJsonLd(
  people: PersonLite[],
  clinic: { name: string; url: string },
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: people.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Person',
        name: p.name,
        ...(p.url ? { url: p.url } : {}),
        ...(p.jobTitle ? { jobTitle: p.jobTitle } : {}),
        ...(p.image ? { image: p.image } : {}),
        worksFor: { '@type': 'Dentist', name: clinic.name, url: clinic.url },
      },
    })),
  }
}

/**
 * Dentist / Organization node for the /about page, carrying the team as
 * `member` Person nodes (the homepage `clinicJsonLd` is the primary Dentist
 * node; this is the About-page variant that additionally enumerates staff).
 */
export function aboutOrganizationJsonLd(
  clinic: { name: string; url: string; description?: string | null; logo?: string | null },
  members: PersonLite[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name: clinic.name,
    url: clinic.url,
    ...(clinic.description ? { description: clinic.description } : {}),
    ...(clinic.logo ? { logo: clinic.logo, image: clinic.logo } : {}),
    ...(members.length
      ? {
          employee: members.map((m) => ({
            '@type': 'Person',
            name: m.name,
            ...(m.jobTitle ? { jobTitle: m.jobTitle } : {}),
            ...(m.url ? { url: m.url } : {}),
          })),
        }
      : {}),
  }
}

/**
 * Product + Offer for a storefront product detail page. `priceCents` is the
 * lowest variant price; `inStock` reflects real inventory. We emit `offers`
 * only when we have a price (no fabricated `0.00`). `availability` is honest:
 * InStock vs OutOfStock from the inventory flag.
 */
export function productJsonLd(input: {
  name: string
  description?: string | null
  image?: string | null
  url: string
  priceCents?: number | null
  inStock: boolean
  clinicName: string
}): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    brand: { '@type': 'Brand', name: input.clinicName },
  }
  if (input.priceCents != null && input.priceCents >= 0) {
    ld.offers = {
      '@type': 'Offer',
      price: (input.priceCents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: input.url,
    }
  }
  return ld
}

/**
 * Blog node for the /blog index — lists the recent posts as `blogPost`
 * BlogPosting stubs. The per-post page carries the full BlogPosting.
 */
export function blogIndexJsonLd(input: {
  name: string
  url: string
  clinicName: string
  posts: Array<{ title: string; url: string; datePublished?: string | null; description?: string | null }>
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: input.name,
    url: input.url,
    publisher: { '@type': 'Organization', name: input.clinicName },
    ...(input.posts.length
      ? {
          blogPost: input.posts.map((p) => ({
            '@type': 'BlogPosting',
            headline: p.title,
            url: p.url,
            ...(p.datePublished ? { datePublished: p.datePublished } : {}),
            ...(p.description ? { description: p.description } : {}),
          })),
        }
      : {}),
  }
}

/**
 * Offer node for the /dental-plans page — each membership plan as an Offer.
 * Recurring price expressed via `priceSpecification` with the billing period.
 */
export function dentalPlansJsonLd(input: {
  url: string
  clinicName: string
  plans: Array<{
    name: string
    priceCents: number
    /** Accepts the membership `'monthly' | 'annual'` shape (and the bare
     *  `'month' | 'year'`) — anything year-ish maps to a YEAR billing unit. */
    billingInterval: string
    description?: string | null
  }>
}): Record<string, unknown> {
  const isYear = (i: string) => i === 'annual' || i === 'year' || i === 'yearly'
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${input.clinicName} membership plans`,
    url: input.url,
    itemListElement: input.plans.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Offer',
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        price: (p.priceCents / 100).toFixed(2),
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: (p.priceCents / 100).toFixed(2),
          priceCurrency: 'USD',
          billingDuration: 1,
          billingIncrement: 1,
          unitText: isYear(p.billingInterval) ? 'YEAR' : 'MONTH',
        },
        seller: { '@type': 'Dentist', name: input.clinicName, url: input.url },
      },
    })),
  }
}
