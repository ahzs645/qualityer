import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import type { Project } from './types'
import { codesInGroup, download, formatTime } from './model'
import { forExport } from './names'
import { cellKey } from './profile'
import { turnsOf } from './ai/pipeline'
import { RECIPES, firstSentences, perspectives, reportData, type ReportOptions } from './report'

// The report as a PDF document, from the same data and recipe as the HTML.
// Built with pdfmake, loaded only when someone downloads a PDF.

const ACCENT = '#1f6f6b'
const MUTED = '#5d6662'
const LINE = '#dedcd4'
const COVERAGE: Record<string, string> = { unmarked: '—', answered: 'Answered', partial: 'Partly', 'no-view': 'Asked, no view', 'not-asked': 'Not asked' }
const tidy = (name: string) => name.replace(/\s{2,}/g, ' ').trim()
const shortName = (name: string) => name.trim().split(/\s{2,}/)[0]
const pc = (v: number) => `${Math.round(v * 100)}%`

export function reportPdfDefinition(project: Project, opts: ReportOptions, generatedAt = new Date()): TDocumentDefinitions {
  const d = reportData(project)
  const t = (s: string) => forExport(project, s ?? '')
  const content: Content[] = []
  const h2 = (text: string) => content.push({ text, style: 'h2', pageBreak: content.length > 6 && opts.recipe !== 'summary' ? 'before' : undefined })
  const h3 = (text: string) => content.push({ text: t(text), style: 'h3' })
  const note = (text: string) => content.push({ text: t(text), style: 'note' })
  const table = (header: string[], rows: (string | number)[][], widths?: (string | number)[]) => content.push({
    table: { headerRows: 1, widths: widths ?? header.map((_, i) => (i === 0 ? '*' : 'auto')), body: [header.map((x) => ({ text: x, style: 'th' })), ...rows.map((r) => r.map((c) => ({ text: t(String(c)), style: 'td' }) as TableCell))] },
    layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 3, paddingBottom: () => 3 },
    margin: [0, 2, 0, 8],
  })
  /** An answer or summary: paragraphs, bullet lists, turn ids turned into times. */
  const prose = (text: string, times?: Map<string, number | null>) => {
    const clean = (s: string) => t(s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[(T\d{4})(?:[,–-]\s*T?\d{4})*\]/g, (_, id) => { const tm = times?.get(id); return tm != null ? `(${formatTime(tm)})` : '' }))
    let list: string[] = []
    const flush = () => { if (list.length) content.push({ ul: list.map(clean), margin: [0, 0, 0, 4], style: 'body' }); list = [] }
    for (const line of text.split('\n')) {
      const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
      if (m) { list.push(m[1]); continue }
      flush()
      if (line.trim()) content.push({ text: clean(line.trim()), style: 'body' })
    }
    flush()
  }
  const quote = (text: string, cite: string) => content.push({ columns: [{ width: 2, canvas: [{ type: 'rect', x: 0, y: 0, w: 2, h: 12, color: LINE }] }, { width: '*', text: [{ text: `“${t(text)}”`, italics: true }, { text: cite ? `  ${cite}` : '', style: 'cite' }] }], columnGap: 8, margin: [0, 2, 0, 4], style: 'body' })

  // Title block
  content.push({ text: t(project.name), style: 'title' })
  if (project.question) content.push({ text: t(project.question), style: 'lede' })
  content.push({ text: `${opts.recipe === 'summary' ? 'Summary' : RECIPES[opts.recipe].label + ' report'} · generated ${generatedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · reviewer ${t(project.coder)}`, style: 'note' })
  if (project.anonymise && project.names.some((n) => n.mask)) note('Names are anonymised: people and other masked names are replaced by stand-ins such as [R01] or [Person 1].')
  if (project.method && opts.recipe !== 'summary') note(project.method)

  if (opts.glance) {
    const tiles: [string | number, string][] = [[project.sources.length, 'interviews'], [d.codedClaims, 'coded claims'], [`${d.usedCodes} of ${project.codes.length}`, 'codes used'], [d.aiClaims ? pc(d.aiChecked / d.aiClaims) : '—', 'AI-drafted claims checked'], [d.violations.length, 'rule issues open']]
    content.push({ columns: tiles.map(([v, l]) => ({ stack: [{ text: String(v), fontSize: 16, bold: true }, { text: l, style: 'note' }] })), columnGap: 10, margin: [0, 10, 0, 6] })
  }

  if (opts.sources) {
    h2('Interviews')
    table(['Interview', 'Length', 'Words', 'Coded claims', 'AI-drafted', 'Checked', 'Not asked'], d.sourceRows.map((r) => [r.source.name, formatTime(r.duration), r.words.toLocaleString(), r.claims, r.aiDrafted, r.aiDrafted ? `${r.checked} (${pc(r.checked / r.aiDrafted)})` : 'all', r.notAsked.join(', ') || '—']))
  }
  if (opts.coverage && d.coverage.length) {
    if (!opts.sources) h2('Interviews')
    h3('Interview guide coverage')
    table(['Question', ...project.sources.map((s) => s.name.split(' — ')[0])], d.coverage.map((row) => [`${row.question.key} ${row.question.title}`, ...row.marks.map((m) => COVERAGE[m.status])]))
  }

  const persp = opts.perspectives ? perspectives(project, opts.askId) : null
  if (persp && persp.rows.length) {
    h2('Participant perspectives')
    note(`The same question was put to each interview separately: ${opts.recipe === 'summary' ? `${persp.prompt.title}.` : `“${persp.prompt.text}”`} Answers drafted by ${persp.models.join(', ')} from each full transcript; every quote was checked against the transcript.`)
    for (const r of persp.rows) {
      const name = project.cases.find((k) => k.sourceIds.includes(r.source.id))?.name ?? r.source.name.split(' — ')[0]
      content.push({ text: [{ text: t(name) }, r.label ? { text: `   ${t(r.label)}`, color: ACCENT, fontSize: 10 } : ''], style: 'h3' })
      prose(r.label ? r.answer.text.replace(/^\s*(?:\*\*)?overall(?: stance)?:?(?:\*\*)?\s*[^.\n]+?(?:\.|\n|$)\s*/i, '') : r.answer.text, new Map(turnsOf(r.source).map((x) => [x.id, x.time])))
    }
  }

  if (opts.framework && d.framework.length) {
    const brief = opts.recipe === 'summary'
    h2(brief ? 'Findings by theme' : 'Framework matrix')
    for (const th of d.framework) {
      h3(th.theme.title)
      if (th.theme.interpretation) prose(th.theme.interpretation)
      for (const c of th.cells) {
        const summary = brief ? firstSentences(c.summary, 2) : c.summary
        content.push({ text: [{ text: `${t(c.case.name)}  `, bold: true }, { text: summary ? t(summary.replace(/\s*\(Drafted by[^)]*\)\s*$/i, '')) : 'No summary written.', color: summary ? undefined : MUTED }], style: 'body', margin: [0, 3, 0, 2] })
        for (const q of c.quotes.slice(0, opts.quotesPerCell)) quote(q.text, brief ? q.time : [q.time, q.code].filter(Boolean).join(' · '))
      }
    }
  }

  if (opts.profile && d.profile.rows.length) {
    h2('Cases by domain')
    note('Coded claims per domain, with the evidence grades and stances they carry. Counts describe the coding, not how common a view is.')
    const mix = (c: ReturnType<typeof d.profile.cells.get>) => !c?.claims.length ? '—' : `${c.claims.length}\n` + c.mixes.map((m) => m.parts.filter((p) => p.n).map((p) => `${shortName(p.code.name)} ${p.n}`).join(' · ')).join('\n')
    table(['Domain', ...project.cases.map((k) => k.name)], [
      ['All domains', ...project.cases.map((k) => mix(d.profile.totals.get(k.id)))],
      ...d.profile.rows.map((g) => [g.name, ...project.cases.map((k) => mix(d.profile.cells.get(cellKey(k.id, g.id))))]),
    ], [110, ...project.cases.map(() => '*')])
  }
  if (opts.codes && d.codeCounts.length) {
    h2('Code counts')
    table(['Code', ...project.cases.map((k) => k.name)], d.codeCounts.flatMap((g) => [[g.group.name.toUpperCase(), ...project.cases.map(() => '')], ...g.rows.map((r) => [tidy(r.code.name), ...r.counts.map((n) => (n ? String(n) : ''))])]))
  }
  if (opts.figures && d.figures.length) {
    h2('Flagged figures')
    table(['Flag', 'Source', ...project.extractionFields, 'Passage'], d.figures.map((f) => [f.code, `${f.source} ${f.time}`, ...f.values.map((v) => v || 'missing'), `“${f.quote}”`]), ['auto', 'auto', ...project.extractionFields.map(() => '*'), '*'])
  }
  if (opts.ai && (project.aiRuns.length || d.reviews.length)) {
    h2('AI assistance and review')
    table(['Pass', 'Source', 'Model', 'Suggestions'], project.aiRuns.map((r) => [new Date(r.startedAt).toISOString().slice(0, 16).replace('T', ' '), r.sourceIds.map((id) => d.sources.get(id)?.name.split(' — ')[0] ?? '?').join(', '), r.model, r.suggestions]))
    for (const c of d.calibrations) {
      const sub = c.result.byKind.substantive
      h3(`${c.run.kind === 'grades' ? 'Grade pass' : 'Calibration'} on ${c.source.name.split(' — ')[0]}`)
      content.push({ text: t(`${c.run.kind === 'grades' ? '' : `Substantive codes: recall ${sub?.recall != null ? pc(sub.recall) : '—'} of ${sub?.ref ?? 0} human codings, precision ${sub?.precision != null ? pc(sub.precision) : '—'} of ${sub?.other ?? 0} AI codings. `}${c.result.confusions.map((m) => `${d.groups.get(m.groupId)?.name}: same value on ${m.agree} of ${m.compared} passages both graded`).join('. ')}.`), style: 'body' })
    }
    for (const r of d.reviews) {
      const s = r.summary
      h3(`Review of ${r.source.name.split(' — ')[0]}`)
      content.push({ text: t(`${r.reviewers.join(', ')} decided ${s.total} AI codings: ${s.kept} kept as proposed (${s.total ? pc(s.kept / s.total) : '—'}), ${s.recoded} given a different code, ${s.rejected} rejected; ${s.added} added by the reviewer.`), style: 'body' })
    }
  }
  if (opts.open) {
    const items: string[] = []
    if (d.pending.length) items.push(`${d.pending.length} AI suggestions have not been decided.`)
    for (const r of d.sourceRows) if (r.unchecked) items.push(`${r.source.name.split(' — ')[0]}: ${r.unchecked} AI-drafted claims accepted but not checked by ${project.coder}.`)
    if (d.violations.length) items.push(`${d.violations.length} codebook rule issues.`)
    for (const r of d.sourceRows) if (r.notAsked.length) items.push(`${r.source.name.split(' — ')[0]} was not asked ${r.notAsked.join(', ')}; absence of codes there is not absence of a view.`)
    if (d.corrections) items.push(`${d.corrections} glossary corrections waiting to be applied.`)
    if (d.uncertain) items.push(`${d.uncertain} low-confidence transcript words unchecked.`)
    if (project.restricted.length) items.push(`${project.restricted.length} off-the-record passage(s): wording withheld.`)
    const open = project.candidates.filter((c) => c.status === 'open')
    if (open.length) items.push(`${open.length} candidate code(s) await a decision: ${open.map((c) => c.name).join('; ')}.`)
    h2('Open items')
    content.push(items.length ? { ul: items.map(t), style: 'body' } : { text: 'Nothing outstanding.', style: 'body' })
  }
  if (opts.memos && project.memos.length) {
    h2('Memos and journal')
    for (const m of project.memos) { h3(m.title); content.push({ text: t(m.body), style: 'memo' }) }
  }
  if (opts.codebook && project.codes.length) {
    h2('Codebook')
    for (const g of project.groups) {
      h3(g.name)
      table(['Code', 'Definition', 'Include', 'Exclude'], codesInGroup(project, g.id).map((c) => [tidy(c.name), c.definition, c.include, c.exclude]), [90, '*', '*', '*'])
    }
  }

  return {
    info: { title: t(project.name), subject: 'Qualitative analysis report' },
    pageSize: 'A4',
    pageMargins: [48, 56, 48, 56],
    header: (page: number) => (page > 1 ? { text: t(project.name), style: 'running', margin: [48, 24, 48, 0] } : undefined) as Content,
    footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: 'right', style: 'running', margin: [48, 16, 48, 0] }),
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.25, color: '#1d2221' },
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 6] },
      lede: { fontSize: 11.5, margin: [0, 0, 0, 6] },
      h2: { fontSize: 14, bold: true, color: ACCENT, margin: [0, 16, 0, 6] },
      h3: { fontSize: 11, bold: true, margin: [0, 10, 0, 3] },
      body: { margin: [0, 0, 0, 4] },
      note: { fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 6] },
      cite: { fontSize: 8, color: MUTED, italics: false },
      th: { bold: true, fontSize: 8, color: MUTED },
      td: { fontSize: 8.5 },
      memo: { fontSize: 8.5, margin: [0, 0, 0, 8] },
      running: { fontSize: 7.5, color: MUTED },
    },
  }
}

export async function downloadReportPdf(project: Project, opts: ReportOptions, filename: string) {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  ;(pdfMake as unknown as { addVirtualFileSystem: (v: unknown) => void }).addVirtualFileSystem(vfs)
  // Build a blob and save it like every other export; pdfmake's own download() did not start one.
  const blob = await pdfMake.createPdf(reportPdfDefinition(project, opts)).getBlob()
  download(filename, blob, 'application/pdf')
}
