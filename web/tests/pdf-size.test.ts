import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createFontProvider } from 'document-kit/layout'
import { demoProject } from '../src/lib/demo'
import { buildDocument, layOut } from '../src/lib/kit/render'
import { indexedPng } from '../src/lib/kit/png'

// document-kit writes compact PDFs (its change 16): page drawing deflated and 256-colour charts kept as palettes.
// The app used to rewrite the kit's PDFs to that effect; these check the kit in vendor/ still does it itself.

const fontDir = fileURLToPath(new URL('../../vendor/document-kit/fonts/', import.meta.url))
const fonts = createFontProvider(({ file }) => new Uint8Array(readFileSync(fontDir + file)))
const latin1 = new TextDecoder('latin1')

describe('compact PDFs from document-kit', () => {
  it('compresses every stream, page drawing included', async () => {
    const pdf = latin1.decode((await layOut((await buildDocument(demoProject(), 'rw-standard')).docx, fonts)).pdf())
    const streams = [...pdf.matchAll(/\d+ 0 obj\s*(<<[\s\S]*?>>)\s*stream/g)].map((m) => m[1])
    expect(streams.length).toBeGreaterThan(2)
    expect(streams.filter((d) => !/\/Filter/.test(d) && !/\/Length 0\b/.test(d))).toEqual([])
  }, 60_000)

  it('keeps a chart drawn as a 256-colour PNG as a palette image', async () => {
    const w = 60, h = 20
    const px = new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (i >> 5) % 2 ? 31 : 250))
    const chart = { bytes: indexedPng(px, w, h), width: w, height: h }
    const doc = await buildDocument(demoProject(), 'rw-visual', { kind: 'all' }, { rasterize: async () => chart })
    const pdf = latin1.decode((await layOut(doc.docx, fonts)).pdf())
    const images = [...pdf.matchAll(/<<[^>]*\/Subtype \/Image[^\n]*/g)].map((m) => m[0])
    expect(images.length).toBeGreaterThan(0)
    for (const img of images) expect(img).toContain('/Indexed /DeviceRGB')
  }, 60_000)
})
