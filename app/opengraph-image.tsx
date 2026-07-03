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
 * The mark is the Dream Create liquid-D, inlined as an SVG data-URI <img>
 * (Satori can't run the useId-based React component — same pattern as
 * app/icon.tsx). The wordmark is the company brand; "DreamCRM" is the product.
 */
const MARK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 68">
  <defs>
    <linearGradient id="d" x1="46" y1="4" x2="16" y2="62" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.tealLight}"/>
      <stop offset="0.55" stop-color="${BRAND.teal}"/>
      <stop offset="1" stop-color="${BRAND.tealDeep}"/>
    </linearGradient>
  </defs>
  <path fill="url(#d)" fill-rule="evenodd" d="M20 5h11.5C48.3 5 58.8 15.8 58.8 31.5S48.3 58 31.5 58h-8.2c-3.1 0-4.4 3.1-7.1 2.1-2.3-.9-1.5-4-2.6-6.2-.5-1-.8-2.3-.8-3.9V11.8C12.8 7.5 15.5 5 20 5Zm5.6 12.6c-1.5 0-2.3.8-2.3 2.3v24.2c0 1.5.8 2.3 2.3 2.3h5.6c10.4 0 16.5-5.7 16.5-14.4S41.6 17.6 31.2 17.6h-5.6Z"/>
  <circle cx="10.6" cy="64.2" r="2.3" fill="${BRAND.tealDeep}"/>
  <ellipse cx="19.4" cy="64.8" rx="1.7" ry="2.5" fill="${BRAND.teal}" transform="rotate(14 19.4 64.8)"/>
  <circle cx="7.4" cy="57.2" r="1.3" fill="${BRAND.teal}"/>
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
            'radial-gradient(circle at 20% 10%, rgba(42,127,140,0.40) 0%, transparent 45%), radial-gradient(circle at 85% 90%, rgba(77,205,196,0.22) 0%, transparent 40%)',
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
