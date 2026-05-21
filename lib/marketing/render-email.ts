import 'server-only'
import { encodeToken } from './tokens'

/**
 * Render a campaign body (HTML produced by Tiptap) into a sent-ready HTML
 * email — branded shell + tracking pixel + URL rewriting + unsubscribe footer.
 *
 * We keep this dead simple: a single column, inline styles, no fancy
 * tables/MSO conditionals. Modern email clients (Gmail / Outlook 2019+ /
 * Apple Mail) render this fine; if we need legacy Outlook support we can
 * layer react-email on top later.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dreamcreatestudio.com'

export interface RenderOptions {
  campaignId: number
  recipientEmail: string
  /** Set when recipient comes from the SaaS lead/customers table. */
  recipientCustomerId?: number
  /** Set when recipient comes from the clinic patient table. Mutually
   * exclusive with recipientCustomerId in practice — the send orchestrator
   * supplies one or the other based on audience.recipientSource. */
  recipientPatientId?: string
  subject: string
  previewText?: string | null
  bodyHtml: string
  /** Shown in the footer right above the unsubscribe link. */
  fromName?: string
  /** Postal address required by CAN-SPAM. */
  postalAddress?: string
  /** Set false on test sends to skip recording opens/clicks. */
  tracking?: boolean
}

const ALLOWED_HTTP_URL = /^https?:\/\//i

export function renderCampaignEmail(opts: RenderOptions): { html: string; text: string } {
  const tracking = opts.tracking ?? true
  const body = tracking ? rewriteLinks(opts.bodyHtml, opts) : opts.bodyHtml
  const trackingPixel = tracking
    ? `<img src="${APP_URL}/api/track/open/${encodeToken({
        c: opts.campaignId,
        e: opts.recipientEmail.toLowerCase(),
        i: opts.recipientCustomerId,
        pi: opts.recipientPatientId,
        p: 'o',
      })}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />`
    : ''
  const unsubUrl = `${APP_URL}/api/unsub/${encodeToken({
    c: opts.campaignId,
    e: opts.recipientEmail.toLowerCase(),
    i: opts.recipientCustomerId,
    pi: opts.recipientPatientId,
    p: 'u',
  })}`

  const preheader = opts.previewText
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(
        opts.previewText,
      )}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(opts.subject)}</title>
  <style>
    body{margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;line-height:1.55}
    a{color:#0c4a6e;text-decoration:underline}
    .container{max-width:600px;margin:0 auto;background:#ffffff}
    .pad{padding:32px 40px}
    .footer{padding:24px 40px;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c;background:#fafaf9}
    .footer a{color:#57534e}
    h1,h2,h3{color:#0c0a09;margin:0 0 12px}
    p{margin:0 0 14px}
    img{max-width:100%;height:auto}
    ul,ol{margin:0 0 14px 24px;padding:0}
    blockquote{border-left:3px solid #d6d3d1;margin:0 0 14px;padding:4px 0 4px 16px;color:#57534e}
  </style>
</head>
<body>
  ${preheader}
  <div class="container">
    <div class="pad">
      ${body}
    </div>
    <div class="footer">
      ${opts.fromName ? `<p style="margin:0 0 6px;color:#1c1917"><strong>${escapeHtml(opts.fromName)}</strong></p>` : ''}
      ${opts.postalAddress ? `<p style="margin:0 0 12px">${escapeHtml(opts.postalAddress)}</p>` : ''}
      <p style="margin:0">
        Not interested anymore? <a href="${unsubUrl}">Unsubscribe</a>
      </p>
    </div>
  </div>
  ${trackingPixel}
</body>
</html>`

  // crude text fallback: strip tags
  const text = opts.bodyHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

  return { html, text: `${text}\n\nUnsubscribe: ${unsubUrl}` }
}

function rewriteLinks(html: string, opts: RenderOptions): string {
  // Naive but effective for Tiptap-emitted HTML. Replace href="<url>" inside
  // <a> tags with our tracked redirect URL. Skips anchors that already point
  // to mailto: / tel: / # / unsubscribe.
  return html.replace(/href=("|')([^"']+)\1/gi, (match, quote, url) => {
    if (!ALLOWED_HTTP_URL.test(url)) return match
    const token = encodeToken({
      c: opts.campaignId,
      e: opts.recipientEmail.toLowerCase(),
      i: opts.recipientCustomerId,
      pi: opts.recipientPatientId,
      p: 'k',
      u: url,
    })
    const tracked = `${APP_URL}/api/track/click/${token}`
    return `href=${quote}${tracked}${quote}`
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
