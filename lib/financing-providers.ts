import type { ClinicFinancingPartner } from '@/lib/types/clinic-content'

/**
 * PATIENT FINANCING PROVIDERS (2026-10-09) — the registry behind Website →
 * Content → Financing. Nearly every US dental practice offers third-party
 * financing, and every provider connects to a website differently, so the
 * clinic should never have to read a vendor's web-designer email: it picks
 * the provider, pastes the ONE thing that provider hands out, and the site
 * does the rest. The research record (how each one actually connects, what
 * it hands the practice, what we render) is docs/financing-providers.md.
 *
 * Two connection kinds exist in the wild:
 *   - a SLUG the provider mints per practice, which both builds an apply link
 *     and (for Cherry and Sunbit) drives an embeddable widget;
 *   - a LINK the provider mints per practice (CareCredit's custom link from
 *     Provider Center, Proceed / Alphaeon / LendingClub / Scratchpay apply
 *     pages), which we button.
 * NOTHING HERE ACCEPTS RAW HTML OR SCRIPT. A clinic never pastes a vendor's
 * snippet into their site: the site builds the embed itself from a validated
 * slug, and the only third-party script that can load is the one this file
 * names. Links are https and host-checked against the provider's own domains.
 *
 * Client-safe: the editor, the public page and the layout all read it.
 */

export type FinancingProviderId = 'cherry' | 'carecredit' | 'sunbit' | 'proceed' | 'alphaeon' | 'lendingclub' | 'scratchpay' | 'other'

export type FinancingWidgetKind = 'cherry' | 'sunbit'

