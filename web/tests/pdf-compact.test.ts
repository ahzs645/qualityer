import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { unzlibSync } from 'fflate'
import { createFontProvider, layoutDocx } from 'document-kit/layout'
import { demoProject } from '../src/lib/demo'
import { buildDocument } from '../src/lib/kit/render'
import { compactPdf } from '../src/lib/kit/pdf-compact'
import { indexedPng } from '../src/lib/kit/png'

const fontDir = fileURLToPath(new URL('../../vendor/document-kit/fonts/', import.meta.url))
const fonts = createFontProvider(({ file }) => new Uint8Array(readFileSync(fontDir + file)))
const latin1 = new TextDecoder('latin1')

/** Every object's number and stream content (inflated when deflated), read by the cross-reference table. */
function read(pdf: Uint8Array) {
  const text = latin1.decode(pdf)
  const start = Number(/startxref\s+(\d+)/.exec(text.slice(text.lastIndexOf('startxref')))![1])
  expect(text.slice(start, start + 4)).toBe('xref')
  const rows = text.slice(start).split('\n').slice(2).filter((r) => / [nf] ?$/.test(r))
  const out = new Map<number, { dict: string; data: Uint8Array | null }>()
  rows.forEach((row, n) => {
    if (!row.includes(' n')) return
    const at = Number(row.slice(0, 10))
    expect(text.slice(at).startsWith(`${n} 0 obj`)).toBe(true)
    const kw = text.indexOf('stream', at), end = text.indexOf('endobj', at)
    const dict = text.slice(at, kw > 0 && kw < end ? kw : end)
    if (!(kw > 0 && kw < end)) { out.set(n, { dict, data: null }); return }
    const len = Number(/\/Length (\d+)/.exec(dict)![1])
    const from = kw + 'stream\n'.length
    const raw = pdf.subarray(from, from + len)
    out.set(n, { dict, data: /FlateDecode/.test(dict) ? unzlibSync(raw) : raw })
  })
  return out
}

describe('compacting the kit PDF', () => {
  it('deflates page drawing and keeps every object the same', async () => {
    const doc = await buildDocument(demoProject(), 'rw-standard')
    const original = (await layoutDocx(doc.docx, { fonts })).toPdf().bytes
    const compact = compactPdf(original)
    expect(compact.length).toBeLessThan(original.length * 0.8)
    const a = read(original), b = read(compact)
    expect([...b.keys()]).toEqual([...a.keys()])
    for (const [n, o] of a) expect(b.get(n)!.data).toEqual(o.data)
    expect(latin1.decode(compact).match(/startxref/g)).toHaveLength(1)
  }, 60_000)

  it('stores a chart with a palette, losslessly', async () => {
    const w = 120, h = 40
    const px = new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (i >> 6) % 2 ? 31 : 250))
    const png = indexedPng(px, w, h)
    const { document, section, figure } = await import('document-kit')
    const { writeDocx } = await import('document-kit/docx')
    const docx = await writeDocx(document([section([figure({ bytes: png, format: 'png', width: w, height: h })])]))
    const original = (await layoutDocx(docx, { fonts })).toPdf().bytes
    const compact = compactPdf(original)
    const img = (m: Map<number, { dict: string; data: Uint8Array | null }>) => [...m.values()].find((o) => o.dict.includes('/Subtype /Image'))!
    const before = img(read(original)), after = img(read(compact))
    expect(after.dict).toContain('/Indexed /DeviceRGB')
    const hex = /<([0-9a-f]+)>/.exec(after.dict)![1]
    const palette = Array.from({ length: hex.length / 6 }, (_, i) => hex.slice(i * 6, i * 6 + 6))
    const rgb = Array.from(after.data!, (k) => palette[k]).join('')
    expect(rgb).toBe(Array.from(before.data!, (v) => v.toString(16).padStart(2, '0')).join(''))
  }, 60_000)

  it('leaves a file it does not recognise as it is', () => {
    const odd = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\n0 2\ntrailer\n<</Size 2 /Prev 10>>\nstartxref\n20\n%%EOF\n')
    expect(compactPdf(odd)).toBe(odd)
    const junk = new Uint8Array([1, 2, 3])
    expect(compactPdf(junk)).toBe(junk)
  })
})
