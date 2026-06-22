import { MARKETING } from './site'

/**
 * SEO helpers for the public marketing site: canonical site URL + schema.org
 * JSON-LD builders. The product sells SEO to clinics, so the marketing site
 * models the same best practice (Organization, SoftwareApplication + Offers,
 * FAQPage, BreadcrumbList). Builders are pure + return plain objects; `JsonLd`
 * renders them as <script type="application/ld+json"> tags.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')
export const LOGO_URL = `${SITE_URL}/images/dream-create-logo.webp`

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: MARKETING.companyName,
    url: SITE_URL,
    logo: LOGO_URL,
    description: `Makers of ${MARKETING.productName} — ${MARKETING.tagline.toLowerCase()}.`,
  }
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: MARKETING.productName,
    url: SITE_URL,
  }
}

export function softwareApplicationLd(plans: ReadonlyArray<{ name: string; price: number }>) {
  const prices = plans.map((p) => p.price)
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: MARKETING.productName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'Website, online booking, patient portal, messaging, reviews, recall, and an online store — one system, wrapped around the PMS you already run.',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: plans.length,
      offers: plans.map((p) => ({
        '@type': 'Offer',
        name: `${p.name} plan`,
        price: p.price,
        priceCurrency: 'USD',
      })),
    },
    publisher: { '@type': 'Organization', name: MARKETING.companyName, url: SITE_URL },
  }
}

export function faqPageLd(faqs: ReadonlyArray<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

export function breadcrumbLd(items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  }
}

/** Render one or more JSON-LD objects as script tags. */
export function JsonLd({ data }: { data: object | object[] }) {
  const items = Array.isArray(data) ? data : [data]
  return (
    <>
      {items.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d) }} />
      ))}
    </>
  )
}
