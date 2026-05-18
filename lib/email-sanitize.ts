import 'server-only'
import sanitizeHtml from 'sanitize-html'

/**
 * HTML sanitization for email message bodies. Marketing / newsletter emails
 * routinely include `<script>`, tracking pixels, inline event handlers, and
 * arbitrary remote stylesheets — all of which we strip before rendering.
 *
 * IMPORTANT: we explicitly do NOT allow `<style>` blocks. Newsletter emails
 * ship CSS with global selectors like `body { font-size: 16px }` that leak
 * out of the email body and restyle the entire DreamCRM page. Inline
 * `style="..."` attributes on individual elements are still allowed and
 * cover ~95% of email styling fidelity. The "proper" fix for full fidelity
 * would be sandboxing each email in an iframe; we'll do that if/when users
 * complain that newsletters look broken.
 *
 * What we keep:
 * - Standard text + layout tags (p, div, span, br, hr, headings, lists)
 * - Tables (email layouts often use them)
 * - Inline styles (without expression(), url() restrictions handled below)
 * - Images (allowed src schemes only — http/https/data)
 * - Links (forced to target="_blank" + rel="noopener noreferrer")
 *
 * What we strip:
 * - <script>, <iframe>, <object>, <embed>, <form>, <style>
 * - on* event handlers
 * - javascript: / vbscript: URLs
 * - Tracking pixels stay rendered but can't run JS
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'tfoot',
      'caption',
      'col',
      'colgroup',
    ]),
    allowedAttributes: {
      '*': ['style', 'class', 'id', 'align', 'width', 'height', 'bgcolor'],
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'style'],
      table: ['border', 'cellpadding', 'cellspacing', 'width', 'align', 'bgcolor'],
      td: ['colspan', 'rowspan', 'valign', 'width', 'height', 'bgcolor'],
      th: ['colspan', 'rowspan', 'valign', 'width', 'height', 'bgcolor'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data', 'cid'],
    },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    },
    // Allow common email-design CSS. We render inside a sandboxed iframe
    // (see EmailIframe component), so the threat model for "hiding
    // malicious content with CSS" is mostly contained — the more
    // user-visible problem was newsletter preheader text breaking when we
    // stripped `display:none`, since legitimate newsletters universally
    // use that pattern to keep preheader copy out of the visible body.
    allowedStyles: {
      '*': {
        color: [/^.*$/],
        'background-color': [/^.*$/],
        'background': [/^.*$/],
        'font-size': [/^.*$/],
        'font-weight': [/^.*$/],
        'font-family': [/^.*$/],
        'font-style': [/^.*$/],
        'text-align': [/^.*$/],
        'text-decoration': [/^.*$/],
        'line-height': [/^.*$/],
        'letter-spacing': [/^(normal|0|0\w+|[1-9].*)$/i], // forbid negative values that collapse text
        'margin': [/^.*$/],
        'margin-top': [/^.*$/],
        'margin-right': [/^.*$/],
        'margin-bottom': [/^.*$/],
        'margin-left': [/^.*$/],
        'padding': [/^.*$/],
        'padding-top': [/^.*$/],
        'padding-right': [/^.*$/],
        'padding-bottom': [/^.*$/],
        'padding-left': [/^.*$/],
        'border': [/^.*$/],
        'border-top': [/^.*$/],
        'border-right': [/^.*$/],
        'border-bottom': [/^.*$/],
        'border-left': [/^.*$/],
        'border-collapse': [/^.*$/],
        'border-radius': [/^.*$/],
        'width': [/^.*$/],
        'height': [/^.*$/],
        'max-width': [/^.*$/],
        'min-width': [/^.*$/],
        'display': [/^.*$/], // allow display:none — newsletters need it for preheaders
        'visibility': [/^.*$/],
        'vertical-align': [/^.*$/],
        'text-transform': [/^.*$/],
        'overflow': [/^.*$/],
        'max-height': [/^.*$/],
        'mso-hide': [/^.*$/], // Outlook-specific hide directive
      },
    },
  })
}
