import 'server-only'
import sanitizeHtml from 'sanitize-html'

/**
 * Sanitizes blog-post body HTML before it's persisted AND before it's
 * rendered on the public site. This is the single XSS chokepoint for stored
 * rich text — the Tiptap editor, AI drafts, and the demo seeder all flow
 * through `lib/services/blog.ts`, which runs every write through here.
 *
 * Tighter than `sanitizeEmailHtml`: the blog body renders inside a Tailwind
 * `prose` container, so we keep semantic tags only and strip inline styles,
 * classes, ids, scripts, iframes, forms, and event handlers. Links keep their
 * href (internal links are an SEO signal we don't want to nofollow) but get
 * `rel="noopener noreferrer"` to prevent tab-nabbing. Images are limited to
 * http/https (no `data:` — keeps stored HTML small; cover/inline images come
 * from S3 URLs).
 */
export function sanitizeBlogHtml(html: string): string {
  if (!html) return ''
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4',
      'strong', 'b', 'em', 'i', 's', 'del', 'u', 'mark', 'sub', 'sup',
      'blockquote', 'pre', 'code',
      'ul', 'ol', 'li',
      'a', 'img',
      'figure', 'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, rel: 'noopener noreferrer' },
      }),
    },
  })
}
