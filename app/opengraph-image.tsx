import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const alt = 'DreamCRM — the front-office platform for dental practices'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Branded OG card for the marketing site (link shares on social/Slack).
 * Same register as the site: ink ground, violet accent, dense type.
 */
export default function OpengraphImage() {
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
            'radial-gradient(circle at 20% 10%, rgba(124,58,237,0.35) 0%, transparent 45%), radial-gradient(circle at 85% 90%, rgba(124,58,237,0.25) 0%, transparent 40%)',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: '#7c3aed',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 800,
            }}
          >
            D
          </div>
          <div style={{ color: 'white', fontSize: 36, fontWeight: 700 }}>DreamCRM</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ color: 'white', fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            Your whole front office.
          </div>
          <div style={{ color: '#a78bfa', fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            One calm system.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#9ca3af', fontSize: 26 }}>
            Website · Booking · Portal · Reviews · Recall · Shop — keep your PMS
          </div>
          <div style={{ color: '#e5e7eb', fontSize: 26, fontWeight: 700 }}>$99–199/mo</div>
        </div>
      </div>
    ),
    size,
  )
}
