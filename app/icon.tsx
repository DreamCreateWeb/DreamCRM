import { ImageResponse } from 'next/og'
import { BRAND } from '@/components/brand/dream-create-logo'

/**
 * Favicon — the v3 Dream Bubble D rendered to a 64px PNG via ImageResponse.
 * The path + gradient stops mirror `DreamCreateMark`
 * (components/brand/dream-create-logo); transparent background.
 *
 * We embed the mark as an inline SVG data-URI <img> (Satori renders that
 * reliably, and `useId` from the React component can't run in this context).
 */
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

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
