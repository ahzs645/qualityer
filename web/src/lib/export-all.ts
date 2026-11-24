import { strToU8, zipSync, type Zippable } from 'fflate'
import type { Project } from './types'
import { slug } from './model'
import { peopleOf } from './positions'
import { ALL, scopeProject, scopeSlug, type Scope } from './scope'
import { claimsCSV, reportMarkdown, reportHTML, type ReportOptions } from './report'
import { visualReportHTML, type VisualOptions } from './visual-report'
import { visualPdfBlob } from './visual-pdf'
import { reportPdfBlob } from './report-pdf'

// Every export at once: all interviews together, then one set per
// participant, in one zip. The visual brief comes as HTML and PDF; the written
// report as HTML, PDF and Markdown, with that scope's claims table.

export type ExportFormat = 'visual' | 'written'

export async function exportAllZip(
  project: Project, format: ExportFormat, visual: VisualOptions, written: ReportOptions,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<Uint8Array> {
  const scopes: Scope[] = [ALL, ...peopleOf(project).map((p): Scope => ({ kind: 'person', personId: p.id }))]
  const files: Zippable = {}
  const base = slug(project.name)
  const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer())
  for (const [i, scope] of scopes.entries()) {
    onProgress(i, scopes.length)
    const folder = i === 0 ? '0-all-interviews' : `${i}-${scopeSlug(project, scope)}`
    const name = `${base}-${scopeSlug(project, scope)}`
    if (format === 'visual') {
      files[`${folder}/${name}-visual.html`] = strToU8(visualReportHTML(project, visual, scope))
      files[`${folder}/${name}-visual.pdf`] = await bytes(await visualPdfBlob(project, visual, scope))
    } else {
      const scoped = scopeProject(project, scope)
      const kind = written.recipe === 'standard' ? 'report' : written.recipe
      files[`${folder}/${name}-${kind}.html`] = strToU8(reportHTML(scoped, written))
      files[`${folder}/${name}-${kind}.md`] = strToU8(reportMarkdown(scoped, written))
      files[`${folder}/${name}-${kind}.pdf`] = await bytes(await reportPdfBlob(scoped, written))
      files[`${folder}/${name}-claims.csv`] = strToU8(claimsCSV(scoped))
    }
  }
  onProgress(scopes.length, scopes.length)
  const anon = project.anonymise && project.names.some((n) => n.mask)
  files['README.txt'] = strToU8([
    project.name,
    '',
    `${format === 'visual' ? 'Visual briefs (charts first)' : 'Written reports'}, generated ${new Date().toISOString().slice(0, 10)}.`,
    '0-all-interviews: every interview together.',
    'Each numbered folder after it: one participant. One-participant exports leave out writing that describes the other participants (theme interpretations and study-wide memos); charts set the participant against the others without naming them.',
    anon ? 'Names are anonymised: masked names are replaced by stand-ins. Read the files before sharing them.' : 'Names are NOT anonymised. Do not share these files outside the research team.',
    'Off-the-record passages are withheld from every file.',
  ].join('\n'))
  return zipSync(files, { level: 6 })
}
