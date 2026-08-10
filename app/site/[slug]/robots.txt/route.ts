import { NextResponse } from 'next/server'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { resolveTrialState } from '@/lib/trial'

interface Params {
  slug: string
}

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { slug } = await ctx.params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return new NextResponse('Not found', { status: 404 })

  // Behind the go-live lever, the only page visitors get is the coming-soon
  // placeholder — tell crawlers to stay out entirely so a pre-launch site
  // never gets indexed as "Coming soon". A SHUT-DOWN clinic (expired trial,
  // owner ruling: everything dies) gates the same way.
  if (!data.profile.siteLiveAt || resolveTrialState(data.profile).expired) {
    return new NextResponse('User-agent: *\nDisallow: /\n', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // Short cache: the lever flip should reach crawlers quickly.
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    })
  }

  const base = publicSiteUrl(data)
  const body = `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
