import type { Metadata } from 'next'
import { MARKETING } from './site'
import JsonLdScript from '@/components/json-ld'

/**
 * SEO helpers for the public marketing site: canonical site URL + schema.org
 * JSON-LD builders. The product sells SEO to clinics, so the marketing site
 * models the same best practice (Organization, SoftwareApplication + Offers,
 * FAQPage, BreadcrumbList). Builders are pure + return plain objects; `JsonLd`
 * renders them through the shared `JsonLdScript`, which owns the escaping.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')
export const LOGO_URL = `${SITE_URL}/images/dream-create-logo-blue.png`

/**
 * The share card every marketing page uses — `app/opengraph-image.tsx`, the
 * root file convention (1200×630). Named here because a page-level
 * `openGraph` block REPLACES the inherited one wholesale, file-convention
 * image included; a page that sets its own `og:url` without re-stating the
 * image ships a share card with no picture.
 */
const SHARE_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: `${MARKETING.productName} — ${MARKETING.tagline.toLowerCase()}`,
}

/**
 * THE ONE SHAPE OF A MARKETING PAGE'S HEAD.
 *
 * Every page under `app/(marketing)` builds its `metadata` here, so the four
 * things a crawler and a link preview read are present on all of them and
 * can never disagree with each other:
 *
 *  - `canonical` — the page's own address. The live crawl that prompted this
 *    (2026-11-23) found the HOMEPAGE and the grader with none, on a site that
 *    is reachable on three hosts (apex, `www`, `app.`) and whose ad landings
 *    will arrive carrying `utm_*`/`gclid` query strings — the exact shape a
 *    canonical exists for.
 *  - `og:url` + `og:type` + `og:site_name` — absent on every page but the
 *    blog posts, which had hand-written their own.
 *  - the share image, re-stated (see `SHARE_IMAGE`).
 *  - a Twitter card whose copy matches the Open Graph copy.
 *
 * `path` is site-relative and resolved against the root layout's
 * `metadataBase`, so the helper needs no base URL of its own. `social` is for
 * the page whose link-preview line should read differently from its search
 * snippet (the homepage); omitted, both read the same.
 *
 * Held by `tests/marketing/page-head.test.ts`, which walks every marketing
 * route and fails on one that builds its head by hand.
 */
export function pageMetadata(input: {
  title: string
  description: string
  path: string
  social?: { title?: string; description?: string }
  type?: 'website' | 'article'
}): Metadata {
  const socialTitle = input.social?.title ?? input.title
  const socialDescription = input.social?.description ?? input.description
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      url: input.path,
      siteName: MARKETING.productName,
      type: input.type ?? 'website',
      locale: 'en_US',
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: socialDescription,
      images: [SHARE_IMAGE.url],
    },
  }
}

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

export function articleLd(input: {
  title: string
  description: string
  path: string
  datePublished: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    datePublished: input.datePublished,
    url: `${SITE_URL}${input.path}`,
    author: { '@type': 'Organization', name: MARKETING.companyName, url: SITE_URL },
    publisher: { '@type': 'Organization', name: MARKETING.companyName, url: SITE_URL, logo: { '@type': 'ImageObject', url: LOGO_URL } },
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
        <JsonLdScript key={i} data={d} />
      ))}
    </>
  )
}
