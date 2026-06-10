import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated surfaces — crawlers get redirected anyway; this keeps
        // them from even trying.
        disallow: [
          '/dashboard',
          '/patients',
          '/appointments',
          '/settings',
          '/patient',
          '/posts',
          '/api',
          // Token-authenticated patient surfaces: these return 200 to anyone
          // with the link and render patient names — crawlers must not index
          // them (the pages also carry noindex metadata, belt + suspenders).
          '/r/',
          '/accept-invite',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
