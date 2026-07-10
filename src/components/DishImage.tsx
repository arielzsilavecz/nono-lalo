import type { SyntheticEvent } from 'react'
import { imageFitStyle } from '../lib/imageStyle'

interface DishImageProps {
  imageUrl: string
  position: string
  zoom: number
  alt?: string
  /** Sizing/rounding for the outer box, e.g. "aspect-2/1 w-full" or "h-full w-full". */
  className?: string
  onSharpLoad?: (e: SyntheticEvent<HTMLImageElement>) => void
}

/**
 * The one true way a dish image renders — editor preview, public menu, landing
 * and thumbnails all use this so they look identical.
 *
 * The whole image is shown (object-contain, never cropped); the leftover space
 * in the wide box is filled by a blurred, dimmed copy of the same image so it
 * always looks full — no black bars, no empty margins. `position`/`zoom` pan and
 * zoom the sharp image on top (zoom 1 = whole image centered).
 */
export function DishImage({ imageUrl, position, zoom, alt = '', className = '', onSharpLoad }: DishImageProps) {
  return (
    <div className={`relative overflow-hidden bg-crema-100 ${className}`}>
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ filter: 'blur(18px) brightness(0.7)', transform: 'scale(1.15)' }}
      />
      <img
        src={imageUrl}
        alt={alt}
        draggable={false}
        onLoad={onSharpLoad}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={imageFitStyle(position, zoom)}
      />
    </div>
  )
}
