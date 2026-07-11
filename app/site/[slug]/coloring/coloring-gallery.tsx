'use client'

import { useEffect, useRef, useState } from 'react'
import type { ClinicColoringPage } from '@/lib/types/clinic-content'
import { SITE_SURFACE, SITE_BORDER, SITE_INK, SITE_INK_MUTED, SITE_DEEP, SITE_DEEP_INK } from '@/components/clinic-site/tokens'

/**
 * The kids' coloring corner — a grid of staff-uploaded line-art sheets. Each
 * opens the in-browser coloring studio (brush + playful palette over a canvas;
 * the line art composites on top with `multiply`, so black outlines always
 * survive the crayon) or prints clean for the old-fashioned way.
 *
 * No persistence, no accounts — a kid colors, maybe downloads their
 * masterpiece, and nothing is stored. Print opens a minimal window with just
 * the sheet so the browser's print dialog does the rest.
 */

const CRAYONS = [
  '#E4572E', // orange-red
  '#F3A712', // sunny yellow
  '#76B041', // grass green
  '#17BEBB', // teal splash
  '#3D89F0', // sky blue
  '#7768AE', // grape
  '#E86A92', // bubblegum
  '#8B5A2B', // bear brown
  '#3B3B3B', // crayon black
]
const BRUSHES = [6, 14, 26]

function printSheet(page: ClinicColoringPage) {
  const w = window.open('', '_blank', 'noopener,width=800,height=1000')
  if (!w) return
  w.document.write(
    `<!doctype html><title>${(page.title ?? 'Coloring page').replace(/</g, '')}</title>` +
      `<style>body{margin:0;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100vh}</style>` +
      `<img src="${page.imageUrl}" onload="setTimeout(function(){window.print()},150)" alt="">`,
  )
  w.document.close()
}

