import { createFontProvider, type FontProvider } from 'document-kit/layout'
import type { Rasterize } from './data'
import { indexedPng } from './png'

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

const drawn = new Map<string, Promise<Awaited<ReturnType<Rasterize>>>>()

/**
 * Draws an SVG chart at twice its size on white and returns it as a 256-colour PNG (see ./png.ts): as sharp as the
 * canvas's own PNG at about a quarter of the size, with no alpha channel. The same chart is drawn once a session.
 */
export const rasterize: Rasterize = (svg, width, height) => {
  const key = `${width}x${height}:${svg}`
  if (!drawn.has(key)) {
    if (drawn.size > 200) drawn.delete(drawn.keys().next().value!)
    drawn.set(key, draw(svg, width, height).catch(() => null))
  }
  return drawn.get(key)!
}

async function draw(svg: string, width: number, height: number) {
  const scale = 2
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  return { bytes: indexedPng(pixels, canvas.width, canvas.height), width: canvas.width, height: canvas.height }
}
