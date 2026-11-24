import { describe, expect, it } from 'vitest'
import { unzlibSync } from 'fflate'
import { indexedPng } from '../src/lib/kit/png'

/** Reads an 8-bit palette PNG back: size, palette and each pixel's colour. */
function decode(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset)
  expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  let at = 8, width = 0, height = 0, depth = 0, kind = 0
  let palette: number[][] = []
  const idat: Uint8Array[] = []
  while (at < png.length) {
    const len = view.getUint32(at)
    const type = String.fromCharCode(...png.slice(at + 4, at + 8))
    const data = png.slice(at + 8, at + 8 + len)
    if (type === 'IHDR') { width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = data[8]; kind = data[9] }
    if (type === 'PLTE') palette = Array.from({ length: len / 3 }, (_, i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]])
    if (type === 'IDAT') idat.push(data)
    at += 12 + len
  }
  const raw = unzlibSync(new Uint8Array(idat.flatMap((d) => [...d])))
  const pixel = (x: number, y: number) => palette[raw[y * (width + 1) + 1 + x]]
  return { width, height, depth, kind, palette, pixel }
}

const image = (w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]) => {
  const px = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(fill(x, y), (y * w + x) * 4)
  return px
}

describe('indexed PNG for charts', () => {
  it('keeps a few flat colours exactly, with no alpha channel', () => {
    const png = indexedPng(image(30, 10, (x) => (x < 10 ? [28, 92, 171, 255] : x < 20 ? [239, 159, 158, 255] : [255, 255, 255, 255])), 30, 10)
    const d = decode(png)
    expect([d.width, d.height, d.depth, d.kind]).toEqual([30, 10, 8, 3])
    expect(d.palette).toHaveLength(3)
    expect(d.pixel(0, 0)).toEqual([28, 92, 171])
    expect(d.pixel(15, 9)).toEqual([239, 159, 158])
    expect(d.pixel(29, 5)).toEqual([255, 255, 255])
  })

  it('lays transparent pixels on white', () => {
    const d = decode(indexedPng(image(2, 1, (x) => (x ? [0, 0, 0, 0] : [0, 0, 0, 128])), 2, 1))
    expect(d.pixel(1, 0)).toEqual([255, 255, 255])
    expect(d.pixel(0, 0)).toEqual([127, 127, 127])
  })

  it('maps rare colours to the nearest common one when there are more than the palette holds', () => {
    // 300 shades: the 256 most common stay, the rarest take a neighbour within a few steps.
    const png = indexedPng(image(300, 4, (x, y) => [x % 256, y === 0 && x >= 256 ? 7 : 0, 0, 255]), 300, 4)
    const d = decode(png)
    expect(d.palette.length).toBeLessThanOrEqual(256)
    const [r, g, b] = d.pixel(280, 0)
    expect(Math.abs(r - 24) + Math.abs(g - 7) + b).toBeLessThan(12)
  })

  it('is much smaller than raw pixels for a chart-like picture', () => {
    const w = 760, h = 330
    const png = indexedPng(image(w, h, (x, y) => ((x >> 5) % 2 && y > 40 ? [31, 111, 107, 255] : [255, 255, 255, 255])), w, h)
    expect(png.length).toBeLessThan(w * h * 4 / 100)
  })
})
