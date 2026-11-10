import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { ClipboardList, Plus, Trash2, Upload, X } from 'lucide-react'
import type { CoverageStatus, GuideQuestion } from '../lib/types'
import { useProject, update } from '../lib/store'
import { groupOf, indexBy, orderedCodes, uid } from '../lib/model'
import { parseGuideLines, parseGuideMarkdown } from '../lib/importers'
import { setCoverage } from '../lib/actions'
import { Badge, Button, Empty, IconButton, Input, PageHeader, Panel, Select, Swatch, Tabs, Textarea, cx } from '../components/ui'
import { COVERAGE_LABEL, COVERAGE_ORDER, COVERAGE_STYLE } from '../features/guide/coverage'

export const Route = createFileRoute('/p/$projectId/guide')({ component: Guide })

function Guide() {
  const project = useProject()
  const [tab, setTab] = useState<'coverage' | 'guide' | 'saturation'>('coverage')
  const fileRef = useRef<HTMLInputElement>(null)

  const importGuide = async (file: File) => {
    const text = await file.text()
    let qs = parseGuideMarkdown(text)
    if (!qs.length) qs = parseGuideLines(text)
    if (!qs.length) return alert('No questions found. Use headings like “## C1 — Title · 2 min”, or one question per line.')
    const replace = project.guide.length > 0 && confirm(`Replace the current ${project.guide.length} questions with ${qs.length} from ${file.name}? Cancel to append.`)
    update('import guide', (p) => ({ ...p, guide: replace ? qs : [...p.guide, ...qs], coverage: replace ? [] : p.coverage }))
    setTab('guide')
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Guide & coverage"
        actions={<Button icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>Import guide</Button>}
      />
      <input ref={fileRef} type="file" accept=".md,.markdown,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importGuide(f); e.target.value = '' }} />
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'coverage', label: 'Coverage matrix' },
        { value: 'guide', label: <>Guide <Badge>{project.guide.length}</Badge></> },
        { value: 'saturation', label: 'Codes by interview' },
      ]} />
      <div className="mt-4">
        {tab === 'coverage' && <Coverage onEditGuide={() => setTab('guide')} />}
        {tab === 'guide' && <GuideEditor />}
        {tab === 'saturation' && <Saturation />}
      </div>
    </div>
  )
}

