import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Undo2, X } from 'lucide-react'
import type { Coding, Project } from '../../lib/types'
import { formatTime, groupOf, indexBy, orderedCodes, pendingSuggestions, timeAt } from '../../lib/model'
import { acceptAsCode, acceptSuggestion, acceptSuggestions, rejectSuggestions } from '../../lib/actions'
import { undo, useProject } from '../../lib/store'
import { Badge, Button, Empty, Kbd, Panel, Select, Swatch, Tabs, cx } from '../../components/ui'
import { CodeCard } from '../code/CodeCard'
import { Claims } from './Claims'

type Mode = 'claims' | 'focus' | 'list'

/** Review order: repaired quotes, then conflicts with human coding, then least confident first. */
function priority(project: Project, c: Coding) {
  if (c.origin?.match === 'repaired') return 0
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const g = groupOf(codes.get(c.codeId), codes, groups)?.id
  const conflict = project.codings.some((h) => h.status === 'accepted' && !h.origin && h.sourceId === c.sourceId && h.start < c.end && h.end > c.start && h.codeId !== c.codeId && groupOf(codes.get(h.codeId), codes, groups)?.id === g)
  if (conflict) return 1
  return 2 + (c.confidence ?? 0.5)
}

const MODES: { value: Mode; label: string }[] = [{ value: 'claims', label: 'By claim' }, { value: 'focus', label: 'One code at a time' }, { value: 'list', label: 'In bulk' }]

export function Suggestions() {
  const [mode, setMode] = useState<Mode>('claims')
  return (
    <div className="space-y-3">
      <div className="max-w-md"><Tabs value={mode} onChange={setMode} items={MODES} /></div>
      {mode === 'claims' ? <Claims /> : <SingleSuggestions mode={mode} />}
    </div>
  )
}

function SingleSuggestions({ mode }: { mode: Mode }) {
  const project = useProject()
  const [run, setRun] = useState('')
  const [codeFilter, setCodeFilter] = useState('')
  const [minConf, setMinConf] = useState(0)
  const waiting = useMemo(() => pendingSuggestions(project), [project])
  const items = useMemo(() => waiting
    .filter((c) => (!run || c.origin?.runId === run) && (!codeFilter || c.codeId === codeFilter) && (c.confidence ?? 1) >= minConf)
    .map((c) => ({ c, p: priority(project, c) }))
    .sort((a, b) => a.p - b.p || a.c.sourceId.localeCompare(b.c.sourceId) || a.c.start - b.c.start)
    .map((x) => x.c), [project, waiting, run, codeFilter, minConf])
  const total = waiting.length

  if (!total) {
    return <Panel><Empty icon={<CheckCircle2 size={28} />} title="No suggestions waiting">Suggestions from AI assist or imports appear here for a decision. Nothing counts until you accept it.</Empty></Panel>
  }
  const runs = project.aiRuns.filter((r) => waiting.some((c) => c.origin?.runId === r.id))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={run} onChange={(e) => setRun(e.target.value)} className="h-8" aria-label="Pass">
          <option value="">All passes</option>
          {runs.map((r) => <option key={r.id} value={r.id}>{r.model} · {new Date(r.startedAt).toLocaleDateString()}</option>)}
        </Select>
        <Select value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} className="h-8 max-w-56" aria-label="Code">
          <option value="">All codes</option>
          {orderedCodes(project).filter(({ code }) => waiting.some((c) => c.codeId === code.id)).map(({ code }) => <option key={code.id} value={code.id}>{code.name}</option>)}
        </Select>
        <Select value={String(minConf)} onChange={(e) => setMinConf(Number(e.target.value))} className="h-8" aria-label="Confidence">
          <option value="0">Any confidence</option>
          <option value="0.6">Medium or high</option>
          <option value="0.9">High only</option>
        </Select>
        <span className="ml-auto text-sm text-muted">{items.length} of {total} shown</span>
      </div>
      {items.length === 0 ? <Panel><Empty title="Nothing matches these filters" /></Panel> : mode === 'focus' ? <Focus items={items} /> : <Bulk items={items} />}
    </div>
  )
}

function Context({ project, c }: { project: Project; c: Coding }) {
  const s = project.sources.find((x) => x.id === c.sourceId)
  if (!s) return null
  const before = s.text.slice(Math.max(0, c.start - 260), c.start)
  const after = s.text.slice(c.end, c.end + 260)
  return (
    <p className="font-serif text-[16px] leading-relaxed whitespace-pre-wrap">
      <span className="text-faint">…{before}</span>
      <mark className="rounded-sm bg-accent-soft px-0.5 text-ink">{s.text.slice(c.start, c.end)}</mark>
      <span className="text-faint">{after}…</span>
    </p>
  )
}

function Meta({ project, c }: { project: Project; c: Coding }) {
  const s = project.sources.find((x) => x.id === c.sourceId)
  const t = s ? timeAt(s, c.start) : null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span className="font-medium text-ink">{s?.name}</span>
      {t != null && <span className="font-mono">{formatTime(t)}</span>}
      <span>· {c.coder}</span>
      {c.confidence != null && <Badge tone={c.confidence >= 0.9 ? 'good' : c.confidence >= 0.6 ? 'accent' : 'warn'}>{c.confidence >= 0.9 ? 'high' : c.confidence >= 0.6 ? 'medium' : 'low'} confidence</Badge>}
      {c.origin?.match === 'repaired' && <Badge tone="warn" className="cursor-help"><span title="The model's quote didn't match the transcript exactly; the closest passage was used. Check the boundaries.">quote repaired</span></Badge>}
    </div>
  )
}

