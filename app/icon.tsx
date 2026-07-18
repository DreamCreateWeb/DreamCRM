import { ImageResponse } from 'next/og'
import { BRAND } from '@/components/brand/dream-create-logo'

/**
 * Favicon — the Dream Create liquid-D mark rendered to a 64px PNG via
 * ImageResponse. The path + gradient stops mirror `DreamCreateMark`
 * (components/brand/dream-create-logo); transparent background.
 *
 * We embed the mark as an inline SVG data-URI <img> (Satori renders that
 * reliably, and `useId` from the React component can't run in this context).
 */
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

const MARK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 68">
  <defs>
    <linearGradient id="d" x1="46" y1="4" x2="16" y2="62" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.blueLight}"/>
      <stop offset="0.55" stop-color="${BRAND.blue}"/>
      <stop offset="1" stop-color="${BRAND.blueDeep}"/>
    </linearGradient>
  </defs>
  <path fill="url(#d)" fill-rule="evenodd" d="M20 5h11.5C48.3 5 58.8 15.8 58.8 31.5S48.3 58 31.5 58h-8.2c-3.1 0-4.4 3.1-7.1 2.1-2.3-.9-1.5-4-2.6-6.2-.5-1-.8-2.3-.8-3.9V11.8C12.8 7.5 15.5 5 20 5Zm5.6 12.6c-1.5 0-2.3.8-2.3 2.3v24.2c0 1.5.8 2.3 2.3 2.3h5.6c10.4 0 16.5-5.7 16.5-14.4S41.6 17.6 31.2 17.6h-5.6Z"/>
  <circle cx="10.6" cy="64.2" r="2.3" fill="${BRAND.blueDeep}"/>
  <ellipse cx="19.4" cy="64.8" rx="1.7" ry="2.5" fill="${BRAND.blue}" transform="rotate(14 19.4 64.8)"/>
  <circle cx="7.4" cy="57.2" r="1.3" fill="${BRAND.blue}"/>
</svg>`

export default function Icon() {
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(MARK_SVG)}`
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} width={64} height={64} alt="" />
      </div>
    ),
    { ...size },
  )
}
