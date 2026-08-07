/**
 * The pre-launch page every visitor sees while a clinic's site is behind the
 * go-live lever (clinic_profile.site_live_at null). Deliberately minimal and
 * calm: the practice's name in their brand palette, a phone line when we
 * have one, no navigation — nothing a patient could rely on that the clinic
 * hasn't confirmed yet (the entire point of the lever). Renders inside the
 * site layout, so the template's palette vars are already on :root.
 *
 * noindex: the real signal is the site's robots.txt (disallow-all while not
 * live); the meta tag here is belt-and-braces for crawlers that land anyway.
 */
export default function ComingSoon({
  clinicName,
  phone,
  logoUrl,
}: {
  clinicName: string
  phone: string | null
  logoUrl: string | null
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--c-ground, #faf9f7)',
        color: 'var(--c-ink, #1f2933)',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-head-element -- rendered into body; belt-and-braces only */}
      <meta name="robots" content="noindex" />
      <div style={{ maxWidth: '28rem' }}>
        {logoUrl ? (
          // Raw <img> on purpose: the coming-soon page renders before the
          // clinic has confirmed anything, logos are small, and SiteImage's
          // width plumbing buys nothing here (documented exception to the
          // site-image guard).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            style={{ height: 56, width: 'auto', margin: '0 auto 1.5rem' }}
          />
        ) : null}
        <p
          style={{
            fontSize: '0.8rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--c-brand-strong, #36514c)',
            fontWeight: 600,
            marginBottom: '0.75rem',
          }}
        >
          Coming soon
        </p>
        <h1 style={{ fontSize: '1.9rem', lineHeight: 1.2, fontWeight: 700, marginBottom: '0.75rem' }}>
          {clinicName}
        </h1>
        <p style={{ fontSize: '1rem', color: 'var(--c-ink-soft, #52606d)', marginBottom: phone ? '1.25rem' : 0 }}>
          Our new website is on its way.
        </p>
        {phone ? (
          <p style={{ fontSize: '1rem' }}>
            Need us in the meantime?{' '}
            <a
              href={`tel:${phone.replace(/[^+\d]/g, '')}`}
              style={{ color: 'var(--c-brand-strong, #36514c)', fontWeight: 600, textDecoration: 'none' }}
            >
              {phone}
            </a>
          </p>
        ) : null}
      </div>
    </main>
  )
}
