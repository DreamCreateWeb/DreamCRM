'use client'

import { BrandLogo, BRAND_ACCENTS, type BrandLogoId } from '@/components/integrations/brand-logos'
import { isVideoUrl } from '@/lib/media'

/**
 * Live multi-platform post preview — the "broadcast studio" centerpiece of the
 * Social Posts composer. As the clinic types, picks channels, and adds a photo,
 * each selected network renders a faithful little mock of how the post will
 * actually look there: an Instagram card, a Facebook post, a Google Business
 * update, a TikTok screen, a YouTube community post, a LinkedIn post. Nothing is
 * sent here — it's a true WYSIWYG preview, the feature that makes premium social
 * tools (Buffer / Later / Hootsuite) feel premium and that literally showcases
 * every platform a clinic connects.
 *
 * Purely presentational: it reads the composer's live state and the connected
 * accounts' real handles. The platform marks come from the shared brand-logo
 * set so the previews are color-true.
 */

const KNOWN: ReadonlySet<string> = new Set([
  'googlebusiness', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin',
])

export interface PreviewChannel {
  accountId: string
  platform: string
  label: string
  handle: string | null
}

export interface PreviewContent {
  summary: string
  imageUrl: string | null
  clinicName: string
  postType: 'standard' | 'event' | 'offer'
  ctaLabel: string | null
  eventTitle: string
  eventStartLabel: string | null
  offerCouponCode: string
}

// Render order — Google first (the dental priority), then the socials.
const ORDER = ['googlebusiness', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin']

export default function PostPreviews({
  channels,
  content,
}: {
  channels: PreviewChannel[]
  content: PreviewContent
}) {
  // De-dupe to one preview per platform (a clinic could connect two IG accounts;
  // the preview shape is identical, so show the platform once, first handle wins).
  const byPlatform = new Map<string, PreviewChannel>()
  for (const c of channels) {
    if (KNOWN.has(c.platform) && !byPlatform.has(c.platform)) byPlatform.set(c.platform, c)
  }
  const ordered = ORDER.filter((p) => byPlatform.has(p)).map((p) => byPlatform.get(p)!)

  return (
    <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Live preview
        </p>
        {ordered.length > 0 && (
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
            {ordered.length} {ordered.length === 1 ? 'channel' : 'channels'}
          </span>
        )}
      </div>

      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10 px-4">
          <span className="text-2xl mb-2" aria-hidden="true">📡</span>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Pick a channel above to see your post come to life here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ordered.map((ch) => (
            <PlatformCard key={ch.platform} channel={ch} content={content} />
          ))}
        </div>
      )}
    </div>
  )
}

function PlatformCard({ channel, content }: { channel: PreviewChannel; content: PreviewContent }) {
  switch (channel.platform) {
    case 'instagram':
      return <InstagramCard channel={channel} content={content} />
    case 'facebook':
      return <FacebookCard channel={channel} content={content} />
    case 'googlebusiness':
      return <GoogleBusinessCard channel={channel} content={content} />
    case 'tiktok':
      return <TikTokCard channel={channel} content={content} />
    case 'youtube':
      return <YouTubeCard channel={channel} content={content} />
    case 'linkedin':
      return <LinkedInCard channel={channel} content={content} />
    default:
      return null
  }
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function accountName(channel: PreviewChannel, content: PreviewContent): string {
  return channel.handle?.trim() || channel.label || content.clinicName || 'Your clinic'
}
function initial(content: PreviewContent, channel: PreviewChannel): string {
  const src = content.clinicName || channel.label || channel.handle || 'C'
  return src.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() || 'C'
}
function bodyText(content: PreviewContent): string {
  const t = content.summary.trim()
  if (t) return t
  return 'Your post text will appear here as you type…'
}
function isPlaceholder(content: PreviewContent): boolean {
  return content.summary.trim().length === 0
}

/** A simple round avatar with the clinic initial, tinted to the brand. */
function Avatar({ accent, label, ring = false, size = 32 }: { accent: string; label: string; ring?: boolean; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 60%, #000 0%))`,
        boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 4px ${accent}` : undefined,
      }}
      aria-hidden="true"
    >
      {label}
    </span>
  )
}

/** The photo or video, or a tasteful brand-tinted placeholder so the layout
 *  reads whole. Video silently autoplay-loops — the real social-feed feel. */
function Media({ url, accent, aspect = 'aspect-square' }: { url: string | null; accent: string; aspect?: string }) {
  if (url && isVideoUrl(url)) {
    return <video src={url} muted playsInline loop autoPlay preload="metadata" className={`w-full ${aspect} object-cover`} />
  }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`w-full ${aspect} object-cover`} />
  }
  return (
    <div
      className={`w-full ${aspect} flex items-center justify-center`}
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 16%, #fff), color-mix(in srgb, ${accent} 5%, #fff))` }}
      aria-hidden="true"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: accent, opacity: 0.5 }}>
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="8.5" cy="8.5" r="1.8" fill="currentColor" />
        <path d="M21 16l-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Small platform mark seated top-right so each card is instantly identifiable. */
