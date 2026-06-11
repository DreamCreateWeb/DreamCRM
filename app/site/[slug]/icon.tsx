import { ImageResponse } from 'next/og'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

interface Params {
  slug: string
}

/**
 * Per-clinic favicon, served for EVERY page of the clinic site via Next.js's
 * `icon` file convention (the home page additionally sets a logo `icons`
 * metadata override, but subpages relied on this route — without it they had no
 * favicon at all).
 *
 * When the clinic has a logo we render it inside the rounded tile; otherwise we
 * fall back to a brand-color tile with the clinic's first letter — the same
 * letter-mark aesthetic as the OG image's text fallback, so the favicon always
 * looks intentional, never a broken/default globe.
 */
export default async function Icon({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  const name = data?.profile.displayName ?? data?.orgName ?? 'D'
  const brand = data?.profile.brandColor ?? '#9CAF9F'
  const logoUrl = data?.profile.logoUrl ?? null
  const letter = name.charAt(0).toUpperCase() || 'D'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: brand,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            width={64}
            height={64}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              color: 'white',
              fontSize: 40,
              fontWeight: 700,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {letter}
          </div>
        )}
      </div>
    ),
    { ...size },
  )
}