export interface FinancingProviderDef {
  id: FinancingProviderId
  name: string
  /** One honest line on what the product is — no rates, no promises we can't keep. */
  tagline: string
  homepage: string
  connect:
    | {
        kind: 'slug'
        label: string
        hint: string
        placeholder: string
        /** Where the practice finds it, in plain words. */
        where: string
      }
    | {
        kind: 'link'
        label: string
        hint: string
        placeholder: string
        where: string
        /** The link's host must end with one of these. */
        hosts: string[]
      }
  /** An embeddable widget this provider offers, driven by the slug. */
  widget: FinancingWidgetKind | null
  /** The provider's own wording for the button. */
  cta: string
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/

export const FINANCING_PROVIDERS: readonly FinancingProviderDef[] = [
  {
    id: 'cherry',
    name: 'Cherry',
    tagline: 'Payment plans with a soft credit check — patients see what they qualify for in a minute.',
    homepage: 'https://withcherry.com',
    connect: {
      kind: 'slug',
      label: 'Your Cherry application link',
      hint: 'Paste the pay.withcherry.com link from your Practice Portal, or just the part after the slash.',
      placeholder: 'https://pay.withcherry.com/your-practice',
      where: 'Cherry Practice Portal → your application link (Cherry’s onboarding email names it too).',
    },
    widget: 'cherry',
    cta: 'Apply with Cherry',
  },
  {
    id: 'carecredit',
    name: 'CareCredit',
    tagline: 'A health and wellness credit card with promotional financing on qualifying purchases.',
    homepage: 'https://www.carecredit.com',
    connect: {
      kind: 'link',
      label: 'Your CareCredit custom link',
      hint: 'The location-specific apply link CareCredit makes from your Merchant ID.',
      placeholder: 'https://www.carecredit.com/apply/…',
      where: 'Provider Center → carecredit.com/customlink (the link is tied to your Merchant ID).',
      hosts: ['carecredit.com', 'synchrony.com'],
    },
    widget: null,
    cta: 'Apply with CareCredit',
  },
  {
    id: 'sunbit',
    name: 'Sunbit',
    tagline: 'Pay over time with a soft credit check and approval in seconds — no hard inquiry to see your options.',
    homepage: 'https://sunbit.com',
    connect: {
      kind: 'slug',
      label: 'Your Sunbit pre-qualification link',
      hint: 'Paste the apply.sunbit.com link, or just the part after the slash.',
      placeholder: 'https://apply.sunbit.com/your-practice',
      where: 'Sunbit merchant portal → marketing kit → your pre-qualification page.',
    },
    widget: 'sunbit',
    cta: 'See your options with Sunbit',
  },
  {
    id: 'proceed',
    name: 'Proceed Finance',
    tagline: 'Longer-term loans for larger treatment plans, applied for online.',
    homepage: 'https://www.proceedfinance.com',
    connect: {
      kind: 'link',
      label: 'Your Proceed Finance apply link',
      hint: 'The practice-specific application link Proceed gave you.',
      placeholder: 'https://…proceedfinance.com/…',
      where: 'Your Proceed Finance provider portal, or ask your Proceed representative.',
      hosts: ['proceedfinance.com'],
    },
    widget: null,
    cta: 'Apply with Proceed Finance',
  },
  {
    id: 'alphaeon',
    name: 'Alphaeon Credit',
    tagline: 'A credit card for dental care with pre-qualification that doesn’t affect credit scores.',
    homepage: 'https://www.myalphaeoncredit.com',
    connect: {
      kind: 'link',
      label: 'Your Alphaeon apply link',
      hint: 'The practice-specific application link from Alphaeon.',
      placeholder: 'https://…alphaeon…/…',
      where: 'Your Alphaeon provider portal, or ask their enrollment team.',
      hosts: ['myalphaeoncredit.com', 'alphaeoncredit.com', 'goalphaeon.com', 'alphaeon.com'],
    },
    widget: null,
    cta: 'Apply with Alphaeon',
  },
  {
    id: 'lendingclub',
    name: 'LendingClub Patient Solutions',
    tagline: 'Installment loans for treatment, with a pre-qualification that doesn’t affect credit scores.',
    homepage: 'https://www.lendingclub.com/patient-solutions',
    connect: {
      kind: 'link',
      label: 'Your LendingClub apply link',
      hint: 'The practice-specific application link from LendingClub Patient Solutions.',
      placeholder: 'https://www.lendingclub.com/…',
      where: 'Your LendingClub Patient Solutions provider portal.',
      hosts: ['lendingclub.com'],
    },
    widget: null,
    cta: 'Apply with LendingClub',
  },
  {
    id: 'scratchpay',
    name: 'Scratchpay',
    tagline: 'Simple payment plans with a quick online application.',
    homepage: 'https://scratchpay.com',
    connect: {
      kind: 'link',
      label: 'Your Scratchpay practice page',
      hint: 'The scratchpay.com page that names your practice.',
      placeholder: 'https://scratchpay.com/consumer/…',
      where: 'Your Scratchpay provider dashboard → your practice’s consumer page.',
      hosts: ['scratchpay.com'],
    },
    widget: null,
    cta: 'Apply with Scratchpay',
  },
  {
    id: 'other',
    name: 'Another provider',
    tagline: '',
    homepage: '',
    connect: {
      kind: 'link',
      label: 'Apply or info link',
      hint: 'Any https link the provider gave you.',
      placeholder: 'https://…',
      where: 'The provider’s own instructions.',
      hosts: [],
    },
    widget: null,
    cta: 'Learn more',
  },
]

export function financingProvider(id: string | null | undefined): FinancingProviderDef | null {
  return FINANCING_PROVIDERS.find((p) => p.id === id) ?? null
}

export function isFinancingProviderId(v: unknown): v is FinancingProviderId {
  return typeof v === 'string' && FINANCING_PROVIDERS.some((p) => p.id === v)
}

/** The Cherry application link for a slug — the exact shape Cherry's onboarding hands a practice. */
export function cherryApplyUrl(slug: string): string {
  return `https://pay.withcherry.com/${slug}?utm_source=merchant&utm_medium=website`
}

/** The Sunbit pre-qualification page for a slug — what their iframe template embeds. */
export function sunbitApplyUrl(slug: string): string {
  return `https://apply.sunbit.com/${slug}`
}

const SLUG_HOSTS: Record<'cherry' | 'sunbit', string[]> = {
  cherry: ['pay.withcherry.com', 'withcherry.com'],
  sunbit: ['apply.sunbit.com', 'sunbit.com'],
}

function hostAllowed(host: string, hosts: string[]): boolean {
  const h = host.toLowerCase()
  return hosts.some((allowed) => h === allowed || h.endsWith(`.${allowed}`))
}

export type ParsedConnect = { ok: true; slug: string } | { ok: true; url: string } | { ok: false; error: string }

/**
 * What the practice pasted → the one value we store. A slug provider takes
 * the bare slug OR the full link (the path's first segment, host-checked);
 * a link provider takes an https link on the provider's own domain. The
 * "other" provider takes any https link.
 */
export function parseConnectValue(providerId: FinancingProviderId, raw: string): ParsedConnect {
  const def = financingProvider(providerId)
  if (!def) return { ok: false, error: 'Pick a provider first.' }
  const text = (raw ?? '').trim()
  if (!text) return { ok: false, error: `Paste ${def.connect.label.toLowerCase()}.` }
  if (def.connect.kind === 'slug') {
    const hosts = SLUG_HOSTS[providerId as 'cherry' | 'sunbit']
    let candidate = text
    if (/^https?:\/\//i.test(text) || text.includes('/')) {
      let url: URL
      try {
        url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
      } catch {
        return { ok: false, error: 'That doesn’t look like a link.' }
      }
      if (!hostAllowed(url.hostname, hosts)) return { ok: false, error: `That link isn’t a ${def.name} link (expected ${hosts[0]}).` }
      candidate = url.pathname.split('/').filter(Boolean)[0] ?? ''
    }
    candidate = candidate.toLowerCase()
    if (!SLUG.test(candidate)) return { ok: false, error: `${def.name} links look like ${def.connect.placeholder} — letters, numbers and dashes.` }
    return { ok: true, slug: candidate }
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, error: 'Paste the full link, starting with https://' }
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'The link has to start with https://' }
  if (def.connect.hosts.length && !hostAllowed(url.hostname, def.connect.hosts)) {
    return { ok: false, error: `That link isn’t on ${def.name}’s site (expected ${def.connect.hosts[0]}).` }
  }
  return { ok: true, url: url.toString() }
}

