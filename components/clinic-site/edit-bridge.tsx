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

    function onOver(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest('[data-edit-field]') as HTMLElement | null
      el?.classList.add('dc-edit-hover')
    }
    function onOut(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest('[data-edit-field]') as HTMLElement | null
      el?.classList.remove('dc-edit-hover')
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
    `}</style>
  )
}
