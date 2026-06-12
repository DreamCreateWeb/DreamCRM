'use client'

import { useEffect } from 'react'

/**
 * Runs INSIDE the clinic-site iframe when the Website Studio opens it in edit
 * mode (`/site/[slug]?edit=1`, gated server-side to the clinic's own
 * owner/admin). It turns the real, production-rendered site into an editable
 * surface:
 *
 *  - hover highlights any `[data-edit-field]` region;
 *  - click a `kind="text"` field → inline contentEditable, commit on blur/Enter;
 *  - click a `kind="image"` field → asks the parent to open an upload modal;
 *  - click a `kind="modal"` field → asks the parent to open that section's modal.
 *
 * It performs NO persistence itself — it only emits intents to the parent
 * studio (the authed app), which calls the server actions and echoes results
 * back (`setImage`, etc.). Same-origin `postMessage`, origin-checked both ways.
 * Navigation is suppressed while editing so the clinic stays on the canvas.
 */
export default function EditBridge() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return
    const origin = window.location.origin
    const parentWin = window.parent

    const post = (msg: Record<string, unknown>) =>
      parentWin.postMessage({ source: 'dreamcrm-edit', ...msg }, origin)

    function startTextEdit(el: HTMLElement, field: string) {
      if (el.isContentEditable) return
      const original = el.textContent ?? ''
      el.setAttribute('contenteditable', 'true')
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      // Hint: empty clears to the standard wording (the server nulls a blank
      // field → the template falls back to its built-in default).
      showHint(el, 'Enter to save · Esc to cancel · clearing restores the standard wording')

      const finish = (commit: boolean) => {
        el.removeEventListener('blur', onBlur)
        el.removeEventListener('keydown', onKey)
        el.removeEventListener('paste', onPaste)
        el.setAttribute('contenteditable', 'false')
        hideHint()
        const value = (el.textContent ?? '').trim()
        if (commit && value !== original.trim()) {
          // Remember the pre-edit text + element so the Studio can RESTORE it if
          // the save fails (it posts back a `restore` for this field), and show a
          // brief saving→saved tick on the element.
          pendingEdits.set(field, { el, original })
          markSaving(el)
          post({ type: 'save', field, value })
        } else {
          el.textContent = original
        }
      }
      const onBlur = () => finish(true)
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault()
          el.blur()
        } else if (ev.key === 'Escape') {
          ev.preventDefault()
          el.textContent = original
          el.blur()
        }
      }
      // Force paste-as-plain-text. The save reads textContent (so the STORED
      // value is always plain), but without this the browser injects the
      // clipboard's rich HTML into the live page mid-edit — styled spans, even
      // <img> — which looks broken and pollutes the canvas DOM until reload.
      const onPaste = (ev: ClipboardEvent) => {
        ev.preventDefault()
        const text = ev.clipboardData?.getData('text/plain') ?? ''
        if (!text) return
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0)
          r.deleteContents()
          r.insertNode(document.createTextNode(text))
          r.collapse(false)
          sel.removeAllRanges()
          sel.addRange(r)
        } else {
          el.textContent = (el.textContent ?? '') + text
        }
      }
      el.addEventListener('blur', onBlur)
      el.addEventListener('keydown', onKey)
      el.addEventListener('paste', onPaste)
    }

    function onClickCapture(e: MouseEvent) {
      const target = e.target as HTMLElement
      const editable = target.closest('[data-edit-field]') as HTMLElement | null
      if (editable) {
        e.preventDefault()
        e.stopPropagation()
        const kind = editable.getAttribute('data-edit-kind') ?? 'text'
        const field = editable.getAttribute('data-edit-field') ?? ''
        if (kind === 'text') startTextEdit(editable, field)
        else if (kind === 'image') post({ type: 'editImage', field })
        else if (kind === 'modal') post({ type: 'openModal', field })
        return
      }
      // Navigate-the-canvas: keep edit mode across the clinic's OWN pages.
      // An internal `/site/...` link navigates with `?edit=1` preserved (so the
      // bridge re-mounts on the next page); an in-page `#hash` link scrolls
      // normally; external / tel: / mailto: links are suppressed so the editor
      // never gets yanked off-canvas. Buttons (nav dropdown toggles, carousels,
      // FAQ accordions) keep working — they don't navigate away.
      const a = target.closest('a') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (!href || href.startsWith('#')) return
      let url: URL | null = null
      try {
        url = new URL(href, window.location.href)
      } catch {
        url = null
      }
      if (url && url.origin === window.location.origin && url.pathname.startsWith('/site/')) {
        e.preventDefault()
        e.stopPropagation()
        url.searchParams.set('edit', '1')
        window.location.assign(url.pathname + url.search + url.hash)
        return
      }
      e.preventDefault()
      e.stopPropagation()
    }

    // Floating "Edit {label}" affordance shown when hovering a modal section.
    const editBtn = document.createElement('button')
    editBtn.type = 'button'
    editBtn.className = 'dc-edit-btn'
    editBtn.style.display = 'none'
    let editBtnField = ''
    let editBtnKind = ''
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    editBtn.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      if (!editBtnField) return
      post({ type: editBtnKind === 'image' ? 'editImage' : 'openModal', field: editBtnField })
    })
    editBtn.addEventListener('mouseenter', () => {
      if (hideTimer) clearTimeout(hideTimer)
    })
    editBtn.addEventListener('mouseleave', scheduleHideBtn)
    document.body.appendChild(editBtn)

    // Coarse pointer (touch / iPad): there's no hover, so the per-section ✎/📷
    // affordances would never appear. Inject a small always-visible tap target
    // into each modal/image region so the canvas is editable on touch.
    // (Template-side hero-oval rendering is owned elsewhere; this is just the
    // affordance visibility.)
    const isCoarse =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    let touchObserver: MutationObserver | null = null
    function tagTouchAffordance(el: HTMLElement) {
      const kind = el.getAttribute('data-edit-kind')
      if (kind !== 'modal' && kind !== 'image') return
      if (el.querySelector(':scope > .dc-edit-touch-tag')) return
      const field = el.getAttribute('data-edit-field') ?? ''
      const label = el.getAttribute('data-edit-label') ?? (kind === 'image' ? 'photo' : 'section')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'dc-edit-touch-tag'
      btn.textContent = kind === 'image' ? `📷 ${label}` : `✎ ${label}`
      btn.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        post({ type: kind === 'image' ? 'editImage' : 'openModal', field })
      })
      // Anchor the badge to the region without disturbing layout.
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
      el.appendChild(btn)
    }
    if (isCoarse) {
      document.body.classList.add('dc-edit-touch')
      document
        .querySelectorAll<HTMLElement>('[data-edit-kind="modal"],[data-edit-kind="image"]')
        .forEach(tagTouchAffordance)
      // Catch regions added after first paint (e.g. lazy sections).
      touchObserver = new MutationObserver((records) => {
        for (const rec of records) {
          rec.addedNodes.forEach((n) => {
            if (!(n instanceof HTMLElement)) return
            if (n.matches?.('[data-edit-kind="modal"],[data-edit-kind="image"]')) tagTouchAffordance(n)
            n.querySelectorAll?.<HTMLElement>('[data-edit-kind="modal"],[data-edit-kind="image"]').forEach(
              tagTouchAffordance,
            )
          })
        }
      })
      touchObserver.observe(document.body, { childList: true, subtree: true })
    }

    // Per-field in-flight edit state: lets the Studio RESTORE a failed inline
    // edit's element (it posts `restore` for the field) and lets us flash a
    // saving→saved tick on the element. Keyed by edit field.
    const pendingEdits = new Map<string, { el: HTMLElement; original: string }>()

    // A tiny floating hint shown under the active inline editor.
    const hint = document.createElement('div')
    hint.className = 'dc-edit-hint'
    hint.style.display = 'none'
    document.body.appendChild(hint)
    function showHint(el: HTMLElement, text: string) {
      hint.textContent = text
      const r = el.getBoundingClientRect()
      hint.style.top = `${Math.min(window.innerHeight - 28, r.bottom + 6)}px`
      hint.style.left = `${Math.max(8, Math.min(window.innerWidth - 320, r.left))}px`
      hint.style.display = 'block'
    }
    function hideHint() {
      hint.style.display = 'none'
    }

    // A brief saving→saved tick rendered at the edited element's corner.
    const tick = document.createElement('div')
    tick.className = 'dc-edit-tick'
    tick.style.display = 'none'
    document.body.appendChild(tick)
    let tickTimer: ReturnType<typeof setTimeout> | null = null
    function placeTick(el: HTMLElement) {
      const r = el.getBoundingClientRect()
      tick.style.top = `${Math.max(8, r.top - 8)}px`
      tick.style.left = `${Math.min(window.innerWidth - 90, r.right - 80)}px`
      tick.style.display = 'block'
    }
    function markSaving(el: HTMLElement) {
      tick.textContent = 'Saving…'
      tick.classList.remove('dc-edit-tick-ok')
      placeTick(el)
      if (tickTimer) clearTimeout(tickTimer)
    }
    function markSaved(el: HTMLElement) {
      tick.textContent = '✓ Saved'
      tick.classList.add('dc-edit-tick-ok')
      placeTick(el)
      if (tickTimer) clearTimeout(tickTimer)
      tickTimer = setTimeout(() => {
        tick.style.display = 'none'
      }, 1400)
    }

    function showEditBtn(el: HTMLElement) {
      editBtnField = el.getAttribute('data-edit-field') ?? ''
      editBtnKind = el.getAttribute('data-edit-kind') ?? ''
      const label = el.getAttribute('data-edit-label') ?? (editBtnKind === 'image' ? 'photo' : 'section')
      editBtn.textContent = editBtnKind === 'image' ? `📷 Replace ${label}` : `✎ Edit ${label}`
      const r = el.getBoundingClientRect()
      editBtn.style.top = `${Math.max(8, r.top + 10)}px`
      editBtn.style.left = `${Math.min(window.innerWidth - 150, Math.max(8, r.right - 140))}px`
      editBtn.style.display = 'block'
      if (hideTimer) clearTimeout(hideTimer)
    }
    function scheduleHideBtn() {
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        editBtn.style.display = 'none'
      }, 250)
    }

    function onOver(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest('[data-edit-field]') as HTMLElement | null
      if (!el) return
      el.classList.add('dc-edit-hover')
      const k = el.getAttribute('data-edit-kind')
      if (k === 'modal' || k === 'image') showEditBtn(el)
    }
    function onOut(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest('[data-edit-field]') as HTMLElement | null
      if (!el) return
      el.classList.remove('dc-edit-hover')
      const k = el.getAttribute('data-edit-kind')
      if (k === 'modal' || k === 'image') scheduleHideBtn()
    }

    // Scroll a tagged element into view + flash it. Used by both the on-load
    // reveal and the Studio's "tour" postMessages (one per AI change).
    let flashTimer: ReturnType<typeof setTimeout> | null = null
    function revealField(field: string) {
      let el: Element | null = null
      try {
        el = document.querySelector(`[data-edit-field="${field.replace(/["\\]/g, '')}"]`)
      } catch {
        el = null
      }
      if (!el) return
      const target = el
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.classList.remove('dc-reveal-flash')
      // Force reflow so re-adding the class restarts the animation on repeat hits.
      void (target as HTMLElement).offsetWidth
      target.classList.add('dc-reveal-flash')
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => target.classList.remove('dc-reveal-flash'), 1800)
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return
      const d = e.data as { source?: string; type?: string; field?: string; url?: string; section?: string }
      if (!d || d.source !== 'dreamcrm-studio') return
      if (d.type === 'setImage' && d.field && d.url) {
        // The image's `data-edit-field` sits on the wrapper (the click target),
        // not the <img>, so swap the <img> inside it — or the element itself if
        // it happens to be the <img>.
        let region: Element | null = null
        try {
          region = document.querySelector(`[data-edit-field="${d.field.replace(/["\\]/g, '')}"]`)
        } catch {
          region = null
        }
        const img =
          region instanceof HTMLImageElement ? region : (region?.querySelector('img') ?? null)
        if (img instanceof HTMLImageElement) img.src = d.url
      } else if (d.type === 'scrollTo' && d.section) {
        document
          .querySelector(`[data-edit-section="${d.section}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (d.type === 'reveal' && d.field) {
        revealField(d.field)
      } else if (d.type === 'restore' && d.field) {
        // The Studio's inline save failed — put the element's original text back
        // so an unsaved value never lingers looking saved. Show a "couldn't save"
        // tick on it.
        const pend = pendingEdits.get(d.field)
        if (pend) {
          pend.el.textContent = pend.original
          pendingEdits.delete(d.field)
          tick.textContent = 'Couldn’t save'
          tick.classList.remove('dc-edit-tick-ok')
          placeTick(pend.el)
          if (tickTimer) clearTimeout(tickTimer)
          tickTimer = setTimeout(() => { tick.style.display = 'none' }, 2200)
        }
      } else if (d.type === 'saved' && d.field) {
        // Confirmed save — flash the saved tick (the canvas usually reloads right
        // after, so this is a brief confirmation in the in-flight window).
        const pend = pendingEdits.get(d.field)
        if (pend) {
          markSaved(pend.el)
          pendingEdits.delete(d.field)
        }
      }
    }

    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    window.addEventListener('message', onMessage)
    document.body.classList.add('dc-edit-mode')
    post({ type: 'ready' })

    // "Follow the AI": when the Studio navigates here with ?reveal=<field> after
    // an AI edit, scroll to the changed element and flash it. Deferred a beat so
    // layout + fonts settle first.
    const reveal = new URLSearchParams(window.location.search).get('reveal')
    let revealTimer: ReturnType<typeof setTimeout> | null = null
    if (reveal) {
      revealTimer = setTimeout(() => revealField(reveal), 160)
      // Consume the param: the Studio reloads this SAME url after every later
      // manual save, and a lingering ?reveal would yank the scroll position
      // back to this (old) AI edit on each of those reloads.
      try {
        const u = new URL(window.location.href)
        u.searchParams.delete('reveal')
        u.searchParams.delete('_')
        window.history.replaceState(null, '', u.pathname + u.search + u.hash)
      } catch {
        /* non-fatal — worst case the old behavior */
      }
    }

    return () => {
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      window.removeEventListener('message', onMessage)
      document.body.classList.remove('dc-edit-mode')
      document.body.classList.remove('dc-edit-touch')
      if (hideTimer) clearTimeout(hideTimer)
      if (revealTimer) clearTimeout(revealTimer)
      if (flashTimer) clearTimeout(flashTimer)
      if (tickTimer) clearTimeout(tickTimer)
      editBtn.remove()
      hint.remove()
      tick.remove()
      touchObserver?.disconnect()
      document.querySelectorAll('.dc-edit-touch-tag').forEach((n) => n.remove())
    }
  }, [])

  return (
    <style>{`
      .dc-edit-mode [data-edit-field] {
        outline: 2px solid transparent; outline-offset: 3px; border-radius: 6px;
        transition: outline-color .12s, background-color .12s; cursor: text;
      }
      .dc-edit-mode [data-edit-field][data-edit-kind="image"],
      .dc-edit-mode [data-edit-field][data-edit-kind="modal"] { cursor: pointer; }
      .dc-edit-mode [data-edit-field].dc-edit-hover {
        outline-color: #8b5cf6; background-color: rgba(139,92,246,0.05);
      }
      .dc-edit-mode [contenteditable="true"] {
        outline-color: #8b5cf6 !important; background-color: rgba(139,92,246,0.08);
      }
      .dc-edit-btn {
        position: fixed; z-index: 2147483646; border: none; cursor: pointer;
        background: #8b5cf6; color: #fff; font: 600 12px/1 Inter, system-ui, sans-serif;
        padding: 8px 13px; border-radius: 9px; box-shadow: 0 4px 14px rgba(0,0,0,0.18);
      }
      .dc-edit-btn:hover { background: #7c3aed; }
      .dc-edit-hint {
        position: fixed; z-index: 2147483646; pointer-events: none;
        background: rgba(17,24,39,0.92); color: #e5e7eb;
        font: 500 11px/1.3 Inter, system-ui, sans-serif;
        padding: 5px 9px; border-radius: 7px; max-width: 320px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.22);
      }
      .dc-edit-tick {
        position: fixed; z-index: 2147483646; pointer-events: none;
        background: rgba(17,24,39,0.92); color: #fde68a;
        font: 600 11px/1 Inter, system-ui, sans-serif;
        padding: 5px 9px; border-radius: 999px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.22);
      }
      .dc-edit-tick.dc-edit-tick-ok { color: #6ee7b7; }
      /* Always-visible touch affordance injected into each editable region on
         coarse pointers (iPad/phone), where hover doesn't exist. */
      .dc-edit-touch-tag {
        position: absolute; top: 6px; right: 6px; z-index: 2147483645;
        border: none; cursor: pointer; background: rgba(139,92,246,0.92); color: #fff;
        font: 600 11px/1 Inter, system-ui, sans-serif;
        padding: 5px 9px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      @keyframes dcRevealFlash {
        0%   { outline-color: rgba(139,92,246,0); background-color: rgba(139,92,246,0); }
        18%  { outline-color: rgba(139,92,246,0.95); background-color: rgba(139,92,246,0.16); }
        100% { outline-color: rgba(139,92,246,0); background-color: rgba(139,92,246,0); }
      }
      .dc-reveal-flash {
        animation: dcRevealFlash 1.8s ease-out;
        outline: 3px solid transparent; outline-offset: 5px; border-radius: 8px;
      }
      /* Affordances that exist ONLY in the editor — e.g. a "write your story"
         placeholder for a section the clinic hasn't filled in yet. Hidden for
         public visitors; revealed (and editable) inside the Studio. */
      .dc-edit-only { display: none; }
      .dc-edit-mode .dc-edit-only { display: block; }
    `}</style>
  )
}
