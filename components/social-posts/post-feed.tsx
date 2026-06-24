'use client'

import { useMemo, useState } from 'react'
import { BrandLogo, BRAND_ACCENTS, type BrandLogoId } from '@/components/integrations/brand-logos'
import { GBP_CTA_LABELS, commentsSupportedForPlatform, type SocialPostView } from '@/lib/types/zernio'
import { PlatformPostCard, type PreviewChannel, type PreviewContent } from '@/components/social-posts/post-preview'
import PostCommentsPanel from '@/components/social-posts/post-comments-panel'

/**
 * "Showcase" view of the post history — a device frame standing in for a social
 * app, with each platform's HOME FEED rendered inside and populated by the
 * clinic's own posts in that platform's native card style. Switch the platform
 * tab to see your posts the way Instagram / Facebook / Google / TikTok / etc.
 * show them. Reuses the same per-platform cards as the composer's live preview,
 * so the timeline is color-true.
 */

interface FeedChannel {
  accountId: string
  platform: string
  label: string
  handle: string | null
}

const BRAND_IDS: Record<string, BrandLogoId> = {
  googlebusiness: 'googlebusiness',
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  linkedin: 'linkedin',
}
const ORDER = ['googlebusiness', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin']
const TAB_NAME: Record<string, string> = {
  googlebusiness: 'Google',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
}
// Each app's feed background — fixed (a mock of Instagram is always
// Instagram-white, regardless of our own light/dark mode).
const FEED_BG: Record<string, string> = {
  googlebusiness: 'bg-white',
  instagram: 'bg-white',
  facebook: 'bg-[#f0f2f5]',
  tiktok: 'bg-black',
  youtube: 'bg-white',
  linkedin: 'bg-[#f4f2ee]',
}

export default function PostFeed({
  posts,
  channels,
  clinicName,
}: {
  posts: SocialPostView[]
  channels: FeedChannel[]
  clinicName: string
}) {
  // Which platforms actually have posts? Only those get a tab.
  const platforms = useMemo(() => {
    const set = new Set<string>()
    for (const p of posts) for (const t of p.targets) if (BRAND_IDS[t.platform]) set.add(t.platform)
    return ORDER.filter((p) => set.has(p))
  }, [posts])

  const [active, setActive] = useState<string>(() => platforms[0] ?? 'instagram')
  const current = platforms.includes(active) ? active : platforms[0]
  // The post whose comment/engagement manager is open (over the whole page).
  const [openPost, setOpenPost] = useState<{ id: string; platform: string; summary: string } | null>(null)

  if (!current) {
    // Posts exist, but none on a platform we render a feed for yet.
    return (
      <p className="text-center text-[13px] text-gray-500 dark:text-gray-400 py-10">
        These posts are on channels we don&apos;t have a feed preview for yet. Switch to{' '}
        <span className="font-medium">List</span> to see them.
      </p>
    )
  }

  const feedPosts = posts.filter((p) => p.targets.some((t) => t.platform === current))
  const channel = channelFor(current, channels, clinicName)

  return (
    <div>
      {/* Platform switcher */}
      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist" aria-label="Platform feed">
        {platforms.map((p) => {
          const on = p === current
          const id = BRAND_IDS[p]
          const accent = BRAND_ACCENTS[id]
          const count = posts.filter((post) => post.targets.some((t) => t.platform === p)).length
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(p)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                on
                  ? 'text-gray-900 dark:text-gray-50 shadow-sm'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
              }`}
              style={on ? { borderColor: accent, backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)` } : undefined}
            >
              <BrandLogo id={id} size={16} className={on ? '' : 'opacity-50 grayscale'} />
              {TAB_NAME[p]}
              <span className="text-[11px] text-gray-400 font-mono-num">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Device — a tablet standing in for the social app */}
      <div className="mx-auto w-full max-w-[560px]">
        <div className="rounded-[1.9rem] bg-gray-900 dark:bg-black p-3.5 shadow-2xl ring-1 ring-black/20">
          {/* front camera */}
          <div className="mx-auto mb-2 h-1.5 w-1.5 rounded-full bg-white/20" aria-hidden="true" />
          <div className="relative rounded-[1.25rem] overflow-hidden flex flex-col bg-white" style={{ height: 720 }}>
            <Chrome platform={current} clinicName={clinicName} channel={channel} />
            <div className={`flex-1 overflow-y-auto ${FEED_BG[current]}`}>
              <div className="px-3 py-3 space-y-3">
                {feedPosts.map((post) => (
                  <div key={post.id}>
                    <PlatformPostCard channel={channel} content={contentFor(post, clinicName)} />
                    <ManageBar
                      platform={current}
                      onOpen={() => setOpenPost({ id: post.id, platform: current, summary: post.summary })}
                    />
                  </div>
                ))}
              </div>
            </div>
            <BottomNav platform={current} />
          </div>
        </div>
      </div>

      {openPost && (
        <PostCommentsPanel
          socialPostId={openPost.id}
          platform={openPost.platform}
          summary={openPost.summary}
          onClose={() => setOpenPost(null)}
        />
      )}
      <p className="text-center text-[11px] text-gray-400 mt-3">
        Your {feedPosts.length} {TAB_NAME[current]} {feedPosts.length === 1 ? 'post' : 'posts'}, shown the way {TAB_NAME[current]} displays them.
      </p>
    </div>
  )
}

// ── Per-platform top chrome (recognizable app header) ───────────────────────

