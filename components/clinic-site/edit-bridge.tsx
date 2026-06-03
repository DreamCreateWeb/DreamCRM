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

      const finish = (commit: boolean) => {
        el.removeEventListener('blur', onBlur)
        el.removeEventListener('keydown', onKey)
        el.setAttribute('contenteditable', 'false')
        const value = (el.textContent ?? '').trim()
        if (commit && value !== original.trim()) post({ type: 'save', field, value })
        else el.textContent = original
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
      el.addEventListener('blur', onBlur)
      el.addEventListener('keydown', onKey)
    }

    function onClickCapture(e: MouseEvent) {
      const target = e.target as HTMLElement
      const editable = target.closest('[data-edit-field]') as HTMLElement | null
      const nav = target.closest('a, button')
      // Suppress navigation/interactions while editing — keep the clinic on
      // the canvas. Editable regions handle their own click below.
      if (nav && !editable) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (!editable) return
      e.preventDefault()
      e.stopPropagation()
      const kind = editable.getAttribute('data-edit-kind') ?? 'text'
      const field = editable.getAttribute('data-edit-field') ?? ''
      if (kind === 'text') startTextEdit(editable, field)
      else if (kind === 'image') post({ type: 'editImage', field })
      else if (kind === 'modal') post({ type: 'openModal', field })
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

    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return
      const d = e.data as { source?: string; type?: string; field?: string; url?: string; section?: string }
      if (!d || d.source !== 'dreamcrm-studio') return
      if (d.type === 'setImage' && d.field) {
        const el = document.querySelector(`[data-edit-field="${d.field}"]`)
        if (el instanceof HTMLImageElement && d.url) el.src = d.url
      } else if (d.type === 'scrollTo' && d.section) {
        document
          .querySelector(`[data-edit-section="${d.section}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    window.addEventListener('message', onMessage)
    document.body.classList.add('dc-edit-mode')
    post({ type: 'ready' })

    return () => {
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      window.removeEventListener('message', onMessage)
      document.body.classList.remove('dc-edit-mode')
      if (hideTimer) clearTimeout(hideTimer)
      editBtn.remove()
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
    `}</style>
  )
}
