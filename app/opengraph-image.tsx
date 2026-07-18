import { ImageResponse } from 'next/og'
import { BRAND } from '@/components/brand/dream-create-logo'

export const runtime = 'nodejs'
export const alt = 'DreamCRM — the front-office platform for dental practices'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Branded OG card for the marketing site (link shares on social/Slack).
 * Same register as the site: ink ground, brand-teal accent, dense type.
 *
 * The mark is the v3 Dream Bubble D, inlined as an SVG data-URI <img>
 * (Satori can't run the useId-based React component — same pattern as
 * app/icon.tsx). The wordmark is the company brand; "DreamCRM" is the product.
 */
const MARK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="61" viewBox="0 0 80 76">
  <defs>
    <linearGradient id="d" x1="0" y1="0" x2="56" y2="76" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.blueLight}"/>
      <stop offset="0.55" stop-color="${BRAND.blue}"/>
      <stop offset="1" stop-color="${BRAND.blueDeep}"/>
    </linearGradient>
  </defs>
  <path fill="url(#d)" fill-rule="evenodd" d="M24 4h12c20.4 0 34 12.4 34 29s-13.6 29-34 29H24c-6.1 0-10-3.9-10-10V14c0-6.1 3.9-10 10-10Zm7 15.5c-2.6 0-4 1.4-4 4v19c0 2.6 1.4 4 4 4h5.5c11.6 0 18.5-5.2 18.5-13.5S48.1 19.5 36.5 19.5H31Z"/>
  <ellipse cx="30" cy="12.5" rx="9" ry="3.6" fill="#fff" opacity="0.35" transform="rotate(-10 30 12.5)"/>
  <circle cx="15" cy="67" r="5" fill="url(#d)"/>
  <circle cx="6.5" cy="74" r="2.6" fill="${BRAND.blueLight}"/>
</svg>`

export default function OpengraphImage() {
  const markUri = `data:image/svg+xml;utf8,${encodeURIComponent(MARK_SVG)}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#030712',
          backgroundImage:
            'radial-gradient(circle at 20% 10%, rgba(76,125,240,0.40) 0%, transparent 45%), radial-gradient(circle at 85% 90%, rgba(124,165,255,0.22) 0%, transparent 40%)',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markUri} width={56} height={56} alt="" />
          <div style={{ color: 'white', fontSize: 40, fontWeight: 800, letterSpacing: -0.5 }}>Dream Create</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ color: 'white', fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            Your whole front office.
          </div>
          <div style={{ color: '#4dcdc4', fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            One calm system.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#9ca3af', fontSize: 26 }}>
            Website · Booking · Portal · Reviews · Recall · Shop — keep your PMS
          </div>
          <div style={{ color: '#e5e7eb', fontSize: 26, fontWeight: 700 }}>$150–500/mo</div>
        </div>
      </div>
    ),
    size,
  )
}
