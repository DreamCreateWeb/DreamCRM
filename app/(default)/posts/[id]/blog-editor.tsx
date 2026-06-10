'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapLink from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { cn, excerptFromHtml } from '@/lib/utils'
import ImageUploader from '@/components/ui/image-uploader'
import {
  updateBlogPostAction,
  publishBlogPostAction,
  unpublishBlogPostAction,
  unscheduleBlogPostAction,
  archiveBlogPostAction,
  draftBlogPostAction,
  draftSocialCaptionAction,
  generateFaqsAction,
  emailThisPostAction,
} from '../actions'

export interface BlogEditorPost {
  id: string
  title: string
  slug: string
  excerpt: string
  bodyHtml: string
  bodyJson: Record<string, unknown> | null
  coverImageUrl: string
  coverImageAlt: string
  category: string
  tags: string[]
  faq: { q: string; a: string }[]
  status: string
  source: string
  authorStaffId: string
  authorName: string
  medicallyReviewedByStaffId: string
  seoTitle: string
  seoDescription: string
  publishedAt: string | null
  scheduledFor: string | null
  viewCount: number
}

interface AuthorOption {
  id: string
  name: string
  title: string | null
}

interface Props {
  post: BlogEditorPost
  authors: AuthorOption[]
  categorySuggestions: string[]
  baseUrl: string
  openAi: boolean
}