function ColoringStudio({ page, onClose }: { page: ClinicColoringPage; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Strokes live on an offscreen layer; every frame composites white ground →
  // strokes → line art (multiply), so outlines stay crisp over any crayon.
  const strokesRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [color, setColor] = useState(CRAYONS[4])
  const [brush, setBrush] = useState(BRUSHES[1])
  const [eraser, setEraser] = useState(false)
  const [ready, setReady] = useState(false)
  const [canDownload, setCanDownload] = useState(true)

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    // Try CORS-clean first so download (toDataURL) works; fall back to a
    // tainted canvas (coloring still works, download quietly disables).
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      imgRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return
      const maxW = 900
      const scale = Math.min(1, maxW / img.naturalWidth)
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const strokes = document.createElement('canvas')
      strokes.width = canvas.width
      strokes.height = canvas.height
      strokesRef.current = strokes
      setReady(true)
      composite()
    }
    img.onerror = () => {
      if (cancelled) return
      const plain = new Image()
      plain.onload = img.onload as () => void
      plain.src = page.imageUrl
      imgRef.current = plain
      setCanDownload(false)
    }
    img.src = page.imageUrl
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.imageUrl])

  function composite() {
    const canvas = canvasRef.current
    const strokes = strokesRef.current
    const img = imgRef.current
    if (!canvas || !strokes || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(strokes, 0, 0)
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function strokeTo(p: { x: number; y: number }) {
    const strokes = strokesRef.current
    if (!strokes) return
    const ctx = strokes.getContext('2d')
    if (!ctx) return
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    ctx.strokeStyle = color
    ctx.lineWidth = brush
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    const from = last.current ?? p
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    composite()
  }

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const a = document.createElement('a')
      a.download = `${(page.title ?? 'my-coloring-page').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } catch {
      setCanDownload(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(28,26,23,0.82)' }}
      role="dialog"
      aria-label={`Color ${page.title ?? 'this page'}`}
    >
      <div className="w-full max-w-3xl rounded-3xl p-4 sm:p-6" style={{ background: SITE_SURFACE }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold truncate" style={{ color: SITE_INK }}>
            🖍️ {page.title ?? 'Color me!'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold"
            style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}
          >
            Done
          </button>
        </div>

        {/* Crayon box */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {CRAYONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c)
                setEraser(false)
              }}
              aria-label={`Crayon ${c}`}
              aria-pressed={color === c && !eraser}
              className="w-9 h-9 rounded-full border-4 transition-transform hover:scale-110"
              style={{
                background: c,
                borderColor: color === c && !eraser ? SITE_INK : 'transparent',
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => setEraser((v) => !v)}
            aria-pressed={eraser}
            className="h-9 rounded-full px-3 text-sm font-semibold border-2"
            style={{
              borderColor: eraser ? SITE_INK : SITE_BORDER,
              color: SITE_INK,
              background: SITE_SURFACE,
            }}
          >
            🧽 Eraser
          </button>
          <span className="mx-1 w-px h-6" style={{ background: SITE_BORDER }} aria-hidden="true" />
          {BRUSHES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrush(b)}
              aria-label={`Brush size ${b}`}
              aria-pressed={brush === b}
              className="w-9 h-9 rounded-full border-2 flex items-center justify-center"
              style={{ borderColor: brush === b ? SITE_INK : SITE_BORDER }}
            >
              <span
                className="rounded-full"
                style={{ width: b / 2 + 4, height: b / 2 + 4, background: eraser ? SITE_BORDER : color }}
              />
            </button>
          ))}
        </div>

        <canvas
          ref={canvasRef}
          className="w-full rounded-2xl touch-none select-none"
          style={{ border: `2px dashed ${SITE_BORDER}`, background: '#FFFFFF', cursor: 'crosshair' }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            last.current = null
            strokeTo(pos(e))
          }}
          onPointerMove={(e) => {
            if (drawing.current) strokeTo(pos(e))
          }}
          onPointerUp={() => {
            drawing.current = false
            last.current = null
          }}
          onPointerCancel={() => {
            drawing.current = false
            last.current = null
          }}
        />
        {!ready && (
          <p className="text-sm mt-3" style={{ color: SITE_INK_MUTED }}>
            Getting your page ready…
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => {
              const strokes = strokesRef.current
              const ctx = strokes?.getContext('2d')
              if (strokes && ctx) {
                ctx.clearRect(0, 0, strokes.width, strokes.height)
                composite()
              }
            }}
            className="rounded-full px-4 py-2 text-sm font-semibold border"
            style={{ borderColor: SITE_BORDER, color: SITE_INK }}
          >
            Start over
          </button>
          <button
            type="button"
            onClick={() => printSheet(page)}
            className="rounded-full px-4 py-2 text-sm font-semibold border"
            style={{ borderColor: SITE_BORDER, color: SITE_INK }}
          >
            🖨️ Print a blank one
          </button>
          {canDownload && (
            <button
              type="button"
              onClick={download}
              className="rounded-full px-4 py-2 text-sm font-semibold"
              style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}
            >
              ⬇️ Save my masterpiece
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ColoringGallery({ pages }: { pages: ClinicColoringPage[] }) {
  const [active, setActive] = useState<ClinicColoringPage | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        {pages.map((p) => (
          <div
            key={p.id}
            className="rounded-3xl overflow-hidden transition-transform hover:-translate-y-1 hover:rotate-[0.5deg]"
            style={{ background: SITE_SURFACE, border: `2px solid ${SITE_BORDER}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.imageUrl}
              alt={p.title ?? 'Coloring page'}
              loading="lazy"
              className="w-full aspect-[3/4] object-contain bg-white"
            />
            <div className="p-3">
              {p.title && (
                <p className="text-sm font-bold mb-2 truncate" style={{ color: SITE_INK }}>
                  {p.title}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActive(p)}
                  className="flex-1 rounded-full py-2 text-sm font-semibold"
                  style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}
                >
                  🖍️ Color it
                </button>
                <button
                  type="button"
                  onClick={() => printSheet(p)}
                  aria-label={`Print ${p.title ?? 'coloring page'}`}
                  className="rounded-full px-3 py-2 text-sm font-semibold border"
                  style={{ borderColor: SITE_BORDER, color: SITE_INK }}
                >
                  🖨️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {active && <ColoringStudio page={active} onClose={() => setActive(null)} />}
    </>
  )
}
