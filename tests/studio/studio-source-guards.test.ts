import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Cheap source-level guards for Studio-fix-wave behaviors that are awkward to
 * exercise through the iframe in happy-dom but trivially checkable in source:
 *  - the services picker toast must sit above the Studio modal (z-order);
 *  - the AI bar must stay MOUNTED while a modal is open (Undo survival);
 *  - the Undo control is relabelled to its single-level wording;
 *  - an unknown image field opens the stale "refresh to edit" fallback, not a
 *    blank modal.
 * These pin the exact strings so a refactor can't silently regress them.
 */
const ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

const studio = read('app/(default)/website/website-studio.tsx')
const aiBar = read('app/(default)/website/studio-ai-bar.tsx')
const picker = read('app/(default)/settings/clinic/services-library-picker.tsx')

describe('services picker toast z-order', () => {
  it('uses z-[90] so it clears the Studio modal (z-[70]) + its drawer (z-[80])', () => {
    // The toast div carries z-[90]; the old z-[60] sat UNDER the modal.
    expect(picker).toMatch(/Toast[\s\S]{0,260}z-\[90\]/)
    expect(picker).not.toMatch(/fixed bottom-6 right-6 z-\[60\]/)
  })
})

describe('AI Undo survives a section modal', () => {
  it('mounts StudioAiBar unconditionally (CSS-hidden under a modal), not `!modal && <StudioAiBar`', () => {
    expect(studio).not.toMatch(/\{!modal && <StudioAiBar/)
    // It's rendered with a `hidden` prop driven by the open modal.
    expect(studio).toMatch(/<StudioAiBar[\s\S]{0,200}hidden=\{!!modal\}/)
  })

  it('lifts undoData to the shell so it persists across modal open/close', () => {
    expect(studio).toMatch(/undoData=\{undoData\}/)
    expect(studio).toMatch(/onUndoData=\{setUndoData\}/)
  })

  it('relabels the control to single-level "Undo last AI change"', () => {
    expect(aiBar).toMatch(/Undo last AI change/)
  })
})

describe('unknown image field → stale fallback (not a blank modal)', () => {
  it('routes editImage for a field missing from IMAGE_FIELDS to kind:stale', () => {
    expect(studio).toMatch(/IMAGE_FIELDS\[d\.field\] \? 'image' : 'stale'/)
  })

  it('renders the refresh-to-edit fallback for a stale modal', () => {
    expect(studio).toMatch(/isStale/)
    expect(studio).toMatch(/Refresh to edit/)
  })
})

describe('dirty-confirm on modal close', () => {
  it('routes ESC / backdrop / X / Cancel through a discard confirm', () => {
    expect(studio).toMatch(/requestClose/)
    expect(studio).toMatch(/Discard unsaved changes\?/)
  })
})

describe('inline-save failure reverts the element', () => {
  it('posts a restore message on a failed inline save', () => {
    expect(studio).toMatch(/postRestore\(field\)/)
    expect(read('components/clinic-site/edit-bridge.tsx')).toMatch(/d\.type === 'restore'/)
  })
})

describe('touch affordances in the bridge (coarse pointer)', () => {
  const bridge = read('components/clinic-site/edit-bridge.tsx')
  it('detects a coarse pointer and tags each editable region with an always-visible affordance', () => {
    expect(bridge).toMatch(/pointer: coarse/)
    expect(bridge).toMatch(/tagTouchAffordance/)
    expect(bridge).toMatch(/dc-edit-touch-tag/)
  })
  it('only injects touch affordances for image/modal regions (not inline text)', () => {
    expect(bridge).toMatch(/data-edit-kind="modal"\],?\s*\[?data-edit-kind="image"|data-edit-kind="modal"\],\[data-edit-kind="image"\]/)
  })
})

describe('tour robustness', () => {
  it('gates tour steps on a bridge ready ack (not a blind sleep)', () => {
    expect(studio).toMatch(/waitForReady/)
    expect(studio).toMatch(/readyResolve/)
    expect(read('components/clinic-site/edit-bridge.tsx')).toMatch(/post\(\{ type: 'ready' \}\)/)
  })
  it('tracks the owner page so a tour-cancel reload lands where they were editing', () => {
    expect(studio).toMatch(/ownerPage/)
    expect(studio).toMatch(/reloadFrame\(ownerAt\)/)
  })
})

describe('hero tagline AI affordance lives in the top bar', () => {
  it('mounts HeroTaglineRewrite (the tagline edits inline — no modal)', () => {
    expect(studio).toMatch(/<HeroTaglineRewrite/)
  })
})

describe('viewport toggle (desktop / phone canvas)', () => {
  it('changes only the wrapper max-width — the iframe itself must not remount on toggle', () => {
    // The width class lives on a wrapper div driven by `viewport`, and the
    // iframe's own className must stay static (no viewport-conditional class),
    // so switching views can't reload the canvas mid-edit.
    expect(studio).toMatch(/viewport === 'mobile'\s*\?\s*'max-w-\[390px\]/)
    expect(studio).toMatch(/<iframe[\s\S]{0,300}className="w-full h-full border-0 bg-white"/)
  })
  it('exposes both states as an accessible pressed-button group', () => {
    expect(studio).toMatch(/aria-pressed=\{viewport === 'desktop'\}/)
    expect(studio).toMatch(/aria-pressed=\{viewport === 'mobile'\}/)
  })
})

describe('page navigator', () => {
  it('tracks the canvas page via the bridge ready ping (state, not just the ref)', () => {
    expect(studio).toMatch(/setCanvasPage\(ownerPage\.current\)/)
  })
  it('falls back to a disabled "Current page" option for paths not in the list', () => {
    expect(studio).toMatch(/Current page/)
    expect(studio).toMatch(/value="__other" disabled/)
  })
  it('navigates in edit mode', () => {
    expect(studio).toMatch(/goToPage/)
    expect(studio).toMatch(/`\/site\/\$\{slug\}\$\{path\}\?edit=1`/)
  })
})

describe('brand color in the Studio', () => {
  const actions = read('app/(default)/website/website-actions.ts')
  const popover = read('app/(default)/website/brand-color-popover.tsx')
  it('saveBrandColor validates strict #RRGGBB before any write (junk can never poison the palette)', () => {
    expect(actions).toMatch(/saveBrandColor/)
    expect(actions).toMatch(/\^#\[0-9a-fA-F\]\{6\}\$/)
  })
  it('the popover is mounted in the top bar and repaints the canvas on save', () => {
    expect(studio).toMatch(/<BrandColorPopover[\s\S]{0,200}onSaved=\{\(\) => reloadFrame\(\)\}/)
  })
  it('client-side gate mirrors the server regex (Save disabled until a valid hex)', () => {
    expect(popover).toMatch(/\^#\[0-9a-fA-F\]\{6\}\$/)
    expect(popover).toMatch(/disabled=\{!normalized \|\| busy\}/)
  })
})

describe('collapsible AI bar', () => {
  it('persists the collapsed state per browser', () => {
    expect(aiBar).toMatch(/dc-studio-ai-min/)
  })
  it('keeps the pending-Undo cue visible while collapsed (amber dot on the pill)', () => {
    expect(aiBar).toMatch(/undoData && !working[\s\S]{0,300}bg-amber-400/)
  })
  it('focuses the input on expand', () => {
    expect(aiBar).toMatch(/requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/)
  })
})
