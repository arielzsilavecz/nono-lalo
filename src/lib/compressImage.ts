/**
 * Downscale + re-encode an image in the browser before uploading, so we don't
 * store multi-MB originals that every menu visitor would have to download.
 *
 * - Longest side is capped at `maxDim` (keeps aspect ratio).
 * - Re-encodes to JPEG at `quality`.
 * - Respects EXIF orientation (`imageOrientation: 'from-image'`) so portrait
 *   photos from phones don't come out sideways.
 * - Falls back to the original file if anything fails (e.g. an unsupported
 *   format the browser can't decode), so an upload never silently breaks.
 */
export async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.82,
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    // If re-encoding somehow produced a bigger file than the original, keep the original.
    if (!blob || blob.size >= file.size) return file
    return blob
  } catch {
    return file
  }
}