function Coverage({ onEditGuide }: { onEditGuide: () => void }) {
  const project = useProject()
  if (!project.guide.length) {
    return (
      <Panel>
        <Empty icon={<ClipboardList size={28} />} title="No interview guide yet" action={<Button variant="primary" onClick={onEditGuide}>Add questions</Button>}>
          Add questions by hand or import a Markdown guide with headings like <code>## C1 — Vantage · 2 min</code>.
        </Empty>
      </Panel>
    )
  }
  if (!project.sources.length) return <Panel><p className="text-sm text-muted">Add sources to mark coverage.</p></Panel>

  const evidence = (sourceId: string, q: GuideQuestion) =>
    q.codeIds.length ? project.codings.filter((c) => c.sourceId === sourceId && c.status === 'accepted' && q.codeIds.includes(c.codeId)).length : 0
  const sections = groupByModule(project.guide)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {COVERAGE_ORDER.map((s) => <span key={s} className={cx('rounded px-1.5 py-0.5 font-medium', COVERAGE_STYLE[s])}>{COVERAGE_LABEL[s]}</span>)}
        <span className="text-muted">Click a cell to change it. A dot means linked codes were applied in that interview.</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="sticky left-0 z-10 min-w-64 bg-surface px-4 py-2 font-medium">Question</th>
              {project.sources.map((s) => (
                <th key={s.id} className="min-w-32 px-2 py-2 font-medium">
                  <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: s.id }} className="line-clamp-2 hover:text-ink" title={s.name}>{s.name}</Link>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Answered</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(([module, qs]) => (
              <SectionRows key={module} module={module} qs={qs} evidence={evidence} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SectionRows({ module, qs, evidence }: { module: string; qs: GuideQuestion[]; evidence: (s: string, q: GuideQuestion) => number }) {
  const project = useProject()
  return (
    <>
      <tr className="bg-sunken/70">
        <td colSpan={project.sources.length + 2} className="sticky left-0 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{module || 'Core questions'}</td>
      </tr>
      {qs.map((q) => {
        const answered = project.sources.filter((s) => project.coverage.some((c) => c.sourceId === s.id && c.questionId === q.id && c.status === 'answered')).length
        return (
          <tr key={q.id} className="border-b border-line last:border-0">
            <td className="sticky left-0 z-10 bg-surface px-4 py-2">
              <div className="flex gap-2">
                <span className="w-8 shrink-0 font-mono text-xs leading-5 text-muted">{q.key}</span>
                <span className="font-medium" title={q.prompt}>{q.title}</span>
              </div>
            </td>
            {project.sources.map((s) => {
              const mark = project.coverage.find((c) => c.sourceId === s.id && c.questionId === q.id)
              const status: CoverageStatus = mark?.status ?? 'unmarked'
              const ev = evidence(s.id, q)
              return (
                <td key={s.id} className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <select
                      value={status}
                      onChange={(e) => setCoverage(s.id, q.id, { status: e.target.value as CoverageStatus })}
                      className={cx('h-7 w-full cursor-pointer appearance-none rounded px-2 text-xs font-medium', COVERAGE_STYLE[status])}
                      title={mark?.note || COVERAGE_LABEL[status]}
                      aria-label={`${q.key} in ${s.name}`}
                    >
                      {COVERAGE_ORDER.map((o) => <option key={o} value={o}>{COVERAGE_LABEL[o]}</option>)}
                    </select>
                    {ev > 0 && <span className="size-1.5 shrink-0 rounded-full bg-accent" title={`${ev} codings with linked codes`} />}
                  </div>
                  {mark?.note && <div className="mt-0.5 line-clamp-1 text-[11px] text-muted" title={mark.note}>{mark.note}</div>}
                </td>
              )
            })}
            <td className="px-3 text-right tabular-nums text-muted">{answered}/{project.sources.length}</td>
          </tr>
        )
      })}
    </>
  )
}

/** Core questions first, then modules. Single-question modules share one "Modules" section. */
function groupByModule(guide: GuideQuestion[]) {
  const size = new Map<string, number>()
  for (const q of guide) size.set(q.module, (size.get(q.module) ?? 0) + 1)
  const map = new Map<string, GuideQuestion[]>()
  for (const q of guide) {
    const key = q.module && size.get(q.module) === 1 ? 'Modules' : q.module
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(q)
  }
  return [...map]
}

function GuideEditor() {
  const project = useProject()
  const codes = indexBy(project.codes)
  const set = (id: string, change: Partial<GuideQuestion>) =>
    update('edit guide', (p) => ({ ...p, guide: p.guide.map((q) => (q.id === id ? { ...q, ...change } : q)) }))
  const all = orderedCodes(project)

  return (
    <div className="space-y-3">
      {project.guide.map((q) => (
        <Panel key={q.id} bodyClass="p-4">
          <div className="grid gap-3 md:grid-cols-[5rem_1fr_12rem_5rem_auto]">
            <Input defaultValue={q.key} onBlur={(e) => e.target.value !== q.key && set(q.id, { key: e.target.value })} aria-label="Key" className="font-mono" />
            <Input defaultValue={q.title} onBlur={(e) => e.target.value !== q.title && set(q.id, { title: e.target.value })} aria-label="Title" className="font-medium" />
            <Input defaultValue={q.module} onBlur={(e) => e.target.value !== q.module && set(q.id, { module: e.target.value })} placeholder="Core (no module)" aria-label="Module" />
            <Input type="number" defaultValue={q.minutes ?? ''} onBlur={(e) => set(q.id, { minutes: e.target.value ? Number(e.target.value) : null })} placeholder="min" aria-label="Minutes" />
            <IconButton label={`Delete ${q.key}`} onClick={() => update('delete question', (p) => ({ ...p, guide: p.guide.filter((x) => x.id !== q.id), coverage: p.coverage.filter((c) => c.questionId !== q.id) }))}><Trash2 size={15} /></IconButton>
          </div>
          <Textarea className="mt-3" rows={2} defaultValue={q.prompt} onBlur={(e) => e.target.value !== q.prompt && set(q.id, { prompt: e.target.value })} placeholder="Question as asked" aria-label="Prompt" />
          <Textarea className="mt-2 text-xs" rows={Math.min(6, Math.max(2, q.probes.length))} defaultValue={q.probes.join('\n')} onBlur={(e) => set(q.id, { probes: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })} placeholder="Probes, one per line" aria-label="Probes" />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Expected codes:</span>
            {q.codeIds.map((id) => (
              <Badge key={id}>
                <Swatch color={codes.get(id)?.color ?? '#888'} />{codes.get(id)?.name}
                <button type="button" aria-label="Unlink code" onClick={() => set(q.id, { codeIds: q.codeIds.filter((x) => x !== id) })}><X size={11} /></button>
              </Badge>
            ))}
            <Select value="" onChange={(e) => e.target.value && set(q.id, { codeIds: [...q.codeIds, e.target.value] })} className="h-7 text-xs" aria-label="Link a code">
              <option value="">+ link code</option>
              {all.filter(({ code }) => !q.codeIds.includes(code.id)).map(({ code, depth }) => <option key={code.id} value={code.id}>{'  '.repeat(depth)}{code.name}</option>)}
            </Select>
          </div>
        </Panel>
      ))}
      <Button icon={<Plus size={15} />} onClick={() => update('add question', (p) => ({
        ...p, guide: [...p.guide, { id: uid(), key: `Q${p.guide.length + 1}`, title: 'New question', prompt: '', probes: [], module: '', minutes: null, codeIds: [] }],
      }))}>Add question</Button>
    </div>
  )
}

function Saturation() {
  const project = useProject()
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of project.codings) if (c.status === 'accepted') m.set(`${c.codeId}:${c.sourceId}`, (m.get(`${c.codeId}:${c.sourceId}`) ?? 0) + 1)
    return m
  }, [project.codings])
  const max = Math.max(1, ...counts.values())
  const [only, setOnly] = useState<'all' | 'unused'>('all')
  const rows = orderedCodes(project).filter(({ code }) => only === 'all' || !project.sources.some((s) => counts.get(`${code.id}:${s.id}`)))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Select value={only} onChange={(e) => setOnly(e.target.value as 'all')} className="h-8">
          <option value="all">All codes</option>
          <option value="unused">Codes never applied</option>
        </Select>
        <span className="text-muted">{rows.length} codes</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="sticky left-0 z-10 min-w-64 bg-surface px-4 py-2 font-medium">Code</th>
              {project.sources.map((s) => <th key={s.id} className="w-24 px-2 py-2 text-center font-medium"><span className="line-clamp-2" title={s.name}>{s.name}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ code, depth }) => (
              <tr key={code.id} className="border-b border-line last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-4 py-1.5" style={{ paddingLeft: 16 + depth * 14 }}>
                  <span className="flex items-center gap-2"><Swatch color={code.color} /><span className="truncate">{code.name}</span>
                    <span className="text-[11px] text-faint">{groupOf(codes.get(code.id), codes, groups)?.name.split(' ')[0]}</span></span>
                </td>
                {project.sources.map((s) => {
                  const n = counts.get(`${code.id}:${s.id}`) ?? 0
                  return (
                    <td key={s.id} className="px-1 py-1 text-center">
                      {n > 0 ? (
                        <Link to="/p/$projectId/retrieve" params={{ projectId: project.id }} search={{ codes: code.id, sources: s.id }}
                          className="block rounded px-1 py-0.5 text-xs tabular-nums" style={{ background: `color-mix(in oklab, var(--accent) ${12 + (n / max) * 60}%, transparent)` }}>
                          {n}
                        </Link>
                      ) : <span className="text-xs text-faint">·</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
