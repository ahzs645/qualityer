import { zlibSync } from 'fflate'

// Charts as small PNG files. A canvas writes 32-bit RGBA PNGs: four bytes a pixel, an alpha channel the charts
// do not use (they sit on white), which the PDF then carries again as a separate transparency mask. Charts are a
// few flat colours with anti-aliased edges, so a 256-colour palette keeps them sharp at about a quarter of the size.

/**
 * An indexed (8-bit palette) PNG from RGBA pixels. Transparent pixels are laid on white. The palette is the most
 * common colours (the chart's own fills and the text's greys); any rarer edge shade takes the nearest of them.
 */
export function indexedPng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, maxColors = 256): Uint8Array {
  const n = width * height
  const rgb = new Uint32Array(n)
  const counts = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255
    const r = Math.round(rgba[i * 4] * a + 255 * (1 - a))
    const g = Math.round(rgba[i * 4 + 1] * a + 255 * (1 - a))
    const b = Math.round(rgba[i * 4 + 2] * a + 255 * (1 - a))
    const c = (r << 16) | (g << 8) | b
    rgb[i] = c
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  const palette = [...counts].sort((x, y) => y[1] - x[1]).slice(0, maxColors).map(([c]) => c)
  const index = new Map(palette.map((c, i) => [c, i]))
  const nearest = (c: number) => {
    let at = index.get(c)
    if (at !== undefined) return at
    const r = c >> 16, g = (c >> 8) & 255, b = c & 255
    let best = Infinity
    at = 0
    palette.forEach((p, i) => {
      const dr = r - (p >> 16), dg = g - ((p >> 8) & 255), db = b - (p & 255)
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
      if (d < best) { best = d; at = i }
    })
    index.set(c, at)
    return at
  }
  // One filter byte (0: none, best for palette images) then one index a pixel, per row.
  const raw = new Uint8Array(height * (width + 1))
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1)
    for (let x = 0; x < width; x++) raw[row + 1 + x] = nearest(rgb[y * width + x])
  }
  const plte = new Uint8Array(palette.length * 3)
  palette.forEach((c, i) => { plte[i * 3] = c >> 16; plte[i * 3 + 1] = (c >> 8) & 255; plte[i * 3 + 2] = c & 255 })
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 3, 0, 0, 0], 8) // 8-bit, palette, deflate, no filter method, no interlace
  return concat([
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0)),
  ])
}

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