/** The partner as the site renders it: the provider's facts filled in around what the clinic stored. */
export interface ResolvedFinancingPartner {
  id: string
  provider: FinancingProviderId | null
  name: string
  description: string | null
  applyUrl: string | null
  logoUrl: string | null
  slug: string | null
  /** The provider's widget, when the clinic turned it on and the slug is there. */
  widget: FinancingWidgetKind | null
  /** Cherry's floating "Pay over time" button on every page. */
  floating: boolean
  cta: string
}

export function resolveFinancingPartner(p: ClinicFinancingPartner): ResolvedFinancingPartner {
  const def = financingProvider(p.provider)
  const slug = def?.connect.kind === 'slug' && typeof p.slug === 'string' && SLUG.test(p.slug) ? p.slug : null
  const applyUrl =
    def?.id === 'cherry' && slug ? cherryApplyUrl(slug) : def?.id === 'sunbit' && slug ? sunbitApplyUrl(slug) : p.applyUrl?.trim() || null
  const name = p.name?.trim() || def?.name || ''
  return {
    id: p.id,
    provider: def?.id ?? null,
    name,
    description: p.description?.trim() || (def && def.id !== 'other' ? def.tagline : null),
    applyUrl,
    logoUrl: p.logoUrl?.trim() || null,
    slug,
    widget: def?.widget && slug && p.showWidget === true ? def.widget : null,
    floating: def?.id === 'cherry' && !!slug && p.floatingButton === true,
    cta: def?.cta ?? 'Learn more',
  }
}

/** Every partner the site should show, in the clinic's order (first = primary), nameless rows dropped. */
export function resolveFinancingPartners(list: unknown): ResolvedFinancingPartner[] {
  if (!Array.isArray(list)) return []
  return (list as ClinicFinancingPartner[])
    .filter((p) => p && typeof p === 'object' && (typeof p.name === 'string' && p.name.trim().length > 0 || isFinancingProviderId((p as ClinicFinancingPartner).provider)))
    .map(resolveFinancingPartner)
    .filter((p) => p.name)
}

/** The Cherry floating button, when any partner carries it — the layout paints it on every page. */
export function cherryFloatingFrom(list: unknown): { slug: string; name: string } | null {
  const hit = resolveFinancingPartners(list).find((p) => p.floating && p.slug)
  return hit ? { slug: hit.slug!, name: hit.name } : null
}

// ── Cherry's widget contract ───────────────────────────────────────────

/** The only third-party script this feature can load. */
export const CHERRY_WIDGET_SRC = 'https://files.withcherry.com/widgets/widget.js'
/** Cherry's full-page widget, section by section, in the order their generator emits. */
export const CHERRY_FULL_PAGE_SECTIONS = ['hero', 'calculator', 'howitworks', 'faq'] as const
export const CHERRY_FLOATING_SECTION = 'floatingEstimator'

/**
 * WHERE THE FLOATING BUTTON LIVES (2026-10-12, the cross-template pass).
 * Cherry's default corner is bottom-RIGHT — exactly where every template's
 * own Call / Book stack sits (the shared floating stack on modern, the
 * bottom-right pair on established and hometeam, the full-width bars on
 * cosmetic and hometown, the centred pair on pediatric). Cherry's own
 * bottom-LEFT mode parks the button 90px up the left edge: above the
 * site's chat bubble (bottom 16px, 48px tall), above every mobile bar
 * (≤60px), and away from the stacks on the right. Their widget hardcodes
 * z-index 9999 on that mode, which would float the button over an open
 * mobile menu (z-50); `CherryWidget` pins it to this value instead —
 * above the floating stack (z-30) and the chat bubble (z-40), under the
 * header's menus and the editor's draft banner (z-60).
 */
