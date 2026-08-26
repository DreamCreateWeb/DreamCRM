import { appBaseUrl } from '@/lib/clinic-site-helpers'
import { buildPoweredByUrl } from '@/lib/marketing-attribution'

/**
 * The quiet "Powered by DreamCRM" credit at the very bottom of every clinic
 * public page — the Jane/Mangomint growth loop (owner ruling 2026-08-26,
 * docs/marketing-engine.md). Rendered ONCE in app/site/[slug]/layout.tsx,
 * below the active template's own footer, so every template carries it
 * without any template knowing about it.
 *
 * Rules:
 *  - Palette-var styled (the same --c-* names every template emits), so it
 *    harmonizes with whichever design the clinic picked instead of shouting
 *    a foreign brand.
 *  - The link is UTM-tagged so a click classifies as the 'powered_by'
 *    channel with the referring clinic named — this strip IS an
 *    attribution source, not decoration.
 *  - rel="nofollow": widget-style links across customer sites are a
 *    link-scheme risk for OUR domain; the loop's value is the click and the
 *    attribution, not PageRank.
 *  - Per-clinic OFF switch: clinic_profile.hide_powered_by
 *    (Website → Design). The layout gates on it; this component never
 *    reads the DB.
 */
export default function PoweredBy({ slug }: { slug: string }) {
  const href = buildPoweredByUrl(appBaseUrl(), slug)
  return (
    <div
      style={{
        background: 'var(--c-bg, #ffffff)',
        borderTop: '1px solid var(--c-border, #e5e5e0)',
        padding: '0.75rem 1rem',
        textAlign: 'center',
      }}
    >
      <a
        href={href}
        rel="nofollow noopener"
        style={{
          color: 'var(--c-ink-muted, #6b6b64)',
          fontSize: '0.75rem',
          letterSpacing: '0.02em',
          textDecoration: 'none',
        }}
      >
        Powered by <span style={{ fontWeight: 600 }}>DreamCRM</span>
      </a>
    </div>
  )
}
