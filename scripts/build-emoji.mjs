/**
 * Rebuilds `public/emoji/` from Noto Animated Emoji.
 *
 *   node scripts/build-emoji.mjs
 *
 * Needs `sharp`, which today resolves transitively from `node_modules` — it is
 * NOT a direct dependency, and this script is deliberately not worth making it
 * one. It runs by hand when the curated set changes, never in CI and never at
 * build time; the output is committed. If the transitive copy ever disappears,
 * `npm i --no-save sharp` first rather than adding it to `package.json`.
 *
 * Three things this script encodes as decisions, all measured (DREAMCRM-56):
 *
 * 1. **96px, not 512px.** The sources are 512px and 181 KB–1.17 MB. A 40px
 *    `<img>` still downloads the whole file, so re-encoding is mandatory, not
 *    an optimisation. 96px covers a 40px slot at 2x.
 * 2. **Half frame rate.** The sources run at 30ms/frame (~33fps), which is well
 *    past what these read at. Dropping every other frame roughly halves the
 *    file and is not visible at this size.
 * 3. **A hand-picked still frame.** Frame 0 is NOT always a usable still —
 *    `popper` frame 0 is the cone before the burst, which reads as "nothing
 *    happened". `stillFrame` below is chosen per glyph by looking at the strip.
 *
 * The animated output MUST be a real animated WebP. Writing a vertical frame
 * strip with a top-level `pageHeight` silently produces a single static
 * 96x(96*n) image that looks fine in a file listing and is broken in a browser;
 * `pageHeight` belongs inside the `raw` descriptor. The assertion at the bottom
 * of the loop exists because that exact mistake was made while writing this.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const SIZE = 96
const OUT = path.join(process.cwd(), 'public', 'images', 'emoji')
const SRC = path.join(process.cwd(), '.emoji-src')

/** codepoint · output name · still frame (source index) · keep every Nth frame */
const SET = [
  { cp: '1f680', name: 'rocket', stillFrame: 0, stride: 2 },
  { cp: '1fa90', name: 'planet', stillFrame: 0, stride: 2 },
  { cp: '1f389', name: 'popper', stillFrame: 14, stride: 2 },
]

/**
 * CUT ON DREAMCRM-118, kept here so a restore is exact rather than
 * re-researched. These three shipped in the original six and reached 1.0
 * with no call site; `lib/marketing/emoji.ts`'s `CUT` list carries the
 * decision and the reason per glyph. `stillFrame` is the expensive part —
 * it was chosen by looking at the strip, and frame 0 is not always usable.
 *
 * To bring one back: move its row into `SET` above, run this script, add the
 * registry entry with a REAL `where`, and update `BRAND.md` Part 5's table
 * and `public/images/emoji/LICENSE.md`. Do not restore one without a moment
 * to put it on — that is exactly how the set drifted to six.
 */
const CUT = [
  { cp: '2728', name: 'sparkles', stillFrame: 0, stride: 2 },
  { cp: '1f4ab', name: 'dizzy', stillFrame: 0, stride: 2 },
  { cp: '2b50', name: 'star', stillFrame: 0, stride: 3 },
]
void CUT

fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(SRC, { recursive: true })

for (const { cp, name, stillFrame, stride } of SET) {
  const srcFile = path.join(SRC, `${cp}.webp`)
  if (!fs.existsSync(srcFile)) {
    const url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/512.webp`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${cp}: ${res.status} from ${url}`)
    fs.writeFileSync(srcFile, Buffer.from(await res.arrayBuffer()))
  }

  const meta = await sharp(srcFile, { animated: true }).metadata()
  const channels = meta.channels

  // Resize the whole animation natively, then decimate on the resized strip.
  const resized = await sharp(srcFile, { animated: true })
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer()

  const pageBytes = SIZE * SIZE * channels
  const frames = []
  const delay = []
  for (let i = 0; i < meta.pages; i += stride) {
    frames.push(resized.subarray(i * pageBytes, (i + 1) * pageBytes))
    delay.push((meta.delay?.[i] ?? 30) * stride)
  }

  await sharp(Buffer.concat(frames), {
    raw: { width: SIZE, height: SIZE * frames.length, channels, pageHeight: SIZE },
  })
    .webp({ quality: 66, alphaQuality: 80, effort: 6, loop: 0, delay })
    .toFile(path.join(OUT, `${name}.webp`))

  const srcRaw = await sharp(srcFile, { animated: true }).raw().toBuffer()
  const srcPage = meta.width * meta.pageHeight * channels
  await sharp(srcRaw.subarray(stillFrame * srcPage, (stillFrame + 1) * srcPage), {
    raw: { width: meta.width, height: meta.pageHeight, channels },
  })
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80, alphaQuality: 90, effort: 6 })
    .toFile(path.join(OUT, `${name}-still.webp`))

  const written = await sharp(path.join(OUT, `${name}.webp`), { animated: true }).metadata()
  if (!(written.pages > 1)) {
    throw new Error(`${name}: wrote a STATIC file (pages=${written.pages}) — see the header note`)
  }

  const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024)
  console.log(
    `${name.padEnd(9)} ${String(written.pages).padStart(3)} frames  ` +
      `${String(kb(`${name}.webp`)).padStart(3)} KB animated  ` +
      `${String(kb(`${name}-still.webp`)).padStart(2)} KB still`,
  )
}
