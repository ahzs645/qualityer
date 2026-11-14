import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { Download, FileText, Printer } from 'lucide-react'
import { useProject } from '../lib/store'
import { download, slug } from '../lib/model'
import { RECIPES, REPORT_SECTIONS, claimsCSV, editedSinceSignOff, recipeOptions, reportHTML, reportMarkdown, signOffBlockers, type Recipe, type ReportOptions } from '../lib/report'
import { decisionLogCSV } from '../features/review/DecisionLog'
import { setAnonymise, signOff, withdrawSignOff } from '../lib/actions'
import type { Project, SignOff } from '../lib/types'
import { Button, Input, PageHeader, Panel, Select, Textarea, cx } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/report')({ component: Report })

function Report() {
  const project = useProject()
  const [opts, setOpts] = useState<ReportOptions>(() => recipeOptions('standard'))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const html = useMemo(() => reportHTML(project, opts), [project, opts])
  const base = `${slug(project.name)}-${opts.recipe === 'standard' ? 'report' : opts.recipe}`
  const answered = project.asks.filter((a) => project.askAnswers.some((x) => x.promptId === a.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const masked = project.names.filter((n) => n.mask).length

  const pdf = async () => {
    setBusy('Building the PDF…')
    setError(null)
    try { await (await import('../lib/report-pdf')).downloadReportPdf(project, opts, `${base}.pdf`) }
    catch (e) { setError(`The PDF could not be built: ${e instanceof Error ? e.message : String(e)}`) }
    finally { setBusy(null) }
  }

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6">
      <PageHeader
        title="Report"
        actions={<>
          <Button icon={<Printer size={15} />} onClick={() => frame.current?.contentWindow?.print()}>Print</Button>
          <Button icon={<FileText size={15} />} disabled={!!busy} onClick={pdf}>{busy ?? 'Download PDF'}</Button>
          <Button variant="primary" icon={<Download size={15} />} onClick={() => download(`${base}.html`, html, 'text/html')}>Download HTML</Button>
        </>}
      />
      {error && <p role="alert" className="mb-4 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-4">
          <SignOffPanel project={project} />
          <Panel title="Recipe" bodyClass="space-y-1.5 p-2">
            {(Object.keys(RECIPES) as Recipe[]).map((r) => (
              <button key={r} type="button" aria-pressed={opts.recipe === r} onClick={() => setOpts(recipeOptions(r, opts.askId))}
                className={cx('block w-full rounded-md border px-3 py-2 text-left', opts.recipe === r ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-sunken')}>
                <span className="text-sm font-semibold">{RECIPES[r].label}</span>
                <span className="mt-0.5 block text-xs text-muted">{RECIPES[r].description}</span>
              </button>
            ))}
          </Panel>
          <Panel title="Options" bodyClass="space-y-3 p-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={project.anonymise} disabled={!masked} onChange={(e) => setAnonymise(e.target.checked)} />
              <span>Anonymise names <span className="block text-xs text-muted">{masked ? `${masked} names masked in every format.` : 'No masked names yet.'} <Link to="/p/$projectId/review" params={{ projectId: project.id }} search={{ tab: 'names' }} className="text-accent hover:underline">Names</Link></span></span>
            </label>
            {opts.perspectives && (
              <label className="block">
                <span className="text-xs font-medium text-muted">Participant perspectives from</span>
                {answered.length ? (
                  <Select value={opts.askId ?? ''} onChange={(e) => setOpts({ ...opts, askId: e.target.value || null })} className="mt-1 h-8 w-full text-xs" aria-label="Question for participant perspectives">
                    <option value="">Latest answered question</option>
                    {answered.map((a) => <option key={a.id} value={a.id}>{a.title} · v{a.version}</option>)}
                  </Select>
                ) : <span className="mt-1 block text-xs text-muted">No answers yet. <Link to="/p/$projectId/ask" params={{ projectId: project.id }} className="text-accent hover:underline">Ask across interviews</Link></span>}
              </label>
            )}
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.tabs} onChange={(e) => setOpts({ ...opts, tabs: e.target.checked })} /> Sections as tabs (HTML)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.bars} onChange={(e) => setOpts({ ...opts, bars: e.target.checked })} /> Grade and stance bars</label>
            <label className="flex items-center gap-2">Quotes per framework cell
              <Select value={String(Math.min(opts.quotesPerCell, 99))} onChange={(e) => setOpts({ ...opts, quotesPerCell: Number(e.target.value) })} className="h-7 text-xs" aria-label="Quotes per framework cell">
                {[0, 1, 2, 3, 99].map((n) => <option key={n} value={n}>{n === 99 ? 'all' : n}</option>)}
              </Select>
            </label>
          </Panel>
          <Panel title="Sections" bodyClass="p-3">
            <ul className="space-y-1.5">
              {REPORT_SECTIONS.map(([id, label]) => (
                <li key={id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opts[id]} onChange={(e) => setOpts({ ...opts, [id]: e.target.checked })} />{label}</label></li>
              ))}
            </ul>
          </Panel>
          <Panel title="Other formats">
            <div className="flex flex-col items-start gap-2">
              <Button size="sm" icon={<Download size={13} />} onClick={() => download(`${base}.md`, reportMarkdown(project, opts), 'text/markdown')}>Markdown</Button>
              <Button size="sm" icon={<Download size={13} />} onClick={() => download(`${slug(project.name)}-claims.csv`, claimsCSV(project), 'text/csv')}>Claims table (CSV)</Button>
              <Button size="sm" icon={<Download size={13} />} disabled={!project.reviewLog.length} onClick={() => download(`${slug(project.name)}-review-decisions.csv`, decisionLogCSV(project), 'text/csv')}>Review decisions (CSV)</Button>
            </div>
          </Panel>
        </aside>
        <iframe ref={frame} title="Report preview" srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-[calc(100vh-11rem)] w-full rounded-lg border border-line bg-white" />
      </div>
    </div>
  )
}

/** Signing the analysis off as final, as a person or as an AI standing in for one. Reports say which. */
function SignOffPanel({ project }: { project: Project }) {
  const blockers = useMemo(() => (project.signoff ? [] : signOffBlockers(project)), [project])
  const [by, setBy] = useState(project.coder)
  const [role, setRole] = useState<SignOff['role']>(/\b(ai|claude|assistant|model|acting)\b/i.test(project.coder) ? 'ai' : 'person')
  const [note, setNote] = useState('')
  const so = project.signoff
  if (so) {
    return (
      <Panel title="Sign-off" bodyClass="space-y-2 p-3 text-sm">
        <p className="rounded-md bg-good-soft px-3 py-2 text-good">
          Final. Signed off by <b>{so.by}</b>{so.role === 'ai' ? ', an AI acting as the human reviewer' : ''} on {new Date(so.at).toLocaleDateString()}.
        </p>
        {so.note && <p className="text-xs text-muted">{so.note}</p>}
        {editedSinceSignOff(project) && <p className="text-xs text-warn">The study has been edited since. Reports say so; withdraw and sign off again if the changes are part of the final analysis.</p>}
        <Button size="sm" variant="ghost" onClick={() => confirm('Withdraw the sign-off? Reports will read as a working draft again.') && withdrawSignOff()}>Withdraw sign-off</Button>
      </Panel>
    )
  }
  return (
    <Panel title="Sign-off" bodyClass="space-y-2.5 p-3 text-sm">
      {blockers.length ? (
        <>
          <p className="text-xs text-muted">Settle these first:</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-bad">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </>
      ) : <p className="text-xs text-good">Nothing blocks sign-off. What no reviewer can settle here (recordings not listened to, questions not asked) is listed as limitations.</p>}
      <Input value={by} onChange={(e) => setBy(e.target.value)} aria-label="Signed off by" className="h-8" />
      <div className="grid grid-cols-2 gap-0.5 rounded-md bg-sunken p-0.5 text-xs" role="radiogroup" aria-label="Who is signing">
        {([['person', 'A person'], ['ai', 'An AI acting as reviewer']] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={role === v} onClick={() => setRole(v)} className={cx('rounded px-2 py-1', role === v ? 'bg-surface font-medium shadow-sm' : 'text-muted')}>{l}</button>
        ))}
      </div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What was checked, and on what basis" aria-label="Sign-off note" className="text-xs" />
      <Button size="sm" variant="primary" disabled={blockers.length > 0 || !by.trim()} onClick={() => signOff({ by: by.trim(), role, note: note.trim() })}>Sign off as final</Button>
      {role === 'ai' && <p className="text-[11px] text-muted">Reports will say that an AI signed off, standing in for the human reviewer.</p>}
    </Panel>
  )
}
