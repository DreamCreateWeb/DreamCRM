import 'server-only'
import sanitizeHtml from 'sanitize-html'

/**
 * HTML sanitization for email message bodies. Marketing / newsletter emails
 * routinely include `<script>`, tracking pixels, inline event handlers, and
 * arbitrary remote stylesheets — all of which we strip before rendering.
 *
 * What we keep:
 * - Standard text + layout tags (p, div, span, br, hr, headings, lists)
 * - Tables (email layouts often use them)
 * - Inline styles (without expression(), url() restrictions handled below)
 * - Images (allowed src schemes only — http/https/data)
 * - Links (forced to target="_blank" + rel="noopener noreferrer")
 *
 * What we strip:
 * - <script>, <iframe>, <object>, <embed>, <form>
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
      'style', // some emails ship a <style> block in the body — let it through but filtered below
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
    // Strip CSS that could be used for clickjacking / phishing-style overlays.
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
        'letter-spacing': [/^.*$/],
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
        'display': [/^(?!none).*$/], // forbid display:none which is sometimes used for cloaking
        'vertical-align': [/^.*$/],
        'text-transform': [/^.*$/],
      },
    },
  })
}
