// Pure website-health signals — the public site's "check engine light" on the
// Overview. Client-safe (no imports); computed server-side from the same
// 7-day traffic read the Overview already loads plus a 14-day lead count.

export interface WebsiteHealthNotice {
  kind: 'traffic_drop' | 'no_leads' | 'domain_pending' | 'domain_failed'
  title: string
  body: string
  href: string
  linkLabel: string
}

/** Prior-week volume below this and a "drop" is just noise, not a signal. */
export const TRAFFIC_DROP_MIN_PRIOR = 30
/** Weekly visits at or above this make two lead-less weeks worth flagging. */
export const NO_LEADS_MIN_VISITS = 50

/**
 * Decide whether the website needs the owner's attention. Two honest signals,
 * both floored so quiet day-0 sites never false-alarm:
 *  - traffic_drop: this week ≤ half of a substantive prior week — a broken
 *    domain, a de-indexing, or a dead link somewhere upstream all look like
 *    this, and none announce themselves.
 *  - no_leads: real traffic but zero form submissions in 14 days — the site
 *    is drawing people who can't (or don't) reach out; usually a form broke
 *    or the CTAs got buried. `leads14d` null (read failed) → never flags.
 *  - domain_failed / domain_pending: the owner started a custom-domain
 *    connection and it's stuck — failed is a problem now (the domain isn't
 *    serving), pending is a gentle "DNS still hasn't landed" nudge. Both are
 *    real stored states, never inferred.
 * Priority: domain_failed → traffic_drop → domain_pending → no_leads. Pure.
 */
export function websiteHealthNotice(opts: {
  total: number
  totalPrev: number
  leads14d: number | null
  /** clinic_profile.customDomainStatus.state (null = no custom domain). */
  domainState?: 'pending_dns' | 'active' | 'failed' | null
}): WebsiteHealthNotice | null {
  const { total, totalPrev, leads14d, domainState } = opts
  if (domainState === 'failed') {
    return {
      kind: 'domain_failed',
      title: 'Your custom domain needs attention',
      body: 'The domain connection reported a problem, so your own domain isn’t serving your site right now. Your free address still works — open the domain page to see what’s stuck.',
      href: '/website/domain',
      linkLabel: 'Open Domain',
    }
  }
  if (totalPrev >= TRAFFIC_DROP_MIN_PRIOR && total <= totalPrev * 0.5) {
    const pct = Math.round((1 - total / totalPrev) * 100)
    return {
      kind: 'traffic_drop',
      title: 'Website traffic dropped this week',
      body: `${total.toLocaleString('en-US')} visit${total === 1 ? '' : 's'} in the last 7 days — down ${pct}% from ${totalPrev.toLocaleString('en-US')} the week before. Worth a look: a broken link, a domain hiccup, or a search change can all do this quietly.`,
      href: '/growth/analytics',
      linkLabel: 'Open Analytics',
    }
  }
  if (domainState === 'pending_dns') {
    return {
      kind: 'domain_pending',
      title: 'Your domain is waiting on DNS',
      body: 'You started connecting a custom domain and the DNS records haven’t landed yet. That’s normal for a few hours — if it’s been longer, double-check the two records at your registrar.',
      href: '/website/domain',
      linkLabel: 'Check the records',
    }
  }
  if (leads14d === 0 && total >= NO_LEADS_MIN_VISITS) {
    return {
      kind: 'no_leads',
      title: 'Visitors, but no leads in two weeks',
      body: `Your site had ${total.toLocaleString('en-US')} visits this week, but no form submissions in 14 days. Check that your forms still work and the book/contact buttons are easy to find.`,
      href: '/website/editor',
      linkLabel: 'Open the Studio',
    }
  }
  return null
}
