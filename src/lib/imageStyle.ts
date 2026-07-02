import type { CSSProperties } from 'react'

/**
 * Every dish-image box (editor preview, public menu, landing, thumbnails) must
 * use the SAME aspect ratio: `aspect-2/1`. Because `object-cover` crops based
 * on the box shape, differing ratios would frame the same position/zoom
 * differently. The class is written literally in each JSX file so Tailwind's
 * scanner detects it — do NOT indirect it through a constant here.
 */

/**
 * Shared style for dish images so the editor preview, the public menu and the
 * landing all render identically. The image element must also carry
 * `object-cover` (centered by default); this only adds pan + zoom on top.
 *
 * `position` is stored as "TX% TY%" translate percentages (relative to the
 * image box). Legacy values like "center center" parse to 0/0 (centered).
 */
export function imageFitStyle(position: string | null | undefined, zoom: number | null | undefined): CSSProperties {
  const [rawX, rawY] = (position ?? '').split(' ').map((v) => parseFloat(v))
  const tx = Number.isFinite(rawX) ? rawX : 0
  const ty = Number.isFinite(rawY) ? rawY : 0
  const z = Number.isFinite(zoom) && (zoom as number) > 0 ? (zoom as number) : 1
  return { transform: `translate(${tx}%, ${ty}%) scale(${z})` }
}