function Chrome({ platform, clinicName, channel }: { platform: string; clinicName: string; channel: PreviewChannel }) {
  const handle = channel.handle?.trim() || channel.label || clinicName
  switch (platform) {
    case 'instagram':
      return (
        <div className="flex items-center justify-between px-4 h-12 bg-white border-b border-gray-200 text-gray-900">
          <span className="text-[19px] font-semibold" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Instagram</span>
          <span className="flex items-center gap-3 text-lg">♡ ✈</span>
        </div>
      )
    case 'facebook':
      return (
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-4 h-12">
            <span className="text-[22px] font-bold" style={{ color: '#1877F2' }}>facebook</span>
            <span className="flex items-center gap-2 text-gray-500">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100">🔍</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100">💬</span>
            </span>
          </div>
        </div>
      )
    case 'googlebusiness':
      return (
        <div className="bg-white">
          <div className="h-14 bg-gradient-to-r from-[#4285F4] to-[#1A73E8]" />
          <div className="px-4 pb-2 -mt-5">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white ring-2 ring-white shadow text-[#1A73E8] font-bold">
              {(clinicName || 'C').charAt(0).toUpperCase()}
            </div>
            <p className="mt-1 text-[15px] font-semibold text-gray-900 leading-tight">{clinicName || 'Your clinic'}</p>
            <p className="text-[11px] text-gray-500">★★★★★ · Dentist · Updates</p>
          </div>
        </div>
      )
    case 'tiktok':
      return (
        <div className="flex items-center justify-center gap-5 px-4 h-12 bg-black text-white/90 border-b border-white/10 text-[14px] font-semibold">
          <span className="text-white/50">Following</span>
          <span className="relative">For You<span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-5 bg-white rounded-full" /></span>
        </div>
      )
    case 'youtube':
      return (
        <div className="flex items-center justify-between px-4 h-12 bg-white border-b border-gray-200 text-gray-900">
          <span className="flex items-center gap-1 font-semibold">
            <BrandLogo id="youtube" size={22} /> <span>YouTube</span>
          </span>
          <span className="text-gray-400">🔍</span>
        </div>
      )
    case 'linkedin':
      return (
        <div className="flex items-center gap-3 px-4 h-12 bg-white border-b border-gray-200 text-gray-900">
          <BrandLogo id="linkedin" size={24} />
          <span className="flex-1 inline-flex items-center rounded-md bg-[#edf3f8] px-2.5 py-1 text-[12px] text-gray-500">🔍 Search</span>
          <span className="text-gray-400">💬</span>
        </div>
      )
    default:
      return null
  }
}

// ── A simple bottom nav strip so it reads as a real app ─────────────────────

function BottomNav({ platform }: { platform: string }) {
  const dark = platform === 'tiktok'
  const icons =
    platform === 'tiktok'
      ? ['🏠', '🔍', '＋', '✉', '👤']
      : platform === 'googlebusiness'
        ? ['Overview', 'Posts', 'Reviews', 'Photos']
        : ['🏠', '🔍', '＋', '❤', '👤']
  if (platform === 'googlebusiness') {
    return (
      <div className="flex items-center justify-around px-2 h-10 bg-white border-t border-gray-200 text-[11px] font-medium text-gray-500">
        {icons.map((t, i) => (
          <span key={t} className={i === 1 ? 'text-[#1A73E8] border-b-2 border-[#1A73E8] h-full inline-flex items-center px-1' : 'inline-flex items-center'}>{t}</span>
        ))}
      </div>
    )
  }
  return (
    <div className={`flex items-center justify-around px-2 h-11 border-t text-lg ${dark ? 'bg-black border-white/10 text-white/80' : 'bg-white border-gray-200 text-gray-700'}`}>
      {icons.map((t, i) => (
        <span key={i} aria-hidden="true">{t}</span>
      ))}
    </div>
  )
}

// ── Per-card management bar — opens the comment/engagement manager ──────────
// Visually a DreamCRM control (teal), distinct from the native-looking card, so
// staff know it's our tooling. Honest per platform: comment platforms get the
// manager; Google Business points at Reviews; TikTok has no comments API.

function ManageBar({ platform, onOpen }: { platform: string; onOpen: () => void }) {
  if (commentsSupportedForPlatform(platform)) {
    return (
      <div className="mt-1.5 flex justify-center">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 text-white px-3 py-1.5 text-[12px] font-medium shadow-sm hover:bg-teal-700 transition"
        >
          <span aria-hidden="true">💬</span> Comments &amp; stats
        </button>
      </div>
    )
  }
  if (platform === 'googlebusiness') {
    return (
      <div className="mt-1.5 flex justify-center">
        <a
          href="/reviews/received"
          className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-gray-200 text-gray-700 px-3 py-1.5 text-[12px] font-medium hover:ring-gray-300 transition"
        >
          <span aria-hidden="true">★</span> Manage reviews →
        </a>
      </div>
    )
  }
  // TikTok (and any other no-comments platform) — honest muted note on the dark feed.
  return <p className="mt-1.5 text-center text-[11px] text-white/55">Manage comments in the {TAB_NAME[platform] ?? 'platform'} app</p>
}

// ── helpers ─────────────────────────────────────────────────────────────────

function channelFor(platform: string, channels: FeedChannel[], clinicName: string): PreviewChannel {
  const c = channels.find((ch) => ch.platform === platform)
  return {
    accountId: c?.accountId ?? platform,
    platform,
    label: c?.label ?? clinicName,
    handle: c?.handle ?? null,
  }
}

function contentFor(post: SocialPostView, clinicName: string): PreviewContent {
  return {
    summary: post.summary,
    imageUrl: post.imageUrl,
    clinicName,
    postType: post.postType,
    ctaLabel: post.ctaType ? GBP_CTA_LABELS[post.ctaType] ?? null : null,
    eventTitle: post.eventTitle ?? '',
    eventStartLabel: post.eventStartAtIso ? fmtDate(post.eventStartAtIso) : null,
    offerCouponCode: post.offerCouponCode ?? '',
  }
}

function fmtDate(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