function PlatformBadge({ id }: { id: BrandLogoId }) {
  return <BrandLogo id={id} size={18} className="shrink-0" />
}

function Caption({ content, className = '' }: { content: PreviewContent; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap break-words ${isPlaceholder(content) ? 'text-gray-400 italic' : 'text-gray-800'} ${className}`}>
      {bodyText(content)}
    </p>
  )
}

// A white feed card shell (Facebook / YouTube / LinkedIn share this skeleton).
function FeedCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden text-[13px] leading-snug">
      {children}
    </div>
  )
}

// ── Instagram ───────────────────────────────────────────────────────────────

function InstagramCard({ channel, content }: { channel: PreviewChannel; content: PreviewContent }) {
  const accent = BRAND_ACCENTS.instagram
  return (
    <FeedCard>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar accent={accent} label={initial(content, channel)} ring size={30} />
        <span className="font-semibold text-gray-900 text-[13px] truncate flex-1">{accountName(channel, content)}</span>
        <PlatformBadge id="instagram" />
      </div>
      <Media url={content.imageUrl} accent={accent} aspect="aspect-square" />
      <div className="flex items-center gap-4 px-3 pt-2.5 text-gray-800">
        <Glyph>{HEART}</Glyph>
        <Glyph>{COMMENT}</Glyph>
        <Glyph>{SHARE}</Glyph>
        <span className="ml-auto">{BOOKMARK}</span>
      </div>
      <div className="px-3 pb-3 pt-1.5">
        <p className="whitespace-pre-wrap break-words text-gray-800">
          <span className="font-semibold mr-1">{accountName(channel, content)}</span>
          <span className={isPlaceholder(content) ? 'text-gray-400 italic' : ''}>{bodyText(content)}</span>
        </p>
      </div>
    </FeedCard>
  )
}

// ── Facebook ────────────────────────────────────────────────────────────────

function FacebookCard({ channel, content }: { channel: PreviewChannel; content: PreviewContent }) {
  const accent = BRAND_ACCENTS.facebook
  return (
    <FeedCard>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar accent={accent} label={initial(content, channel)} size={32} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{accountName(channel, content)}</p>
          <p className="text-[11px] text-gray-500">Just now · 🌐</p>
        </div>
        <PlatformBadge id="facebook" />
      </div>
      <div className="px-3 pb-2"><Caption content={content} /></div>
      <Media url={content.imageUrl} accent={accent} aspect="aspect-[1.91/1]" />
      <div className="flex items-center justify-between px-3 py-2 text-[12px] text-gray-500 border-t border-gray-100">
        <span style={{ color: accent }} className="font-medium">👍 Like</span>
        <span className="font-medium">💬 Comment</span>
        <span className="font-medium">↗ Share</span>
      </div>
    </FeedCard>
  )
}

// ── Google Business ─────────────────────────────────────────────────────────

function GoogleBusinessCard({ channel, content }: { channel: PreviewChannel; content: PreviewContent }) {
  const accent = '#1A73E8' // Google blue
  const typeLabel = content.postType === 'offer' ? 'Offer' : content.postType === 'event' ? 'Event' : 'Update'
  return (
    <FeedCard>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar accent={accent} label={initial(content, channel)} size={32} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{content.clinicName || accountName(channel, content)}</p>
          <p className="text-[11px] text-gray-500">{typeLabel} · on Google</p>
        </div>
        <PlatformBadge id="googlebusiness" />
      </div>
      {content.postType === 'event' && content.eventTitle.trim() && (
        <div className="px-3 pb-2">
          <p className="font-semibold text-gray-900">{content.eventTitle}</p>
          {content.eventStartLabel && <p className="text-[11px] text-gray-500">{content.eventStartLabel}</p>}
        </div>
      )}
      <Media url={content.imageUrl} accent={accent} aspect="aspect-[1.6/1]" />
      <div className="px-3 pt-2.5"><Caption content={content} /></div>
      {content.postType === 'offer' && content.offerCouponCode.trim() && (
        <div className="mx-3 mt-2.5 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Code</p>
          <p className="font-mono-num font-semibold text-gray-800 tracking-wide">{content.offerCouponCode}</p>
        </div>
      )}
      <div className="px-3 pb-3 pt-2.5">
        {content.ctaLabel ? (
          <span className="inline-flex rounded-full px-3.5 py-1.5 text-[12px] font-medium" style={{ color: accent, border: `1px solid ${accent}` }}>
            {content.ctaLabel}
          </span>
        ) : (
          <p className="text-[11px] text-gray-400">Posted just now</p>
        )}
      </div>
    </FeedCard>
  )
}

// ── TikTok (dark, vertical feel) ────────────────────────────────────────────

function TikTokCard({ channel, content }: { channel: PreviewChannel; content: PreviewContent }) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-black text-white aspect-[4/5] ring-1 ring-black/20">
      {content.imageUrl && isVideoUrl(content.imageUrl) ? (
        <video src={content.imageUrl} muted playsInline loop autoPlay preload="metadata" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      ) : content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 30% 10%, #25F4EE22, transparent), radial-gradient(120% 80% at 70% 90%, #FE2C5522, transparent), #0b0b0b' }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/20" />
      <div className="absolute top-2.5 right-2.5"><PlatformBadge id="tiktok" /></div>
      {/* right action rail */}
      <div className="absolute right-2.5 bottom-16 flex flex-col items-center gap-3 text-white/90 text-lg">
        <span>♥</span><span>💬</span><span>↗</span>
      </div>
      <div className="absolute left-3 right-12 bottom-3">
        <p className="font-semibold text-[13px] mb-0.5">@{(channel.handle || channel.label || 'yourclinic').replace(/^@/, '')}</p>
        <p className={`text-[12px] line-clamp-3 ${isPlaceholder(content) ? 'text-white/60 italic' : 'text-white/95'}`}>{bodyText(content)}</p>
      </div>
    </div>
  )
}

// ── YouTube (community post) ────────────────────────────────────────────────

function YouTubeCard({ channel, content }: { channel: PreviewChannel; content: PreviewContent }) {
  const accent = BRAND_ACCENTS.youtube
  return (
    <FeedCard>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar accent={accent} label={initial(content, channel)} size={30} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{accountName(channel, content)}</p>
          <p className="text-[11px] text-gray-500">now</p>
        </div>
        <PlatformBadge id="youtube" />
      </div>
      <div className="px-3 pb-2"><Caption content={content} /></div>
      {content.imageUrl && <Media url={content.imageUrl} accent={accent} aspect="aspect-[1.91/1]" />}
      <div className="flex items-center gap-5 px-3 py-2 text-[12px] text-gray-500">
        <span>👍</span><span>👎</span><span>💬</span>
      </div>
    </FeedCard>
  )
}

// ── LinkedIn ────────────────────────────────────────────────────────────────

function LinkedInCard({ channel, content }: { channel: PreviewChannel; content: PreviewContent }) {
  const accent = BRAND_ACCENTS.linkedin
  return (
    <FeedCard>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar accent={accent} label={initial(content, channel)} size={32} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{accountName(channel, content)}</p>
          <p className="text-[11px] text-gray-500">Promoted · 🌐</p>
        </div>
        <PlatformBadge id="linkedin" />
      </div>
      <div className="px-3 pb-2"><Caption content={content} /></div>
      <Media url={content.imageUrl} accent={accent} aspect="aspect-[1.91/1]" />
      <div className="flex items-center gap-5 px-3 py-2 text-[12px] text-gray-500 border-t border-gray-100">
        <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span>
      </div>
    </FeedCard>
  )
}

// Inline action glyphs (Instagram row).
const HEART = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 21s-7.5-4.6-10-9.2C.4 8.5 2 5 5.5 5 8 5 9.5 6.8 12 9.5 14.5 6.8 16 5 18.5 5 22 5 23.6 8.5 22 11.8 19.5 16.4 12 21 12 21z" /></svg>
)
const COMMENT = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" /></svg>
)
const SHARE = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" /></svg>
)
const BOOKMARK = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" /></svg>
)

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-800">{children}</span>
}
