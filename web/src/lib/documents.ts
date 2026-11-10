import { strFromU8, unzipSync } from 'fflate'

// Plain-text extraction for document sources. Paragraph breaks become blank
// lines so the transcript parser can still find "Name: text" turns.

function xmlDoc(xml: string) {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

export function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })
  const xml = files['word/document.xml']
  if (!xml) throw new Error('This .docx has no document body.')
  const doc = xmlDoc(strFromU8(xml))
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const paras: string[] = []
  for (const p of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
    let line = ''
    const walk = (n: Node) => {
      for (const c of Array.from(n.childNodes)) {
        if (!(c instanceof Element)) continue
        if (c.namespaceURI === W && c.localName === 't') line += c.textContent ?? ''
        else if (c.namespaceURI === W && c.localName === 'tab') line += '\t'
        else if (c.namespaceURI === W && (c.localName === 'br' || c.localName === 'cr')) line += '\n'
        else if (!(c.namespaceURI === W && c.localName === 'p')) walk(c)
      }
    }
    walk(p)
    paras.push(line)
  }
  return paras.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function odtText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'content.xml' })
  const xml = files['content.xml']
  if (!xml) throw new Error('This .odt has no content.')
  const doc = xmlDoc(strFromU8(xml))
  const T = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
  const out: string[] = []
  const text = (n: Node): string => Array.from(n.childNodes).map((c) => {
    if (c.nodeType === Node.TEXT_NODE) return c.textContent ?? ''
    if (!(c instanceof Element)) return ''
    if (c.namespaceURI === T && c.localName === 's') return ' '.repeat(Number(c.getAttributeNS(T, 'c') || 1))
    if (c.namespaceURI === T && c.localName === 'tab') return '\t'
    if (c.namespaceURI === T && c.localName === 'line-break') return '\n'
    if (c.namespaceURI === T && c.localName === 'note') return ''
    return text(c)
  }).join('')
  for (const el of Array.from(doc.getElementsByTagNameNS(T, '*'))) {
    if ((el.localName === 'p' || el.localName === 'h') && !el.closest?.('note')) out.push(text(el))
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript').forEach((n) => n.remove())
  const blocks = doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr, div:not(:has(p, div, li))')
  if (!blocks.length) return (doc.body.textContent ?? '').trim()
  return Array.from(blocks).map((b) => (b.textContent ?? '').replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n\n')
}

/** Best-effort RTF to text: keeps paragraphs, drops formatting groups. */
export function rtfText(rtf: string): string {
  let out = ''
  let depth = 0
  const skipAt: number[] = []
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i]
    if (ch === '{') { depth++; if (/^\{\\\*|^\{\\(fonttbl|colortbl|stylesheet|info|pict|header|footer)/.test(rtf.slice(i, i + 12))) skipAt.push(depth); continue }
    if (ch === '}') { if (skipAt[skipAt.length - 1] === depth) skipAt.pop(); depth--; continue }
    if (skipAt.length) continue
    if (ch === '\\') {
      const m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\(.)/i.exec(rtf.slice(i))
      if (!m) continue
      i += m[0].length - 1
      if (m[3]) out += String.fromCharCode(parseInt(m[3], 16))
      else if (m[4]) out += m[4] === '~' ? ' ' : m[4] === '-' ? '' : m[4]
      else if (m[1] === 'par' || m[1] === 'line') out += '\n'
      else if (m[1] === 'tab') out += '\t'
      else if (m[1] === 'u' && m[2]) { out += String.fromCharCode(Number(m[2]) < 0 ? Number(m[2]) + 65536 : Number(m[2])); if (rtf[i + 1] === '?') i++ }
      continue
    }
    if (ch === '\r' || ch === '\n') continue
    out += ch
  }
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** Text layer of a PDF, one paragraph per text line group. Scanned PDFs have no text layer. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let line = ''
    const lines: string[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      if (item.hasEOL) { lines.push(line); line = '' }
    }
    if (line) lines.push(line)
    pages.push(lines.join('\n'))
  }
  const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!text) throw new Error('This PDF has no text layer (it may be a scan). Run OCR on it first, then import the text.')
  return text
}
