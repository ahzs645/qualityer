import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import type { Candidate, Correction } from '../lib/types'
import { update, useProject } from '../lib/store'
import { agreement, checkRules, coders, describeRule, excerpt, findCorrections, formatTime, indexBy, timeAt, uid } from '../lib/model'
import { addCode, applyGlossary, updateCandidate } from '../lib/actions'
import { Suggestions } from '../features/review/Suggestions'
import { Badge, Button, Empty, IconButton, Input, PageHeader, Panel, Select, Swatch, Tabs, Textarea, cx } from '../components/ui'

type Tab = 'rules' | 'suggestions' | 'transcript' | 'candidates' | 'agreement'

export const Route = createFileRoute('/p/$projectId/review')({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: ['rules', 'suggestions', 'transcript', 'candidates', 'agreement'].includes(s.tab as string) ? (s.tab as Tab) : undefined,
  }),
  component: Review,
})

function Review() {
  const project = useProject()
  const { tab = 'rules' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const violations = useMemo(() => checkRules(project), [project])
  const suggested = project.codings.filter((c) => c.status === 'suggested').length
  const open = project.candidates.filter((c) => c.status === 'open').length

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader title="Review" description="Everything that needs a researcher's decision: rule issues, suggestions, transcript corrections, candidate codes and coder agreement." />
      <Tabs value={tab} onChange={(t) => navigate({ search: { tab: t } })} items={[
        { value: 'rules', label: <>Rule issues {violations.length > 0 && <Badge tone="bad">{violations.length}</Badge>}</> },
        { value: 'suggestions', label: <>Suggestions {suggested > 0 && <Badge tone="accent">{suggested}</Badge>}</> },
        { value: 'transcript', label: 'Transcript corrections' },
        { value: 'candidates', label: <>Candidate codes {open > 0 && <Badge tone="warn">{open}</Badge>}</> },
        { value: 'agreement', label: 'Agreement' },
      ]} />
      <div className="mt-4">
        {tab === 'rules' && <Rules violations={violations} />}
        {tab === 'suggestions' && <Suggestions />}
        {tab === 'transcript' && <TranscriptQA />}
        {tab === 'candidates' && <Candidates />}
        {tab === 'agreement' && <Agreement />}
      </div>
    </div>
  )
}

