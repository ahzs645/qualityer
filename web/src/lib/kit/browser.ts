import { createFontProvider, type FontProvider } from 'document-kit/layout'
import type { Rasterize } from './data'

// Browser-only helpers for document-kit: the bundled open fonts, served as the app's own assets (the kit never
// fetches anything), and charts drawn from SVG to PNG on a canvas for Word, which does not take SVG pictures.

const fontUrls = import.meta.glob('../../../../vendor/document-kit/fonts/*.ttf', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>

let provider: FontProvider | null = null

/** The kit's stand-in fonts (Carlito for Calibri, Arimo, …), each fetched from this app the first time a document needs it. */
export function browserFonts(): FontProvider {
  provider ??= createFontProvider(async ({ file }) => {
    const load = Object.entries(fontUrls).find(([path]) => path.endsWith(`/${file}`))?.[1]
    if (!load) return null
    const res = await fetch(await load())
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
  })
  return provider
}

/** Draws an SVG chart at twice its size on a white background and returns PNG bytes. */
export const rasterize: Rasterize = async (svg, width, height) => {
  const scale = 2
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  try { await img.decode() } catch { return null }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height } : null
}