export const CHERRY_FLOATING_POSITION = 'bottom-left' as const
export const CHERRY_FLOATING_Z_INDEX = 35
/**
 * How far up the left edge the button sits, measured in Chromium on every
 * template (2026-10-12): Cherry's bottom-left mode parks it IN the corner
 * (bottom 32px, left 16–32px), on top of the chat bubble (bottom 16px, ~48px
 * tall) and, on a phone, on top of the full-width Call / Book bars (≤63px).
 * The config's `offset.y` is honoured in that mode, so: above the bubble
 * when the chat is on, and always above the bars under the `sm` breakpoint
 * (`CHERRY_FLOATING_MOBILE_CSS` forces it there — the bars hide at `sm`).
 */
export const CHERRY_FLOATING_OFFSET_ABOVE_CHAT = '48px'
export const CHERRY_FLOATING_OFFSET_MOBILE = '48px'

/** The body face every public site sets globally (the root layout loads it). */
export const SITE_BODY_FONT_FAMILY = 'Inter'

export interface WidgetFonts {
  body: string
  display: string
}

/**
 * The font NAMES Cherry's widget needs, from a template's `fontCss`
 * (`--font-display: 'Fraunces', Georgia, serif;`). The widget wraps whatever
 * it is given in quotes and writes it to a CSS variable, so a keyword such
 * as `inherit` turns into a font called "inherit" and the widget falls back
 * to the browser default — it has to be the real family name, which the
 * page has already loaded. The body face is the site-wide one; the display
 * face is the template's, or the body face when the template names none.
 */
export function widgetFontsFromTemplate(fontCss: string | null | undefined): WidgetFonts {
  const m = /--font-display\s*:\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z][\w-]*))/.exec(fontCss ?? '')
  const display = (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim()
  return { body: SITE_BODY_FONT_FAMILY, display: display || SITE_BODY_FONT_FAMILY }
}

export interface CherryWidgetConfig {
  debug: boolean
  variables: {
    slug: string
    name: string
    images: number[]
    customLogo: string
    defaultPurchaseAmount: number
    customImage: string
    imageCategory: 'dental'
    language: 'en'
  }
  styles: {
    primaryColor: string
    secondaryColor: string
    fontFamily: string
    headerFontFamily: string
    floatingEstimator?: {
      position: 'bottom-left' | 'bottom-right'
      offset: { x: string; y: string }
      zIndex: number
      ctaFontFamily: string
      bodyFontFamily: string
      ctaColor: string
      ctaTextColor: string
    }
  }
}

/**
 * The `_hw("init", …)` object Cherry's generator writes, built from the
 * clinic's own brand instead of the generator's colour picker. The
 * secondary colour is Cherry's convention: the primary at ~6% alpha (their
 * generator emits `#RRGGBB10`).
 */
export function cherryWidgetConfig(args: {
  slug: string
  name: string
  /** The clinic's CTA fill — `palette.brandStrong`, the brand darkened only
   *  as far as white text needs (the widget paints white on it). */
  brandHex: string
  fontFamily: string
  headerFontFamily?: string
  floating?: boolean
  /** Lift the floating button above the site's chat bubble. */
  aboveChat?: boolean
}): CherryWidgetConfig {
  const primary = /^#[0-9a-f]{6}$/i.test(args.brandHex) ? args.brandHex : '#596FD4'
  const font = args.fontFamily || SITE_BODY_FONT_FAMILY
  const headerFont = args.headerFontFamily || font
  const config: CherryWidgetConfig = {
    debug: false,
    variables: {
      slug: args.slug,
      name: args.name,
      images: [21],
      customLogo: '',
      defaultPurchaseAmount: 2000,
      customImage: '',
      imageCategory: 'dental',
      language: 'en',
    },
    styles: {
      primaryColor: primary,
      secondaryColor: `${primary}10`,
      fontFamily: font,
      headerFontFamily: headerFont,
    },
  }
  if (args.floating) {
    config.styles.floatingEstimator = {
      position: CHERRY_FLOATING_POSITION,
      offset: { x: '0px', y: args.aboveChat ? CHERRY_FLOATING_OFFSET_ABOVE_CHAT : '0px' },
      zIndex: CHERRY_FLOATING_Z_INDEX,
      ctaFontFamily: font,
      bodyFontFamily: font,
      ctaColor: primary,
      ctaTextColor: '#FFFFFF',
    }
  }
  return config
}

export const FINANCING_COPY = {
  sectionEyebrow: 'Financing',
  sectionHeading: 'Financing options we partner with.',
  primaryNote: 'Shown first and largest on your financing page.',
  widgetToggle: (name: string) => `Show ${name}’s payment estimator on the financing page`,
  sunbitToggle: 'Show Sunbit’s pre-qualify form on the financing page',
  floatingToggle: 'Floating “Pay over time” button on every page',
  floatingHint: 'Cherry’s button, bottom-right, opening their estimator. Your chat bubble stays bottom-left.',
  orderHint: 'The first partner is your primary — it leads the page. Use the arrows to reorder.',
} as const
