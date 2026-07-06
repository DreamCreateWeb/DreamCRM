import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED } from '@/components/clinic-site/tokens'


/**
 * Clinic-site 404 — shown when a slug doesn't resolve to a clinic. We have no
 * clinic data here (the clinic doesn't exist), so MinimalSiteChrome renders its
 * neutral fallback (sage accent + "Dental Care" wordmark, no back link). Still
 * the warm #FAF7F2 ground + Fraunces display so it doesn't drop to bare gray.
 */
export default function ClinicNotFound() {
  return (
    <MinimalSiteChrome homeHref={null}>
      <div className="flex items-center justify-center px-4 py-24 sm:py-32">
        <div className="text-center max-w-md">
          <p className="text-5xl mb-6" aria-hidden="true">
            🦷
          </p>
          <h1
            className="text-3xl sm:text-4xl font-semibold mb-3 tracking-tight"
            style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            Clinic not found
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: INK_MUTED }}>
            This clinic website doesn&rsquo;t exist, or the link may have changed.
          </p>
        </div>
      </div>
    </MinimalSiteChrome>
  )
}
