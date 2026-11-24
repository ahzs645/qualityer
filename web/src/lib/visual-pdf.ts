import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { Project } from './types'
import { download } from './model'
import { forExport } from './names'
import { ALL, type Scope } from './scope'
import { DEFAULT_VISUAL, visualBrief, type Block, type VisualOptions } from './visual-report'

// The visual brief as a PDF: the same blocks as the HTML, with the charts
// drawn from their SVG. Loaded only when someone downloads one.

const ACCENT = '#1f6f6b', MUTED = '#5d6662'
const PAGE_W = 595.28 - 2 * 44

export function visualPdfDefinition(project: Project, opts: VisualOptions = DEFAULT_VISUAL, scope: Scope = ALL, generatedAt = new Date()): TDocumentDefinitions {
  const v = visualBrief(project, opts, scope, generatedAt)
  const t = (s: string) => forExport(project, s ?? '')
  const svg = (s: string) => forExport(project, s, { html: true })
  const fit = (w: number, max = PAGE_W) => Math.min(max, w * 0.66)
  const content: Content[] = [
    { text: t(v.title), style: 'title' },
    ...(v.subtitle ? [{ text: t(v.subtitle), style: 'lede' } as Content] : []),
    { text: t(v.meta), style: 'note' },
    ...(v.anonymised ? [{ text: 'Names are anonymised: masked names are replaced by stand-ins such as [R01] or [Person 1].', style: 'note' } as Content] : []),
    { text: t(v.status), fontSize: 8.5, color: project.signoff ? '#1f5c2d' : '#6b4700', margin: [0, 2, 0, 6] },
  ]
  const block = (b: Block): Content[] => {
    switch (b.t) {
      case 'p': return [{ text: t(b.text), style: b.tone === 'note' ? 'note' : 'body' }]
      case 'list': return [{ ul: b.items.map(t), style: 'body', margin: [0, 0, 0, 6] }]
      case 'tiles': return [{ columns: b.tiles.map(([val, l]) => ({ stack: [{ text: val, fontSize: 15, bold: true }, { text: l, style: 'note' }] })), columnGap: 8, margin: [0, 4, 0, 8] }]
      case 'svg': return [{ svg: svg(b.svg), width: fit(b.w), margin: [0, 2, 0, 10] }]
      case 'svgs': {
        const rows: Content[] = []
        for (let i = 0; i < b.charts.length; i += 2) {
          rows.push({ columns: b.charts.slice(i, i + 2).map((c) => ({ svg: svg(c.svg), width: (PAGE_W - 14) / 2 })), columnGap: 14, margin: [0, 2, 0, 8], unbreakable: true })
        }
        return rows
      }
      case 'cards': return b.cards.map((c) => ({
        stack: [
          { text: [{ text: t(c.title), bold: true, fontSize: 10.5 }, ...(c.tag ? [{ text: `   ${t(c.tag)}`, color: ACCENT, fontSize: 9 }] : [])] },
          ...(c.lead ? [{ text: t(c.lead), style: 'body' } as Content] : []),
          ...c.parts.flatMap((p): Content[] => [
            ...(p.heading ? [{ text: t(p.heading).toUpperCase(), fontSize: 7, bold: true, color: MUTED, margin: [0, 3, 0, 1] } as Content] : []),
            p.items.length > 1 || p.heading ? { ul: p.items.map(t), style: 'body' } : { text: t(p.items[0] ?? ''), style: 'body' },
          ]),
        ],
        margin: [0, 0, 0, 8], unbreakable: true,
      }))
      case 'quotes': return b.quotes.map((q) => ({
        stack: [
          { text: t(q.title), bold: true, fontSize: 8.5, color: MUTED },
          ...(q.summary ? [{ text: t(q.summary), style: 'body' } as Content] : []),
          { text: `“${t(q.text)}”`, italics: true, margin: [0, 1, 0, 1] },
          { text: t(q.cite), style: 'note' },
        ],
        margin: [0, 0, 0, 6], unbreakable: true,
      }))
    }
  }
  v.sections.forEach((s) => {
    content.push({ text: t(s.title), style: 'h2', headlineLevel: 1 })
    for (const b of s.blocks) content.push(...block(b))
  })
  return {
    info: { title: t(v.title), subject: 'Visual brief' },
    pageSize: 'A4',
    pageMargins: [44, 50, 44, 50],
    // A section heading never ends a page on its own.
    pageBreakBefore: (node, q) => node.headlineLevel === 1 && q.getFollowingNodesOnPage().length === 0,
    header: (page: number) => (page > 1 ? { text: t(v.title), style: 'running', margin: [44, 22, 44, 0] } : undefined) as Content,
    footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: 'right', style: 'running', margin: [44, 14, 44, 0] }),
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.25, color: '#1d2221' },
    styles: {
      title: { fontSize: 19, bold: true, margin: [0, 0, 0, 5] },
      lede: { fontSize: 11, margin: [0, 0, 0, 5] },
      h2: { fontSize: 13, bold: true, color: ACCENT, margin: [0, 12, 0, 4] },
      body: { margin: [0, 0, 0, 3] },
      note: { fontSize: 8, color: MUTED, margin: [0, 0, 0, 4] },
      running: { fontSize: 7.5, color: MUTED },
    },
  }
}

export async function visualPdfBlob(project: Project, opts: VisualOptions, scope: Scope): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  ;(pdfMake as unknown as { addVirtualFileSystem: (v: unknown) => void }).addVirtualFileSystem(vfs)
  return pdfMake.createPdf(visualPdfDefinition(project, opts, scope)).getBlob()
}

export async function downloadVisualPdf(project: Project, opts: VisualOptions, scope: Scope, filename: string) {
  download(filename, await visualPdfBlob(project, opts, scope), 'application/pdf')
}
