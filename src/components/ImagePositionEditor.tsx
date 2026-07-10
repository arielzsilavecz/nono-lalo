import { useEffect, useRef, useState } from 'react'
import { DishImage } from './DishImage'

interface ImagePositionEditorProps {
  imageUrl: string
  position: string
  zoom: number
  onPositionChange: (position: string) => void
  onZoomChange: (zoom: number) => void
  onSelectFile: (file: File) => void
  onRemove: () => void
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

// Max translate (in % of the box) before an edge of the image would pull away
// from where it should sit. `fw`/`fh` are displayed size ÷ box size; below 1 the
// image doesn't fill that axis (kept centered), above 1 it overflows (pannable).
function panBoundsPct(fw: number, fh: number) {
  return { maxTx: Math.max(0, (fw - 1) * 50), maxTy: Math.max(0, (fh - 1) * 50) }
}

export function ImagePositionEditor({
  imageUrl,
  position,
  zoom,
  onPositionChange,
  onZoomChange,
  onSelectFile,
  onRemove,
}: ImagePositionEditorProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ px: number; py: number; startX: number; startY: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  const parsePosition = (pos: string) => {
    const [x, y] = pos.split(' ').map((v) => parseFloat(v))
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
  }
  const { x: tx, y: ty } = parsePosition(position)

  useEffect(() => { setNatural(null) }, [imageUrl])

  // object-contain into a 2:1 box: the whole image fits (min scale). fw/fh depend
  // only on the image aspect and the zoom.
  const rImg = natural ? natural.w / natural.h : 0
  const fw = rImg ? Math.min(1, rImg / 2) * zoom : 1
  const fh = rImg ? Math.min(1, 2 / rImg) * zoom : 1
  const bounds = natural ? panBoundsPct(fw, fh) : { maxTx: 0, maxTy: 0 }

  // Keep the position within what the current zoom allows (e.g. after zooming out).
  useEffect(() => {
    if (!natural) return
    const cx = clamp(tx, -bounds.maxTx, bounds.maxTx)
    const cy = clamp(ty, -bounds.maxTy, bounds.maxTy)
    if (cx !== tx || cy !== ty) onPositionChange(`${cx}% ${cy}%`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural])

  function handlePointerDown(e: React.PointerEvent) {
    boxRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, startX: tx, startY: ty }
    setDragging(true)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    const rect = boxRef.current?.getBoundingClientRect()
    if (!drag || !rect) return
    // Pointer delta as % of the box → image follows the finger 1:1.
    const deltaXpct = ((e.clientX - drag.px) / rect.width) * 100
    const deltaYpct = ((e.clientY - drag.py) / rect.height) * 100
    onPositionChange(
      `${clamp(drag.startX + deltaXpct, -bounds.maxTx, bounds.maxTx)}% ${clamp(drag.startY + deltaYpct, -bounds.maxTy, bounds.maxTy)}%`,
    )
  }

  function handlePointerUp(e: React.PointerEvent) {
    dragRef.current = null
    setDragging(false)
    try { boxRef.current?.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  const canPan = bounds.maxTx > 0 || bounds.maxTy > 0

  return (
    <div>
      <div className="flex items-start gap-3">
        {/* Preview = exactly how it renders in the menu (whole image + blurred fill) */}
        <div
          ref={boxRef}
          className={`relative aspect-2/1 flex-1 touch-none select-none overflow-hidden rounded-xl ring-1 ring-black/10 ${
            canPan ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <DishImage
            imageUrl={imageUrl}
            position={position}
            zoom={zoom}
            className="h-full w-full"
            onSharpLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />

          {/* Cambiar / Quitar — no deben iniciar el arrastre */}
          <div
            className="absolute bottom-2 right-2 flex gap-2"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <label className="cursor-pointer rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-navy-700 shadow hover:bg-white">
              Cambiar
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onSelectFile(file)
                  e.target.value = ''
                }}
              />
            </label>
            <button
              type="button"
              onClick={onRemove}
              className="cursor-pointer rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-tomate-600 shadow hover:bg-white"
            >
              Quitar
            </button>
          </div>
        </div>

        {/* Vertical zoom slider */}
        <div className="flex flex-col items-center gap-2 py-1">
          <span className="text-xs font-bold text-navy-600">+</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.02"
            value={zoom}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            aria-label="Zoom"
            className="h-40 w-2 accent-tomate-500"
            style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
          />
          <span className="text-xs font-bold text-navy-600">−</span>
          <span className="text-xs font-bold text-navy-700">{zoom.toFixed(2)}×</span>
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-navy-500">
        {canPan
          ? 'Arrastrá para reposicionar · así se verá en el menú'
          : 'Se ve la imagen completa · hacé zoom para recortar y reposicionar'}
      </p>
    </div>
  )
}