function Rules({ violations }: { violations: ReturnType<typeof checkRules> }) {
  const project = useProject()
  const sources = indexBy(project.sources)
  const groups = indexBy(project.groups)
  const rules = indexBy(project.rules)
  const [rule, setRule] = useState('')
  if (!project.rules.some((r) => r.enabled)) {
    return <Panel><Empty title="No rules are active" action={<Link to="/p/$projectId/codebook" params={{ projectId: project.id }}><Button>Set up rules</Button></Link>}>Rules live in the codebook, under Groups & rules.</Empty></Panel>
  }
  const shown = rule ? violations.filter((v) => v.ruleId === rule) : violations
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={rule} onChange={(e) => setRule(e.target.value)} className="h-8">
          <option value="">All rules ({violations.length})</option>
          {project.rules.filter((r) => r.enabled).map((r) => (
            <option key={r.id} value={r.id}>{describeRule(r, groups)} ({violations.filter((v) => v.ruleId === r.id).length})</option>
          ))}
        </Select>
      </div>
      {shown.length === 0 ? (
        <Panel><Empty icon={<CheckCircle2 size={28} className="text-good" />} title="Every coded claim meets the rules" /></Panel>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {shown.map((v, i) => {
            const src = sources.get(v.sourceId)
            return (
              <li key={i}>
                <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: v.sourceId, at: v.start, end: v.end }} className="flex items-start gap-3 px-4 py-3 hover:bg-sunken/60">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{v.message}</div>
                    <div className="line-clamp-2 font-serif text-sm text-muted">{src ? excerpt(src.text, v.start, v.end) : ''}</div>
                    <div className="mt-0.5 text-xs text-faint">{src?.name}{src && timeAt(src, v.start) != null ? ` · ${formatTime(timeAt(src, v.start))}` : ''} · {rules.get(v.ruleId) ? describeRule(rules.get(v.ruleId)!, groups) : ''}</div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TranscriptQA() {
  const project = useProject()
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const perSource = useMemo(() => project.sources.map((s) => ({ s, hits: findCorrections(s.text, project.glossary) })), [project.sources, project.glossary])
  const total = perSource.reduce((n, x) => n + x.hits.length, 0)
  const setCorr = (id: string, change: Partial<Correction>) => update('edit correction', (p) => ({ ...p, glossary: p.glossary.map((g) => (g.id === id ? { ...g, ...change } : g)) }))
  const uncertain = project.sources.map((s) => ({ s, n: (s.segments ?? []).reduce((k, g) => k + (g.uncertain?.length ?? 0), 0) })).filter((x) => x.n)

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <Panel title="Correction glossary" bodyClass="p-0">
          <p className="border-b border-line px-4 py-2 text-xs text-muted">
            Automatic transcripts misspell names and places. List fixes once and apply them to every source. Codes, memos and guide links move with the text, and a snapshot is taken first.
          </p>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Transcript says</th><th className="px-2 py-2 font-medium">Should read</th><th className="px-2 py-2 font-medium">Options</th><th className="px-2 py-2 text-right font-medium">Matches</th><th /></tr></thead>
            <tbody>
              {project.glossary.map((g) => {
                const n = perSource.reduce((k, x) => k + x.hits.filter((h) => h.correctionId === g.id).length, 0)
                return (
                  <tr key={g.id} className="border-b border-line">
                    <td className="px-3 py-1.5"><Input className="h-7" defaultValue={g.find} onBlur={(e) => e.target.value !== g.find && setCorr(g.id, { find: e.target.value })} aria-label="Find" /></td>
                    <td className="px-2 py-1.5"><Input className="h-7" defaultValue={g.replace} onBlur={(e) => e.target.value !== g.replace && setCorr(g.id, { replace: e.target.value })} aria-label="Replace" /></td>
                    <td className="px-2 text-xs whitespace-nowrap text-muted">
                      <label className="mr-2"><input type="checkbox" checked={g.wholeWord} onChange={(e) => setCorr(g.id, { wholeWord: e.target.checked })} /> word</label>
                      <label><input type="checkbox" checked={g.caseSensitive} onChange={(e) => setCorr(g.id, { caseSensitive: e.target.checked })} /> Aa</label>
                    </td>
                    <td className="px-2 text-right tabular-nums">{n}</td>
                    <td className="px-2"><IconButton label="Delete correction" onClick={() => update('delete correction', (p) => ({ ...p, glossary: p.glossary.filter((x) => x.id !== g.id) }))}><Trash2 size={14} /></IconButton></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <form className="flex flex-wrap gap-2 p-3" onSubmit={(e) => {
            e.preventDefault()
            if (!find.trim()) return
            update('add correction', (p) => ({ ...p, glossary: [...p.glossary, { id: uid(), find: find.trim(), replace: replace.trim(), wholeWord: true, caseSensitive: false }] }))
            setFind(''); setReplace('')
          }}>
            <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="e.g. Jon Smyth" className="h-8 w-40" aria-label="Transcript says" />
            <Input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="e.g. Jon Smith" className="h-8 w-40" aria-label="Should read" />
            <Button size="sm" type="submit" icon={<Plus size={13} />}>Add</Button>
          </form>
        </Panel>

        {total > 0 && (
          <Panel title={`Preview · ${total} changes`} actions={
            <Button size="sm" variant="primary" disabled={busy} onClick={async () => {
              setBusy(true)
              const n = await applyGlossary(project.sources.map((s) => s.id))
              setBusy(false)
              setDone(`Applied ${n} corrections. A snapshot was saved first; undo also works.`)
            }}>Apply all</Button>
          } bodyClass="p-0">
            <ul className="max-h-96 divide-y divide-line overflow-y-auto scroll-thin">
              {perSource.flatMap(({ s, hits }) => hits.slice(0, 40).map((h) => (
                <li key={`${s.id}:${h.start}`} className="px-4 py-2 text-sm">
                  <span className="text-xs text-muted">{s.name} · </span>
                  <span className="font-serif text-muted">…{s.text.slice(Math.max(0, h.start - 50), h.start)}</span>
                  <del className="bg-bad-soft text-bad">{s.text.slice(h.start, h.end)}</del>
                  <ins className="bg-good-soft text-good no-underline">{h.text}</ins>
                  <span className="font-serif text-muted">{s.text.slice(h.end, h.end + 50)}…</span>
                </li>
              )))}
            </ul>
          </Panel>
        )}
        {done && <p className="rounded-md bg-good-soft px-3 py-2 text-sm text-good">{done}</p>}
      </div>

      <div className="space-y-5">
        <Panel title="Low-confidence words">
          {uncertain.length === 0 ? (
            <p className="text-sm text-muted">None recorded. Imports of Whisper JSON or Research Weave exports with word probabilities mark uncertain words with a wavy underline in the Code view.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {uncertain.map(({ s, n }) => (
                <li key={s.id} className="flex justify-between"><Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: s.id }} className="truncate hover:text-accent">{s.name}</Link><span className="tabular-nums text-warn">{n}</span></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Single-passage fixes">
          <p className="text-sm text-muted">To correct one passage, select it in the Code view and use the pencil on the quote. Codes on it stay attached.</p>
        </Panel>
      </div>
    </div>
  )
}

const CANDIDATE_STATUS: Candidate['status'][] = ['open', 'adopted', 'merged', 'parked']

function Candidates() {
  const project = useProject()
  const sources = indexBy(project.sources)
  const [name, setName] = useState('')
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Ideas for new codes logged while coding. Settle them together at the reconciliation meeting: adopt one into the codebook, merge it into an existing code, or park it.</p>
      <form className="flex gap-2" onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        update('log candidate code', (p) => ({ ...p, candidates: [{ id: uid(), name: name.trim(), rationale: '', sourceId: null, start: null, end: null, status: 'open', resolution: '', proposedBy: p.coder, createdAt: new Date().toISOString() }, ...p.candidates] }))
        setName('')
      }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Proposed code" className="max-w-sm" />
        <Button type="submit" icon={<Plus size={14} />}>Log</Button>
      </form>
      {project.candidates.length === 0 ? <Panel><Empty title="No candidate codes logged" /></Panel> : (
        <ul className="space-y-2">
          {project.candidates.map((c) => {
            const src = c.sourceId ? sources.get(c.sourceId) : undefined
            return (
              <li key={c.id} className={cx('rounded-lg border border-line bg-surface p-4', c.status !== 'open' && 'opacity-75')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge tone={c.status === 'open' ? 'warn' : c.status === 'adopted' ? 'good' : 'neutral'}>{c.status}</Badge>
                  <span className="text-xs text-muted">proposed by {c.proposedBy}</span>
                  <div className="ml-auto flex gap-1.5">
                    <Select value={c.status} onChange={(e) => updateCandidate(c.id, { status: e.target.value as Candidate['status'] })} className="h-7 text-xs" aria-label="Decision">
                      {CANDIDATE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                    {c.status === 'open' && (
                      <Button size="sm" onClick={() => { addCode({ name: c.name, definition: c.rationale }); updateCandidate(c.id, { status: 'adopted', resolution: c.resolution || 'Adopted into the codebook.' }) }}>Adopt as code</Button>
                    )}
                  </div>
                </div>
                {src && c.start != null && (
                  <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: src.id, at: c.start, end: c.end ?? c.start }} className="mt-2 block rounded border-l-2 border-warn bg-sunken px-3 py-1.5 font-serif text-sm hover:bg-accent-soft">
                    {excerpt(src.text, c.start, c.end ?? c.start)} <span className="font-sans text-xs text-muted">— {src.name}</span>
                  </Link>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Textarea rows={2} placeholder="Why it might be needed" defaultValue={c.rationale} onBlur={(e) => e.target.value !== c.rationale && updateCandidate(c.id, { rationale: e.target.value })} className="text-xs" />
                  <Textarea rows={2} placeholder="Decision and reason (reconciliation)" defaultValue={c.resolution} onBlur={(e) => e.target.value !== c.resolution && updateCandidate(c.id, { resolution: e.target.value })} className="text-xs" />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Agreement() {
  const project = useProject()
  const people = coders(project)
  const [a, setA] = useState(people[0] ?? '')
  const [b, setB] = useState(people[1] ?? '')
  const shared = project.sources.filter((s) => project.codings.some((c) => c.sourceId === s.id && c.coder === a) && project.codings.some((c) => c.sourceId === s.id && c.coder === b))
  const result = useMemo(() => (a && b && a !== b ? agreement(project, a, b, shared.map((s) => s.id)) : null), [project, a, b, shared.map((s) => s.id).join()])
  const codes = indexBy(project.codes)

  if (people.length < 2) {
    return <Panel><Empty title="Agreement needs two coders">Have a second person code the same source (set their name under Settings), or import a project with several coders.</Empty></Panel>
  }
  const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(2))
  const tone = (k: number | null) => (k == null ? '' : k >= 0.8 ? 'text-good' : k >= 0.6 ? 'text-warn' : 'text-bad')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        Compare <Select value={a} onChange={(e) => setA(e.target.value)} className="h-8">{people.map((p) => <option key={p}>{p}</option>)}</Select>
        with <Select value={b} onChange={(e) => setB(e.target.value)} className="h-8">{people.map((p) => <option key={p}>{p}</option>)}</Select>
        <span className="text-muted">on {shared.length} source{shared.length === 1 ? '' : 's'} both coded</span>
      </div>
      {!result || !shared.length ? <Panel><Empty title="No source coded by both" /></Panel> : (
        <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
          <Panel title="By group (pooled)" bodyClass="p-0">
            <AgreeTable rows={result.byGroup} fmt={fmt} tone={tone} />
          </Panel>
          <Panel title="By code" bodyClass="p-0">
            <AgreeTable rows={result.byCode} fmt={fmt} tone={tone} color={(id) => codes.get(id)?.color} />
          </Panel>
          <p className="text-xs text-muted lg:col-span-2">
            Character-level agreement: each character of the shared sources counts as coded or not coded for a code, per coder. Overlap is the share of jointly coded characters out of characters either coder coded. Cohen's κ corrects for chance; values above 0.8 are usually read as strong. Agreement on span boundaries and on code choice are mixed in this measure — read disagreeing passages before deciding anything.
          </p>
        </div>
      )}
    </div>
  )
}

function AgreeTable({ rows, fmt, tone, color }: { rows: ReturnType<typeof agreement>['byCode']; fmt: (v: number | null) => string; tone: (k: number | null) => string; color?: (id: string) => string | undefined }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Name</th><th className="px-2 py-2 text-right font-medium">Overlap</th><th className="px-4 py-2 text-right font-medium">κ</th></tr></thead>
      <tbody>
        {rows.sort((x, y) => (x.kappa ?? 2) - (y.kappa ?? 2)).map((r) => (
          <tr key={r.id} className="border-b border-line last:border-0">
            <td className="px-4 py-1.5"><span className="flex items-center gap-2">{color && <Swatch color={color(r.id) ?? '#888'} />}<span className="truncate">{r.label}</span></span></td>
            <td className="px-2 text-right tabular-nums">{Math.round(r.percent * 100)}%</td>
            <td className={cx('px-4 text-right font-medium tabular-nums', tone(r.kappa))}>{fmt(r.kappa)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
