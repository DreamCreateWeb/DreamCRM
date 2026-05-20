import { ImageResponse } from 'next/og'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const alt = 'Clinic website'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

interface Params {
  slug: string
}

/**
 * Dynamic per-clinic Open Graph image. Rendered server-side via Next.js
 * ImageResponse — no external assets beyond the optional hero photo.
 * Falls back to a warm-neutral panel with the clinic name + tagline so
 * shares always look intentional, never broken.
 */
export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  const name = data?.profile.displayName ?? data?.orgName ?? 'Dental clinic'
  const tagline =
    data?.profile.tagline ?? 'No judgment, ever. Just better dental care.'
  const brand = data?.profile.brandColor ?? '#9CAF9F'
  const heroImageUrl = data?.profile.heroImageUrl ?? null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FAF7F2',
          color: '#1C1A17',
          position: 'relative',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {heroImageUrl && (
          <>
            <img
              src={heroImageUrl}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(105deg, #FAF7F2 0%, rgba(250,247,242,0.95) 40%, rgba(250,247,242,0.55) 70%, transparent 100%)',
                display: 'flex',
              }}
            />
          </>
        )}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '80px',
            width: '100%',
            height: '100%',
          }}
        >
          <div style={{ display: 'flex' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: brand,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                fontWeight: 700,
              }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '70%' }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: brand,
                textTransform: 'uppercase',
                letterSpacing: 4,
                marginBottom: 16,
                display: 'flex',
              }}
            >
              {data?.profile.city
                ? `${data.profile.city}${data.profile.state ? ', ' + data.profile.state : ''}`
                : 'Dental Care'}
            </div>
            <div
              style={{
                fontSize: 76,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: -2,
                marginBottom: 24,
                display: 'flex',
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: 32,
                lineHeight: 1.4,
                color: '#6B635A',
                display: 'flex',
              }}
            >
              {tagline}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
