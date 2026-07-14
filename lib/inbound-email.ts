/**
 * Inbound email (patient replies → /messages), pure helpers.
 *
 * Tier-1 patient email goes out as "{Clinic}" <slug@dreamcreatestudio.com>.
 * When INBOUND_REPLY_DOMAIN is configured (e.g. `in.dreamcreatestudio.com`,
 * MX → Resend Inbound), the Reply-To becomes `{slug}@{INBOUND_REPLY_DOMAIN}`
 * and Resend POSTs each reply to /api/webhooks/resend as `email.received`;
 * the handler routes it into the patient's message thread. Unset → the old
 * behavior (Reply-To = the clinic's own inbox) — the feature ships dark.
 *
 * Everything here is pure (no db, no next) so the routing rules are unit-
 * testable; the webhook route owns the side effects.
 */

/** The inbound-parse domain, or null when the feature is off. */
export function inboundReplyDomain(): string | null {
  const d = process.env.INBOUND_REPLY_DOMAIN?.trim().toLowerCase()
  return d || null
}

/** The Reply-To for a clinic's Tier-1 email, or null when inbound is off. */
export function inboundReplyAddress(slug: string | null | undefined): string | null {
  const domain = inboundReplyDomain()
  const s = slug?.trim().toLowerCase()
  if (!domain || !s) return null
  return `${s}@${domain}`
}

/**
 * Pull the clinic slug out of the recipient list: the first address on the
 * inbound domain wins. Case-insensitive; tolerates `Name <addr>` forms and
 * plus-tags (`slug+anything@domain` → `slug`). Null when no recipient is ours.
 */
export function parseInboundRecipientSlug(
  toAddresses: string[],
  domain: string,
): string | null {
  const d = domain.trim().toLowerCase()
  if (!d) return null
  for (const raw of toAddresses) {
    const addr = extractAddress(raw)
    const at = addr.lastIndexOf('@')
    if (at <= 0) continue
    if (addr.slice(at + 1) !== d) continue
    const local = addr.slice(0, at).split('+')[0].trim()
    if (local) return local
  }
  return null
}

/** `"Mia Torres" <mia@x.com>` → `mia@x.com`; bare addresses pass through. */
export function extractAddress(raw: string): string {
  const m = raw.match(/<([^<>\s]+@[^<>\s]+)>/)
  return (m ? m[1] : raw).trim().toLowerCase()
}

/**
 * Strip quoted history from a plain-text reply so the thread shows what the
 * patient actually typed. Heuristics (any match truncates from that line on):
 *   - "On <…> wrote:" attribution lines (Gmail/Apple Mail)
 *   - "-----Original Message-----" (Outlook)
 *   - "From: …" header block starts (forwarded/Outlook)
 *   - a run of `>`-quoted lines
 * Falls back to the full text when stripping would leave nothing.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/)
  let cut = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (
      /^On .{2,200} wrote:$/.test(line) ||
      /^-{2,}\s*Original Message\s*-{2,}$/i.test(line) ||
      /^From:\s.+@.+/i.test(line) ||
      /^_{10,}$/.test(line)
    ) {
      cut = i
      break
    }
    // A quoted block: this line and the next both start with '>'.
    if (line.startsWith('>') && (lines[i + 1] ?? '').trim().startsWith('>')) {
      cut = i
      break
    }
  }
  const stripped = lines.slice(0, cut).join('\n').trim()
  return stripped || text.trim()
}

/** Crude HTML→text for inbound bodies that arrive with no text part. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface NormalizedInboundEmail {
  fromEmail: string
  fromName: string | null
  to: string[]
  subject: string
  /** Quoted-history-stripped plain text (html-derived when no text part). */
  body: string
}

/**
 * Defensive parse of a Resend `email.received` payload — field shapes are
 * treated as untrusted (string vs {email,name}, missing parts, html-only).
 * Null when there's no usable sender or recipient.
 */
export function normalizeInboundEmail(data: unknown): NormalizedInboundEmail | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  const fromRaw = d.from
  let fromEmail = ''
  let fromName: string | null = null
  if (typeof fromRaw === 'string') {
    fromEmail = extractAddress(fromRaw)
    const m = fromRaw.match(/^\s*"?([^"<]+?)"?\s*</)
    fromName = m ? m[1].trim() : null
  } else if (fromRaw && typeof fromRaw === 'object') {
    const f = fromRaw as Record<string, unknown>
    if (typeof f.email === 'string') fromEmail = f.email.trim().toLowerCase()
    if (typeof f.name === 'string' && f.name.trim()) fromName = f.name.trim()
  }
  if (!fromEmail || !fromEmail.includes('@')) return null

  const toRaw = Array.isArray(d.to) ? d.to : d.to != null ? [d.to] : []
  const to: string[] = []
  for (const t of toRaw) {
    if (typeof t === 'string') to.push(t)
    else if (t && typeof t === 'object' && typeof (t as Record<string, unknown>).email === 'string') {
      to.push((t as Record<string, string>).email)
    }
  }
  if (to.length === 0) return null

  const subject = typeof d.subject === 'string' ? d.subject.trim() : ''
  const text = typeof d.text === 'string' ? d.text : ''
  const html = typeof d.html === 'string' ? d.html : ''
  const plain = text.trim() || (html ? htmlToPlainText(html) : '')
  const body = stripQuotedReply(plain)

  return { fromEmail, fromName, to, subject, body }
}
