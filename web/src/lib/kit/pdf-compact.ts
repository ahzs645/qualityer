import { unzlibSync, zlibSync } from 'fflate'

// document-kit's PDF writer stores each page's drawing instructions uncompressed (its fonts and pictures are
// compressed), so a long report's PDF is mostly plain text it could deflate to a fifth. Until the kit compresses
// them itself, this rewrites its output with those streams deflated and a fresh cross-reference table. It only
// touches files shaped as the kit writes them — one revision, a classic xref table, direct lengths, no encryption —
// and returns anything else unchanged. It also stores an RGB picture of at most 256 colours (every chart, drawn as
// a palette PNG and expanded to RGB by the kit) with a palette, which is lossless and about a third of the size.

const latin1 = new TextDecoder('latin1')
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

interface Obj { num: number; bytes: Uint8Array }

/** The PDF with its uncompressed streams deflated, or the same bytes when it cannot be done safely. */
export function compactPdf(pdf: Uint8Array): Uint8Array {
  try {
    return compact(pdf) ?? pdf
  } catch {
    return pdf
  }
}

function compact(pdf: Uint8Array): Uint8Array | null {
  const text = latin1.decode(pdf)
  if (!text.startsWith('%PDF-')) return null
  const xrefAt = text.lastIndexOf('\nxref')
  const trailerAt = text.lastIndexOf('trailer')
  const startxref = text.lastIndexOf('startxref')
  if (xrefAt < 0 || trailerAt < xrefAt || startxref < trailerAt) return null
  if ((text.match(/startxref/g) ?? []).length !== 1) return null // an incremental update: leave it alone
  const trailer = text.slice(trailerAt, startxref)
  if (/\/(Prev|Encrypt|XRefStm)\b/.test(trailer)) return null
  const size = Number(/\/Size (\d+)/.exec(trailer)?.[1])
  if (!Number.isInteger(size)) return null

  const objects: Obj[] = []
  const seen = new Set<number>()
  const header = /\r?\n(?=\d+ 0 obj\b)/.exec(text)
  if (!header) return null
  const re = /(?:^|\n)(\d+) 0 obj\b/g
  re.lastIndex = header.index
  let changed = false
  for (let m = re.exec(text); m && m.index < xrefAt; m = re.exec(text)) {
    const num = Number(m[1])
    if (seen.has(num) || num >= size) return null
    seen.add(num)
    const start = m.index + (m[0].startsWith('\n') ? 1 : 0)
    const streamKw = /\bstream\r?\n|endobj/g
    streamKw.lastIndex = start
    const kw = streamKw.exec(text)
    if (!kw) return null
    if (kw[0] === 'endobj') {
      const end = kw.index + 6
      objects.push({ num, bytes: pdf.subarray(start, end) })
      re.lastIndex = end
      continue
    }
    const dict = text.slice(start, kw.index)
    const length = /\/Length (\d+)(?!\s+\d+\s+R)/.exec(dict)
    if (!length) return null // an indirect length
    const dataStart = kw.index + kw[0].length
    const dataEnd = dataStart + Number(length[1])
    const after = /^\r?\n?endstream\s*endobj/.exec(text.slice(dataEnd, dataEnd + 40))
    if (!after) return null
    const end = dataEnd + after[0].length
    re.lastIndex = end
    const data = pdf.subarray(dataStart, dataEnd)
    const indexed = paletteImage(dict, data)
    if (indexed) {
      changed = true
      objects.push({ num, bytes: join([ascii(indexed.dict), ascii('stream\n'), indexed.data, ascii('\nendstream\nendobj')]) })
      continue
    }
    if (/\/Filter\b/.test(dict) || data.length < 256) {
      objects.push({ num, bytes: pdf.subarray(start, end) })
      continue
    }
    const packed = zlibSync(data, { level: 9 })
    if (packed.length >= data.length) {
      objects.push({ num, bytes: pdf.subarray(start, end) })
      continue
    }
    changed = true
    const close = dict.lastIndexOf('>>')
    const head = dict.slice(0, close).replace(/\/Length \d+/, `/Length ${packed.length}`) + ' /Filter /FlateDecode' + dict.slice(close)
    objects.push({ num, bytes: join([ascii(head), ascii('stream\n'), packed, ascii('\nendstream\nendobj')]) })
  }
  if (!changed) return null

  // Write the objects back with a cross-reference table for the new offsets.
  const parts: Uint8Array[] = [pdf.subarray(0, header.index + 1)]
  let at = parts[0].length
  const offsets = new Map<number, number>()
  for (const o of objects) {
    offsets.set(o.num, at)
    parts.push(o.bytes, ascii('\n'))
    at += o.bytes.length + 1
  }
  const rows = ['xref', `0 ${size}`, '0000000000 65535 f ']
  for (let n = 1; n < size; n++) {
    const off = offsets.get(n)
    rows.push(off === undefined ? '0000000000 65535 f ' : `${String(off).padStart(10, '0')} 00000 n `)
  }
  parts.push(ascii(`${rows.join('\n')}\n${trailer.trimEnd()}\nstartxref\n${at}\n%%EOF\n`))
  return join(parts)
}

/** A flate RGB image of at most 256 colours, as the same image with a palette; null for anything else. */
function paletteImage(dict: string, data: Uint8Array): { dict: string; data: Uint8Array } | null {
  if (!/\/Subtype \/Image\b/.test(dict) || !/\/ColorSpace \/DeviceRGB\b/.test(dict) || !/\/BitsPerComponent 8\b/.test(dict)) return null
  if (!/\/Filter \/FlateDecode\b/.test(dict) || /\/(DecodeParms|SMask|Mask|Decode|ImageMask)\b/.test(dict)) return null
  const width = Number(/\/Width (\d+)/.exec(dict)?.[1])
  const height = Number(/\/Height (\d+)/.exec(dict)?.[1])
  const rgb = unzlibSync(data)
  if (!width || !height || rgb.length !== width * height * 3) return null
  const index = new Map<number, number>()
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    const c = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2]
    let at = index.get(c)
    if (at === undefined) {
      if (index.size === 256) return null
      at = index.size
      index.set(c, at)
    }
    pixels[i] = at
  }
  const hex = [...index.keys()].map((c) => c.toString(16).padStart(6, '0')).join('')
  const packed = zlibSync(pixels, { level: 9 })
  if (packed.length >= data.length) return null
  const out = dict
    .replace('/ColorSpace /DeviceRGB', `/ColorSpace [/Indexed /DeviceRGB ${index.size - 1} <${hex}>]`)
    .replace(/\/Length \d+/, `/Length ${packed.length}`)
  return { dict: out, data: packed }
}

function join(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
