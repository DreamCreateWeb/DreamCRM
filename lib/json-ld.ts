/**
 * Serializer for the JSON-LD structured-data blocks on the public clinic sites
 * and the marketing site.
 *
 * `JSON.stringify` on its own is NOT safe inside a script element: the HTML
 * parser ends the element at the first `</script` in its raw text, wherever
 * that sequence appears — inside a JSON string included. Everything we feed
 * these blocks is clinic-authored (FAQ answers, service descriptions, blog
 * excerpts, job descriptions, team bios), so an editor pasting a closing script
 * tag into an answer ends the element early, spills the rest of the JSON onto
 * the page as visible text, and breaks both the page and its structured data.
 * No malice required — a copied snippet does it.
 *
 * Escaping `<` as its \u003c JSON escape removes that. We escape a little
 * more than the strict minimum:
 *   - `<` and `>` — the tag delimiters, so neither a closing script tag nor
 *     `-->` can form.
 *   - `&` — so nothing downstream can re-enter markup through an entity.
 *   - U+2028 / U+2029 — legal in JSON, historically illegal unescaped in JS
 *     string literals; escaping keeps the payload safe if it is ever handed to
 *     an evaluator rather than a JSON parser.
 *
 * Every replacement is a standard JSON `\uXXXX` escape, so `JSON.parse` on the
 * result yields exactly the object that went in. Search engines see identical
 * structured data — this changes the transport, not the content.
 *
 * Render through `JsonLdScript` (components/json-ld.tsx) rather than calling
 * this directly; a guard test keeps that the only JSON-LD script tag in the app.
 */

const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

export function jsonLdHtml(data: unknown): string {
  // stringify returns undefined for undefined/functions/symbols — emit valid
  // JSON rather than crashing a page render on an empty builder result.
  const json = JSON.stringify(data) ?? 'null'
  return json.replace(/[<>&\u2028\u2029]/g, (c) => ESCAPES[c])
}