function Focus({ items }: { items: Coding[] }) {
  const project = useProject()
  const [i, setI] = useState(0)
  const [alt, setAlt] = useState('')
  const c = items[Math.min(i, items.length - 1)]
  const codes = indexBy(project.codes)
  const code = codes.get(c.codeId)
  useEffect(() => { setAlt('') }, [c.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey) return
      if (e.key === 'a') { e.preventDefault(); acceptSuggestion(c.id) }
      else if (e.key === 'x') { e.preventDefault(); rejectSuggestions([c.id]) }
      else if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setI((n) => Math.max(0, n - 1)) }
      else if (e.key === 'Backspace') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [c.id, items.length])

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <article className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm text-muted tabular-nums">{Math.min(i, items.length - 1) + 1} of {items.length}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />} disabled={i === 0} onClick={() => setI(i - 1)}>Previous</Button>
            <Button size="sm" variant="ghost" disabled={i >= items.length - 1} onClick={() => setI(i + 1)}>Skip <ChevronRight size={14} /></Button>
          </div>
        </div>
        <div className="mb-2 flex items-center gap-2"><Swatch color={code?.color ?? '#888'} /><span className="font-semibold">{code?.name}</span></div>
        <Meta project={project} c={c} />
        <div className="mt-4"><Context project={project} c={c} /></div>
        {c.rationale && <p className="mt-4 rounded-md bg-sunken px-3 py-2 text-sm"><span className="font-medium">Why: </span>{c.rationale}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="primary" icon={<Check size={14} />} onClick={() => acceptSuggestion(c.id)}>Accept <Kbd>A</Kbd></Button>
          <Button variant="danger" icon={<X size={14} />} onClick={() => rejectSuggestions([c.id])}>Reject <Kbd>X</Kbd></Button>
          <Select value={alt} onChange={(e) => setAlt(e.target.value)} className="h-8.5 max-w-60" aria-label="Accept with a different code">
            <option value="">Different code…</option>
            {orderedCodes(project).filter(({ code: k }) => k.id !== c.codeId).map(({ code: k, depth }) => <option key={k.id} value={k.id}>{'  '.repeat(depth)}{k.name}</option>)}
          </Select>
          {alt && <Button onClick={() => acceptAsCode(c.id, alt)}>Accept as that</Button>}
          <Button variant="ghost" icon={<Undo2 size={14} />} onClick={undo}>Undo <Kbd>⌫</Kbd></Button>
          <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: c.sourceId, at: c.start, end: c.end }} className="ml-auto text-sm text-accent hover:underline">Open in transcript</Link>
        </div>
        <p className="mt-3 text-xs text-muted"><Kbd>Space</Kbd> skips, <Kbd>←</Kbd> goes back. Repaired quotes and suggestions that conflict with your own coding come first.</p>
      </article>
      <aside className="rounded-lg border border-line bg-surface p-4">
        {code ? <CodeCard code={code} /> : <p className="text-sm text-muted">Code was deleted.</p>}
      </aside>
    </div>
  )
}

function Bulk({ items }: { items: Coding[] }) {
  const project = useProject()
  const codes = indexBy(project.codes)
  const groups = new Map<string, Coding[]>()
  for (const c of items) { if (!groups.has(c.codeId)) groups.set(c.codeId, []); groups.get(c.codeId)!.push(c) }
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const toggle = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/95 px-3 py-2 backdrop-blur">
        <span className="text-sm">{picked.size} selected</span>
        <Button size="sm" variant="primary" icon={<Check size={13} />} disabled={!picked.size} onClick={() => { acceptSuggestions([...picked]); setPicked(new Set()) }}>Accept</Button>
        <Button size="sm" variant="danger" icon={<X size={13} />} disabled={!picked.size} onClick={() => { rejectSuggestions([...picked]); setPicked(new Set()) }}>Reject</Button>
        <span className="text-xs text-muted">Tip: filter to “High only”, read a handful, then accept a code's group at once. Spot-check before you trust a batch.</span>
      </div>
      {[...groups].map(([codeId, list]) => {
        const all = list.every((c) => picked.has(c.id))
        return (
          <Panel key={codeId} bodyClass="p-0" title={<span className="flex items-center gap-2"><input type="checkbox" checked={all} onChange={(e) => list.forEach((c) => toggle(c.id, e.target.checked))} aria-label="Select all for this code" /><Swatch color={codes.get(codeId)?.color ?? '#888'} />{codes.get(codeId)?.name} <Badge>{list.length}</Badge></span>}>
            <ul className="divide-y divide-line">
              {list.map((c) => {
                const s = project.sources.find((x) => x.id === c.sourceId)
                return (
                  <li key={c.id} className={cx('flex gap-3 px-4 py-2.5', picked.has(c.id) && 'bg-accent-soft/40')}>
                    <input type="checkbox" className="mt-1" checked={picked.has(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} aria-label="Select suggestion" />
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[15px]">{s?.text.slice(c.start, c.end)}</p>
                      <Meta project={project} c={c} />
                      {c.rationale && <p className="mt-1 line-clamp-2 text-xs text-muted">{c.rationale}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        )
      })}
    </div>
  )
}