export default function BlogEditor({ post, authors, categorySuggestions, baseUrl, openAi }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState({
    title: post.title === 'Untitled post' ? '' : post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    bodyHtml: post.bodyHtml,
    bodyJson: post.bodyJson,
    coverImageUrl: post.coverImageUrl,
    coverImageAlt: post.coverImageAlt,
    category: post.category,
    tagsText: post.tags.join(', '),
    faq: post.faq,
    authorStaffId: post.authorStaffId,
    authorName: post.authorName,
    medicallyReviewedByStaffId: post.medicallyReviewedByStaffId,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    source: post.source,
  })
  const [status, setStatus] = useState(post.status)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showAi, setShowAi] = useState(openAi)
  const [aiBusy, setAiBusy] = useState(false)
  const [showSeo, setShowSeo] = useState(Boolean(post.seoTitle || post.seoDescription))
  const [publishError, setPublishError] = useState<string | null>(null)
  const [social, setSocial] = useState<{ open: boolean; busy: boolean; text: string | null }>({
    open: false,
    busy: false,
    text: null,
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      Image,
      Placeholder.configure({ placeholder: 'Write your post… or use ✨ Draft with AI to start.' }),
    ],
    content: post.bodyJson ?? (post.bodyHtml || '<p></p>'),
    editorProps: {
      attributes: {
        class:
          'prose prose-stone dark:prose-invert max-w-none focus:outline-none min-h-[360px]',
      },
    },
    immediatelyRender: false,
    onUpdate({ editor }) {
      setDraft((d) => ({
        ...d,
        bodyHtml: editor.getHTML(),
        bodyJson: editor.getJSON() as Record<string, unknown>,
      }))
      setDirty(true)
    },
  })

  const save = useCallback(() => {
    const payload: Record<string, unknown> = {
      title: draft.title,
      slug: draft.slug || undefined,
      excerpt: draft.excerpt || null,
      bodyHtml: draft.bodyHtml,
      bodyJson: draft.bodyJson,
      coverImageUrl: draft.coverImageUrl || null,
      coverImageAlt: draft.coverImageAlt || null,
      category: draft.category || null,
      tags: draft.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      faq: draft.faq.filter((f) => f.q.trim() && f.a.trim()),
      authorStaffId: draft.authorStaffId || null,
      authorName: draft.authorName || null,
      medicallyReviewedByStaffId: draft.medicallyReviewedByStaffId || null,
      seoTitle: draft.seoTitle || null,
      seoDescription: draft.seoDescription || null,
    }
    // Only ever push source forward to ai_draft (keeps seed provenance intact).
    if (draft.source === 'ai_draft') payload.source = 'ai_draft'
    return updateBlogPostAction(post.id, payload).then(() => {
      setDirty(false)
      setSavedAt(Date.now())
    })
  }, [draft, post.id])

  // Autosave 1.2s after the last change.
  useEffect(() => {
    if (!dirty) return
    const id = setTimeout(() => {
      startTransition(() => {
        save()
      })
    }, 1200)
    return () => clearTimeout(id)
  }, [dirty, save])

  function field<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
    setDirty(true)
  }

  function publish() {
    setPublishError(null)
    startTransition(async () => {
      if (dirty) await save()
      const res = await publishBlogPostAction(post.id)
      if (!res.ok) {
        setPublishError(res.error)
        return
      }
      setStatus('published')
      router.refresh()
    })
  }

  function unpublish() {
    startTransition(async () => {
      await unpublishBlogPostAction(post.id)
      setStatus('draft')
      router.refresh()
    })
  }

  function preview() {
    startTransition(async () => {
      if (dirty) await save()
      window.open(`/posts/${post.id}/preview`, '_blank', 'noopener')
    })
  }

  function unschedule() {
    startTransition(async () => {
      await unscheduleBlogPostAction(post.id)
      setStatus('draft')
      router.refresh()
    })
  }

  function destroy() {
    if (!confirm('Archive this post? It will be removed from your website. You can’t undo this from here.')) return
    startTransition(async () => {
      await archiveBlogPostAction(post.id)
    })
  }

  const published = status === 'published'
  const scheduled = status === 'scheduled'
  const liveUrl = baseUrl ? `${baseUrl}/blog/${draft.slug}` : ''
  const derivedExcerpt = excerptFromHtml(draft.bodyHtml)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/posts"
          className="text-[13px] font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
        >
          ← All posts
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={preview}
            disabled={pending}
            className="text-[12px] font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 disabled:opacity-50"
            title="See exactly how this looks on your live site"
          >
            Preview ↗
          </button>
          <span className="text-[11px] text-stone-400 dark:text-stone-500">
            {pending ? 'Saving…' : dirty ? 'Editing…' : savedAt ? 'Saved' : 'Up to date'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4">
        {/* ── Editor column ── */}
        <div className="space-y-4">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700/40 space-y-3">
            <input
              value={draft.title}
              onChange={(e) => field('title', e.target.value)}
              placeholder="Post title"
              className="w-full text-2xl font-bold text-stone-900 dark:text-stone-100 bg-transparent border-none focus:outline-none focus:ring-0 px-0 placeholder:text-stone-300 dark:placeholder:text-stone-600"
            />
            <div className="flex items-center gap-1 text-[12px] text-stone-400 dark:text-stone-500">
              <span className="shrink-0">/blog/</span>
              <input
                value={draft.slug}
                onChange={(e) => field('slug', e.target.value)}
                placeholder="post-url"
                className="flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-0 px-0 font-mono text-stone-500 dark:text-stone-400"
              />
            </div>
          </div>

          <div className="px-5 py-2 border-b border-stone-100 dark:border-stone-700/40 flex items-center gap-2 flex-wrap bg-stone-50/40 dark:bg-stone-800/30">
            <button
              type="button"
              onClick={() => setShowAi(true)}
              disabled={pending}
              className="text-[11px] font-medium px-2 py-1 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 disabled:opacity-50"
            >
              ✨ Draft with AI
            </button>
            <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-auto">
              {aiBusy ? 'AI working…' : 'AI drafts are never auto-published'}
            </span>
          </div>

          {editor && <EditorToolbar editor={editor} />}

          <div className="px-5 py-4">
            <EditorContent editor={editor} />
          </div>

          <div className="px-5 py-4 border-t border-stone-100 dark:border-stone-700/40">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
                Excerpt
              </span>
              <textarea
                value={draft.excerpt}
                onChange={(e) => field('excerpt', e.target.value)}
                rows={2}
                placeholder={derivedExcerpt || 'One or two sentences shown on the blog index + used as the search description.'}
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 resize-none"
              />
              <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">
                Leave blank and we&apos;ll use the opening of your post.
              </p>
            </label>
          </div>
        </div>

        <FaqEditor
          faq={draft.faq}
          title={draft.title}
          bodyHtml={draft.bodyHtml}
          pending={pending}
          onChange={(f) => field('faq', f)}
        />
        </div>

        {/* ── Sidebar ── */}
        <aside className="space-y-3">
          {/* Status + publish */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <span
                className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded',
                  published
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : scheduled
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
                )}
              >
                {published ? 'Published' : scheduled ? 'Scheduled' : 'Draft'}
              </span>
              {published && liveUrl && (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-stone-400 hover:text-violet-600 dark:text-stone-500 dark:hover:text-violet-400"
                >
                  View ↗
                </a>
              )}
            </div>
            {published && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-3 tabular-nums">
                {post.viewCount} {post.viewCount === 1 ? 'read' : 'reads'}
              </p>
            )}
            {published ? (
              <button
                onClick={unpublish}
                disabled={pending}
                className="w-full text-sm font-medium py-2 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 disabled:opacity-50"
              >
                Unpublish
              </button>
            ) : scheduled ? (
              <>
                {post.scheduledFor && (
                  <p className="text-[12px] text-amber-700 dark:text-amber-300 mb-2 tabular-nums">
                    Goes live{' '}
                    {new Date(post.scheduledFor).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                )}
                <button
                  onClick={unschedule}
                  disabled={pending}
                  className="w-full text-sm font-medium py-2 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 disabled:opacity-50"
                >
                  Unschedule
                </button>
                <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-2 leading-snug">
                  Reschedule from the content calendar.
                </p>
              </>
            ) : (
              <button
                onClick={publish}
                disabled={pending}
                className="w-full text-sm font-semibold py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-white dark:text-stone-900 disabled:opacity-50"
              >
                Publish
              </button>
            )}
            {publishError && (
              <p className="text-[12px] text-rose-600 dark:text-rose-400 mt-2">{publishError}</p>
            )}
            {!published && !scheduled && (
              <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-2 leading-snug">
                Publishing needs a title, some content, and an author byline.
              </p>
            )}
          </div>

          {/* Author */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
              Author
            </h3>
            {authors.length === 0 ? (
              <>
                <input
                  type="text"
                  value={draft.authorName}
                  onChange={(e) => field('authorName', e.target.value)}
                  placeholder="Byline, e.g. The DreamCRM team"
                  className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                />
                <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1.5 leading-snug">
                  No staff directory on this org — type the byline directly (required to publish).
                </p>
              </>
            ) : (
              <>
                <select
                  value={draft.authorStaffId}
                  onChange={(e) => field('authorStaffId', e.target.value)}
                  className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                >
                  <option value="">Choose an author…</option>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.title ? ` — ${a.title}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1.5 leading-snug">
                  Real bylines with credentials are how Google trusts health content.
                </p>
              </>
            )}
          </div>

          {/* Medically reviewed by (optional) */}
          {authors.length > 0 && (
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
              <h3 className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
                Medically reviewed by{' '}
                <span className="normal-case font-normal text-stone-400 dark:text-stone-500">· optional</span>
              </h3>
              <select
                value={draft.medicallyReviewedByStaffId}
                onChange={(e) => field('medicallyReviewedByStaffId', e.target.value)}
                className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
              >
                <option value="">No reviewer</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.title ? ` — ${a.title}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1.5 leading-snug">
                Adds a &ldquo;Medically reviewed by&rdquo; line — a strong trust signal on clinical posts.
              </p>
            </div>
          )}

          {/* Category + tags */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4 space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
                Category
              </span>
              <input
                value={draft.category}
                onChange={(e) => field('category', e.target.value)}
                list="blog-categories"
                placeholder="e.g. Oral Health"
                className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
              />
              <datalist id="blog-categories">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
                Tags
              </span>
              <input
                value={draft.tagsText}
                onChange={(e) => field('tagsText', e.target.value)}
                placeholder="comma, separated, tags"
                className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
              />
            </label>
          </div>

          {/* Cover image */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
            <ImageUploader
              name="coverImageUrl"
              defaultValue={draft.coverImageUrl}
              folder="blog-covers"
              label="Cover image"
              previewClass="aspect-[16/9]"
              hint="Shown at the top of the post + as the social share image."
              onChange={(url) => field('coverImageUrl', url ?? '')}
            />
            {draft.coverImageUrl && (
              <label className="block mt-3">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
                  Image description (alt text)
                </span>
                <input
                  value={draft.coverImageAlt}
                  onChange={(e) => field('coverImageAlt', e.target.value)}
                  placeholder="e.g. A dental hygienist smiling with a patient"
                  className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                />
                <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">
                  Describe the photo for screen readers + image search.
                </p>
              </label>
            )}
          </div>

          {/* SEO */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
            <button
              type="button"
              onClick={() => setShowSeo((s) => !s)}
              className="w-full flex items-center justify-between text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400"
            >
              <span>SEO (optional)</span>
              <span>{showSeo ? '−' : '+'}</span>
            </button>
            {showSeo && (
              <div className="space-y-3 mt-3">
                <label className="block">
                  <span className="text-[10px] text-stone-500 dark:text-stone-400 block mb-1">
                    Search title
                  </span>
                  <input
                    value={draft.seoTitle}
                    onChange={(e) => field('seoTitle', e.target.value)}
                    placeholder="Falls back to the post title"
                    className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-stone-500 dark:text-stone-400 block mb-1">
                    Search description
                  </span>
                  <textarea
                    value={draft.seoDescription}
                    onChange={(e) => field('seoDescription', e.target.value)}
                    rows={2}
                    placeholder="Falls back to the excerpt"
                    className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 resize-none"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Tools */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4 space-y-2">
            {published && (
              <button
                type="button"
                onClick={() => startTransition(async () => { await emailThisPostAction(post.id) })}
                disabled={pending}
                className="w-full text-[12px] font-medium px-2 py-1.5 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 disabled:opacity-50"
                title="Create a Recall & Outreach email from this post"
              >
                ✉️ Email to patients
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                setSocial({ open: true, busy: true, text: null })
                const text = await draftSocialCaptionAction(draft.title, draft.excerpt)
                setSocial({ open: true, busy: false, text: text ?? 'AI is unavailable right now — try again in a moment.' })
              }}
              disabled={pending || !draft.title.trim()}
              className="w-full text-[12px] font-medium px-2 py-1.5 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 disabled:opacity-50"
            >
              ✨ Draft a social caption
            </button>
            <button
              onClick={destroy}
              disabled={pending}
              className="w-full text-[12px] font-medium px-2 py-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 disabled:opacity-50"
            >
              Archive post
            </button>
          </div>
        </aside>
      </div>

      {showAi && (
        <AiDraftModal
          busy={aiBusy}
          defaultTopic={
            draft.bodyHtml.replace(/<[^>]*>/g, '').trim()
              ? ''
              : [draft.title, draft.excerpt].filter(Boolean).join(' — ')
          }
          onClose={() => setShowAi(false)}
          onApply={async (topic) => {
            setAiBusy(true)
            try {
              const result = await draftBlogPostAction(topic)
              if (!result) {
                alert('AI is unavailable right now — try again in a moment.')
                return
              }
              editor?.commands.setContent(result.bodyHtml)
              setDraft((d) => ({
                ...d,
                title: result.title,
                excerpt: result.excerpt,
                category: result.category || d.category,
                seoTitle: result.seoTitle || d.seoTitle,
                seoDescription: result.seoDescription || d.seoDescription,
                bodyHtml: editor?.getHTML() ?? result.bodyHtml,
                bodyJson: (editor?.getJSON() as Record<string, unknown>) ?? d.bodyJson,
                source: 'ai_draft',
              }))
              setDirty(true)
              setShowAi(false)
            } finally {
              setAiBusy(false)
            }
          }}
        />
      )}

      {social.open && (
        <SocialModal
          busy={social.busy}
          text={social.text}
          onClose={() => setSocial({ open: false, busy: false, text: null })}
        />
      )}
    </div>
  )
}

function AiDraftModal({
  busy,
  defaultTopic,
  onClose,
  onApply,
}: {
  busy: boolean
  defaultTopic?: string
  onClose: () => void
  onApply: (topic: string) => void | Promise<void>
}) {
  const [topic, setTopic] = useState(defaultTopic ?? '')
  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-1">
          ✨ Draft with AI
        </h2>
        <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-3">
          Give a topic — Claude writes a first draft in your clinic&apos;s warm, no-judgment voice.
          You review and edit it, add an author, and publish when it&apos;s right.{' '}
          <strong>It never publishes on its own.</strong>
        </p>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={4}
          placeholder="e.g. Why electric toothbrushes are worth it, for nervous patients. Keep it reassuring and practical."
          className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 resize-none"
        />
        <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">
          This replaces the current title, content, and excerpt.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(topic)}
            disabled={busy || !topic.trim()}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
          >
            {busy ? 'Drafting…' : 'Draft it'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SocialModal({
  busy,
  text,
  onClose,
}: {
  busy: boolean
  text: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-1">
          ✨ Social caption
        </h2>
        <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-3">
          Copy this into Instagram, Facebook, or wherever you post. Scheduling is coming later.
        </p>
        <div className="text-sm text-stone-700 dark:text-stone-200 bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3 min-h-[80px] whitespace-pre-wrap">
          {busy ? 'Writing…' : text}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            Close
          </button>
          {text && !busy && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(text)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-white dark:text-stone-900"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null

  function btn(active: boolean, label: string, onClick: () => void) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'text-[11px] font-medium px-2 py-1 rounded-md',
          active
            ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
            : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700',
        )}
      >
        {label}
      </button>
    )
  }

  function setLink() {
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = prompt('URL', previousUrl ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function addImage() {
    const url = prompt('Image URL', 'https://')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  return (
    <div className="px-5 py-2 border-b border-stone-100 dark:border-stone-700/40 flex items-center gap-1 flex-wrap">
      {btn(editor.isActive('bold'), 'B', () => editor.chain().focus().toggleBold().run())}
      {btn(editor.isActive('italic'), 'I', () => editor.chain().focus().toggleItalic().run())}
      {btn(editor.isActive('strike'), 'S', () => editor.chain().focus().toggleStrike().run())}
      <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />
      {btn(editor.isActive('heading', { level: 2 }), 'H2', () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      )}
      {btn(editor.isActive('heading', { level: 3 }), 'H3', () =>
        editor.chain().focus().toggleHeading({ level: 3 }).run(),
      )}
      {btn(editor.isActive('blockquote'), '“ ”', () => editor.chain().focus().toggleBlockquote().run())}
      <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />
      {btn(editor.isActive('bulletList'), '• List', () => editor.chain().focus().toggleBulletList().run())}
      {btn(editor.isActive('orderedList'), '1. List', () => editor.chain().focus().toggleOrderedList().run())}
      <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />
      {btn(editor.isActive('link'), 'Link', setLink)}
      {btn(false, 'Image', addImage)}
    </div>
  )
}

function FaqEditor({
  faq,
  title,
  bodyHtml,
  pending,
  onChange,
}: {
  faq: { q: string; a: string }[]
  title: string
  bodyHtml: string
  pending: boolean
  onChange: (faq: { q: string; a: string }[]) => void
}) {
  const [busy, setBusy] = useState(false)

  function update(i: number, key: 'q' | 'a', val: string) {
    onChange(faq.map((f, idx) => (idx === i ? { ...f, [key]: val } : f)))
  }

  async function generate() {
    setBusy(true)
    try {
      const result = await generateFaqsAction(title, bodyHtml)
      if (!result || !result.length) {
        alert('AI is unavailable right now — try again in a moment.')
        return
      }
      const existing = faq.filter((f) => f.q.trim() && f.a.trim())
      onChange([...existing, ...result])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-100">FAQ</h3>
        <button
          type="button"
          onClick={generate}
          disabled={busy || pending}
          className="text-[11px] font-medium px-2 py-1 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 disabled:opacity-50"
        >
          {busy ? 'Generating…' : '✨ Generate with AI'}
        </button>
      </div>
      <p className="text-[11px] text-stone-400 dark:text-stone-500 mb-3">
        Common questions about this topic. Shown on the post + added as FAQ structured data — helps you appear in
        Google and AI answers.
      </p>
      {faq.length === 0 ? (
        <p className="text-[12px] text-stone-400 dark:text-stone-500 italic mb-3">
          No FAQs yet — add your own or generate them.
        </p>
      ) : (
        <div className="space-y-3 mb-3">
          {faq.map((f, i) => (
            <div key={i} className="rounded-lg border border-stone-200 dark:border-stone-700 p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2 min-w-0">
                  <input
                    value={f.q}
                    onChange={(e) => update(i, 'q', e.target.value)}
                    placeholder="Question"
                    className="w-full text-sm font-medium px-2 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  />
                  <textarea
                    value={f.a}
                    onChange={(e) => update(i, 'a', e.target.value)}
                    rows={2}
                    placeholder="Answer"
                    className="w-full text-sm px-2 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange(faq.filter((_, idx) => idx !== i))}
                  className="text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 text-sm shrink-0 px-1"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...faq, { q: '', a: '' }])}
        className="text-[12px] font-medium text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
      >
        + Add question
      </button>
    </div>
  )
}
