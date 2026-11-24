import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileText, Package, Printer } from 'lucide-react'
import { useProject } from '../lib/store'
import { download, slug } from '../lib/model'
import { RECIPES, REPORT_SECTIONS, claimsCSV, editedSinceSignOff, recipeOptions, reportHTML, reportMarkdown, signOffBlockers, type Recipe, type ReportOptions } from '../lib/report'
import { decisionLogCSV } from '../features/review/DecisionLog'
import { DEFAULT_VISUAL, VISUAL_SECTIONS, visualReportHTML, type VisualOptions } from '../lib/visual-report'
import { ALL, scopeProject, scopeSlug, type Scope } from '../lib/scope'
import { peopleOf } from '../lib/positions'
import { setAnonymise, signOff, withdrawSignOff } from '../lib/actions'
import { exportNameRisks } from '../lib/names'
import type { JsonObject, RecipeToCompleteItem } from 'document-kit/recipe'
import { recipeById, recipeOptions as kitOptions } from '../lib/kit/documents'
import { Documents, PagePreview } from '../features/report/Documents'
import type { Project, SignOff } from '../lib/types'
import { Button, Input, PageHeader, Panel, Select, Textarea, cx } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/report')({ component: Report })

type Format = 'visual' | Recipe
/** The document-kit recipe that matches each on-screen format. */
const KIT_FOR: Record<Format, string> = { visual: 'rw-visual', summary: 'rw-summary', standard: 'rw-standard', full: 'rw-full' }

