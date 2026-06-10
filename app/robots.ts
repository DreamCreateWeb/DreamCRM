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
        disallow: ['/dashboard', '/patients', '/appointments', '/settings', '/patient', '/api'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