function Report() {
  const project = useProject()
  const [format, setFormat] = useState<Format>('visual')
  const [opts, setOpts] = useState<ReportOptions>(() => recipeOptions('standard'))
  const [visual, setVisual] = useState<VisualOptions>(DEFAULT_VISUAL)
  const [scope, setScope] = useState<Scope>(ALL)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [kitRecipe, setKitRecipe] = useState<string>(KIT_FOR.visual)
  const [view, setView] = useState<'html' | 'pages'>('html')
  const [toComplete, setToComplete] = useState<RecipeToCompleteItem[] | null>(null)
  const [pages, setPages] = useState<{ pages: string[]; glyphDefs: string | null } | null>(null)
  const [laying, setLaying] = useState(false)
  const people = useMemo(() => peopleOf(project), [project])
  // A participant who has since been removed falls back to everyone.
  const live: Scope = scope.kind === 'person' && !people.some((p) => p.id === scope.personId) ? ALL : scope
  const scoped = useMemo(() => scopeProject(project, live), [project, live])
  const isVisual = format === 'visual'
  const html = useMemo(() => (isVisual ? visualReportHTML(project, visual, live) : reportHTML(scoped, opts)), [isVisual, project, scoped, visual, opts, live])
  const who = scopeSlug(project, live)
  const base = `${slug(project.name)}-${who}-${isVisual ? 'visual' : opts.recipe === 'standard' ? 'report' : opts.recipe}`
  const answered = project.asks.filter((a) => project.askAnswers.some((x) => x.promptId === a.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const masked = project.names.filter((n) => n.mask).length
  const risks = useMemo(() => (project.anonymise && masked ? exportNameRisks(project) : null), [project, masked])

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try { await job() } catch (e) { setError(`${label.replace(/…$/, '')} failed: ${e instanceof Error ? e.message : String(e)}`) } finally { setBusy(null) }
  }
  const pdf = () => run('Building the PDF…', async () => {
    if (isVisual) await (await import('../lib/visual-pdf')).downloadVisualPdf(project, visual, live, `${base}.pdf`)
    else await (await import('../lib/report-pdf')).downloadReportPdf(scoped, opts, `${base}.pdf`)
  })
  const everything = () => run('Building the zip…', async () => {
    const { exportAllZip } = await import('../lib/export-all')
    const zip = await exportAllZip(project, isVisual ? 'visual' : 'written', visual, opts, (done, total) => setBusy(`Building ${Math.min(done + 1, total)} of ${total}…`))
    download(`${slug(project.name)}-${isVisual ? 'visual-briefs' : 'reports'}-all-and-each.zip`, zip as BlobPart, 'application/zip')
  })
  const pick = (f: Format) => { setFormat(f); setKitRecipe(KIT_FOR[f]); if (f !== 'visual') setOpts(recipeOptions(f, opts.askId)) }

  // document-kit. The section checkboxes apply to the recipe that matches the chosen format; other recipes keep their own.
  const recipeId = recipeById(project, kitRecipe) ? kitRecipe : KIT_FOR[format]
  const overlay = useMemo((): JsonObject | undefined => {
    if (recipeId !== KIT_FOR[format]) return undefined
    const base = (kitOptions(project, recipeId).show ?? {}) as Record<string, boolean>
    const boxes: Record<string, boolean> = isVisual ? visual : (Object.fromEntries(REPORT_SECTIONS.map(([id]) => [id, opts[id]])) as Record<string, boolean>)
    return { show: Object.fromEntries(Object.keys(base).map((k) => [k, k in boxes ? boxes[k] : base[k]])), ...(isVisual ? {} : { quotesPerCell: opts.quotesPerCell, bars: opts.bars }) }
  }, [project, recipeId, format, isVisual, visual, opts])
  const kit = async () => {
    const [render, browser] = await Promise.all([import('../lib/kit/render'), import('../lib/kit/browser')])
    const build = (sc: Scope) => render.buildDocument(project, recipeId, sc, { rasterize: browser.rasterize, options: overlay, askId: isVisual ? null : opts.askId })
    return { build, layOut: (docx: Uint8Array) => render.layOut(docx, browser.browserFonts(), project.name) }
  }
  const kitBase = `${slug(project.name)}-${who}-${recipeId.replace(/^rw-/, '')}`
  const word = () => run('Building the Word file…', async () => {
    const doc = await (await kit()).build(live)
    setToComplete(doc.toComplete)
    download(`${kitBase}.docx`, doc.docx as BlobPart, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  })
  const kitPdf = () => run('Laying out the PDF…', async () => {
    const k = await kit()
    const doc = await k.build(live)
    setToComplete(doc.toComplete)
    download(`${kitBase}.pdf`, (await k.layOut(doc.docx)).pdf() as BlobPart, 'application/pdf')
  })
  const kitZip = () => run('Building the zip…', async () => {
    const k = await kit()
    const { exportAllDocumentsZip } = await import('../lib/export-all')
    const zip = await exportAllDocumentsZip(project, recipeId, k.build, async (docx) => (await k.layOut(docx)).pdf(), (done, total) => setBusy(`Building ${Math.min(done + 1, total)} of ${total}…`))
    download(`${slug(project.name)}-${recipeId.replace(/^rw-/, '')}-all-and-each.zip`, zip as BlobPart, 'application/zip')
  })

  // The page preview: the same layout the PDF gets, rebuilt shortly after anything it depends on changes.
  useEffect(() => {
    if (view !== 'pages') return
    let stale = false
    setLaying(true)
    const timer = setTimeout(async () => {
      try {
        const k = await kit()
        const doc = await k.build(live)
        const laid = await k.layOut(doc.docx)
        const p = laid.pages()
        if (stale) return
        setToComplete(doc.toComplete)
        setPages({ pages: [...p.pages], glyphDefs: p.glyphDefs ?? null })
      } catch (e) { if (!stale) setError(`The pages could not be laid out: ${e instanceof Error ? e.message : String(e)}`) }
      finally { if (!stale) setLaying(false) }
    }, 400)
    return () => { stale = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, project, recipeId, overlay, live, opts.askId])

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
          <Panel title="Who it covers" bodyClass="space-y-1.5 p-2">
            <button type="button" aria-pressed={live.kind === 'all'} onClick={() => setScope(ALL)}
              className={cx('block w-full rounded-md border px-3 py-2 text-left', live.kind === 'all' ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-sunken')}>
              <span className="text-sm font-semibold">All interviews together</span>
              <span className="mt-0.5 block text-xs text-muted">{people.length} participants side by side.</span>
            </button>
            <label className={cx('block rounded-md border px-3 py-2', live.kind === 'person' ? 'border-accent bg-accent-soft' : 'border-transparent')}>
              <span className="text-sm font-semibold">One participant</span>
              <Select value={live.kind === 'person' ? live.personId : ''} onChange={(e) => setScope(e.target.value ? { kind: 'person', personId: e.target.value } : ALL)} className="mt-1 h-8 w-full text-xs" aria-label="Participant">
                <option value="">Choose…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
              <span className="mt-1 block text-xs text-muted">Their interview only. Charts set them against the others without naming anyone; writing about the other participants is left out.</span>
            </label>
          </Panel>
          <Panel title="Format" bodyClass="space-y-1.5 p-2">
            <button type="button" aria-pressed={isVisual} onClick={() => pick('visual')}
              className={cx('block w-full rounded-md border px-3 py-2 text-left', isVisual ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-sunken')}>
              <span className="text-sm font-semibold">Visual brief</span>
              <span className="mt-0.5 block text-xs text-muted">Charts first: where people stand, stance and evidence by theme, who raised what, each interview's course, hopes and worries, one quote per theme.</span>
            </button>
            {(Object.keys(RECIPES) as Recipe[]).map((r) => (
              <button key={r} type="button" aria-pressed={format === r} onClick={() => pick(r)}
                className={cx('block w-full rounded-md border px-3 py-2 text-left', format === r ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-sunken')}>
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
            {risks && (risks.leaks.length > 0 || risks.unreviewed > 0) && (
              <p role="status" className={cx('rounded-md px-2.5 py-2 text-xs', risks.leaks.length ? 'bg-bad-soft text-bad' : 'bg-sunken text-muted')}>
                {risks.leaks.length > 0 && <>Not masked: {risks.leaks.slice(0, 5).map((c) => `${c.text} (${c.total}×)`).join(', ')}{risks.leaks.length > 5 ? ` and ${risks.leaks.length - 5} more` : ''}, short forms of masked names. </>}
                {risks.unreviewed > 0 && <>{risks.unreviewed} capitalised words that may be names{risks.people.length ? `, such as ${risks.people.slice(0, 3).map((c) => c.text).join(', ')},` : ''} have not been added or dismissed. </>}
                <Link to="/p/$projectId/review" params={{ projectId: project.id }} search={{ tab: 'names' }} className="font-medium underline">Review names</Link> before sharing.
              </p>
            )}
            {!isVisual && opts.perspectives && (
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
            {!isVisual && <>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.tabs} onChange={(e) => setOpts({ ...opts, tabs: e.target.checked })} /> Sections as tabs (HTML)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.bars} onChange={(e) => setOpts({ ...opts, bars: e.target.checked })} /> Grade and stance bars</label>
              <label className="flex items-center gap-2">Quotes per framework cell
                <Select value={String(Math.min(opts.quotesPerCell, 99))} onChange={(e) => setOpts({ ...opts, quotesPerCell: Number(e.target.value) })} className="h-7 text-xs" aria-label="Quotes per framework cell">
                  {[0, 1, 2, 3, 99].map((n) => <option key={n} value={n}>{n === 99 ? 'all' : n}</option>)}
                </Select>
              </label>
            </>}
          </Panel>
          <Panel title={isVisual ? 'Charts' : 'Sections'} bodyClass="p-3">
            <ul className="space-y-1.5">
              {isVisual
                ? VISUAL_SECTIONS.map(([id, label]) => (
                  <li key={id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visual[id]} onChange={(e) => setVisual({ ...visual, [id]: e.target.checked })} />{label}</label></li>
                ))
                : REPORT_SECTIONS.map(([id, label]) => (
                  <li key={id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opts[id]} onChange={(e) => setOpts({ ...opts, [id]: e.target.checked })} />{label}</label></li>
                ))}
            </ul>
          </Panel>
          <Documents project={project} recipeId={recipeId} onRecipe={setKitRecipe} overlay={overlay} busy={busy} onWord={word} onPdf={kitPdf} onZip={kitZip} toComplete={toComplete} onError={setError} />
          <Panel title="Other formats">
            <div className="flex flex-col items-start gap-2">
              <Button size="sm" variant="primary" icon={<Package size={13} />} disabled={!!busy} onClick={everything}>All interviews + each participant (.zip)</Button>
              <p className="text-xs text-muted">{isVisual ? 'The visual brief as HTML and PDF' : 'This report as HTML, PDF and Markdown, with its claims table,'} for everyone together and for each of the {people.length} participants.</p>
              {!isVisual && <Button size="sm" icon={<Download size={13} />} onClick={() => download(`${base}.md`, reportMarkdown(scoped, opts), 'text/markdown')}>Markdown</Button>}
              <Button size="sm" icon={<Download size={13} />} onClick={() => download(`${slug(project.name)}-${who}-claims.csv`, claimsCSV(scoped), 'text/csv')}>Claims table (CSV)</Button>
              <Button size="sm" icon={<Download size={13} />} disabled={!scoped.reviewLog.length} onClick={() => download(`${slug(project.name)}-${who}-review-decisions.csv`, decisionLogCSV(scoped), 'text/csv')}>Review decisions (CSV)</Button>
            </div>
          </Panel>
        </aside>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="grid grid-cols-2 gap-0.5 rounded-md bg-sunken p-0.5 text-xs" role="radiogroup" aria-label="Preview">
              {([['html', 'Web page'], ['pages', 'Word and PDF pages']] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cx('rounded px-2.5 py-1', view === v ? 'bg-surface font-medium shadow-sm' : 'text-muted')}>{l}</button>
              ))}
            </div>
            {view === 'pages' && <span className="text-xs text-muted">{laying ? 'Laying out…' : pages ? `${pages.pages.length} pages · ${recipeById(project, recipeId)?.name ?? ''}` : ''}</span>}
          </div>
          {view === 'html'
            ? <iframe ref={frame} title="Report preview" srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-[calc(100vh-13rem)] w-full rounded-lg border border-line bg-white" />
            : <PagePreview pages={pages?.pages ?? null} glyphDefs={pages?.glyphDefs ?? null} building={laying} />}
        </div>
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
        {so.note && (so.note.length > 220
          ? <details className="text-xs text-muted"><summary className="cursor-pointer">{so.note.slice(0, 160).replace(/\s+\S*$/, '')} …</summary><p className="mt-1">{so.note}</p></details>
          : <p className="text-xs text-muted">{so.note}</p>)}
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
