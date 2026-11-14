import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { Project } from '../lib/types'
import { useProject } from '../lib/store'
import { indexBy, orderedCodes } from '../lib/model'
import { cooccurrence, topPhrases, topTerms } from '../lib/explore'
import { Empty, PageHeader, Panel, Select, Tabs, cx } from '../components/ui'
import { InterviewMap } from '../features/explore/InterviewMap'
import { Compare } from '../features/explore/Compare'
import { Profile } from '../features/explore/Profile'
import { Positions } from '../features/explore/Positions'
import { CodeMatrix } from '../features/explore/Matrix'

type Tab = 'map' | 'matrix' | 'profile' | 'positions' | 'ai' | 'cooccurrence' | 'network' | 'terms'

export const Route = createFileRoute('/p/$projectId/explore')({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: s.tab === 'density' ? 'map' : ['map', 'matrix', 'profile', 'positions', 'ai', 'cooccurrence', 'network', 'terms'].includes(s.tab as string) ? (s.tab as Tab) : undefined,
  }),
  component: Explore,
})

function Explore() {
  const project = useProject()
  const { tab = 'map' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const accepted = project.codings.filter((c) => c.status === 'accepted')
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader title="Explore" />
      <Tabs value={tab} onChange={(t) => navigate({ search: { tab: t } })} items={[
        { value: 'map', label: 'Interview map' },
        { value: 'matrix', label: 'Who raised what' },
        { value: 'profile', label: 'Cases by domain' },
        { value: 'positions', label: 'Where people stand' },
        { value: 'ai', label: 'AI and you' },
        { value: 'cooccurrence', label: 'Co-occurrence' },
        { value: 'network', label: 'Network' },
        { value: 'terms', label: 'Words' },
      ]} />
      <div className="mt-4">
        {tab === 'ai' ? <Compare project={project} /> : accepted.length === 0 ? <Panel><Empty title="Nothing coded yet">Charts appear once passages are coded.</Empty></Panel> : (
          <>
            {tab === 'map' && <InterviewMap project={project} />}
            {tab === 'matrix' && <CodeMatrix project={project} />}
            {tab === 'profile' && <Profile project={project} />}
            {tab === 'positions' && <Positions project={project} />}
            {tab === 'cooccurrence' && <Heatmap project={project} />}
            {tab === 'network' && <Network project={project} />}
            {tab === 'terms' && <Terms project={project} />}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Codes applied at least once, in codebook order. With no group chosen, evidence-grade and stance
 * codes are left out: they sit on every claim, so they "co-occur" with everything and say nothing.
 */
function useUsedCodes(project: Project, groupId: string) {
  return useMemo(() => {
    const used = new Set(project.codings.filter((c) => c.status === 'accepted').map((c) => c.codeId))
    const kind = new Map(project.groups.map((g) => [g.id, g.kind]))
    return orderedCodes(project).map((x) => x.code).filter((c) => used.has(c.id) && (groupId ? c.groupId === groupId : !['evidence', 'stance'].includes(kind.get(c.groupId ?? '') ?? '')))
  }, [project, groupId])
}

function GroupFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const project = useProject()
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-8" aria-label="Code group">
      <option value="">All groups except evidence and stance</option>
      {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </Select>
  )
}

function Heatmap({ project }: { project: Project }) {
  const [group, setGroup] = useState('')
  const [hover, setHover] = useState<{ a: string; b: string; n: number } | null>(null)
  const counts = useMemo(() => cooccurrence(project), [project])
  const get = (a: string, b: string) => counts.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0
  const used = useUsedCodes(project, group)
  // Only codes that share a passage with another code: a grid of 100+ codes is mostly empty cells.
  // Past 40, keep the most connected, in codebook order.
  const { codes, hidden } = useMemo(() => {
    const total = new Map(used.map((a) => [a.id, used.reduce((n, b) => n + (a.id === b.id ? 0 : get(a.id, b.id)), 0)]))
    const linked = used.filter((c) => (total.get(c.id) ?? 0) > 0)
    const keep = new Set([...linked].sort((a, b) => total.get(b.id)! - total.get(a.id)!).slice(0, 40).map((c) => c.id))
    return { codes: linked.filter((c) => keep.has(c.id)), hidden: used.length - keep.size }
  }, [used, counts])
  const max = Math.max(1, ...codes.flatMap((a) => codes.map((b) => (a.id === b.id ? 0 : get(a.id, b.id)))))
  const byId = indexBy(project.codes)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <GroupFilter value={group} onChange={setGroup} />
        <span className="text-muted">Cells count passages where both codes overlap. Click a cell to read them.</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">0 <span className="h-2.5 w-24 rounded-sm" style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--accent) 8%, var(--surface)), var(--accent))' }} /> {max}</span>
      </div>
      <div className="relative overflow-auto rounded-lg border border-line bg-surface p-3">
        <table className="border-separate border-spacing-[2px] text-xs">
          <thead>
            <tr>
              <th />
              {codes.map((c) => (
                <th key={c.id} className="h-36 w-6 align-bottom font-normal">
                  <div className="mx-auto w-4 [writing-mode:vertical-rl] rotate-180 truncate text-left text-muted" title={c.name}>{c.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.map((a) => (
              <tr key={a.id}>
                <th className="max-w-56 truncate pr-2 text-right font-normal text-muted" title={a.name}>{a.name}</th>
                {codes.map((b) => {
                  const n = a.id === b.id ? 0 : get(a.id, b.id)
                  return (
                    <td key={b.id} className="p-0">
                      {a.id === b.id ? <div className="size-6" /> : (
                        <Link
                          to="/p/$projectId/retrieve"
                          params={{ projectId: project.id }}
                          search={{ codes: `${a.id},${b.id}`, mode: 'all' }}
                          onMouseEnter={() => setHover({ a: a.id, b: b.id, n })}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover({ a: a.id, b: b.id, n })}
                          aria-label={`${a.name} and ${b.name}: ${n} passages`}
                          className={cx('grid size-6 place-items-center rounded-[3px] tabular-nums', n / max > 0.55 ? 'text-accent-ink' : 'text-muted')}
                          style={{ background: n ? `color-mix(in oklab, var(--accent) ${10 + (n / max) * 90}%, var(--surface))` : 'transparent' }}
                        >
                          {n || ''}
                        </Link>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {hover && (
          <div className="pointer-events-none fixed right-6 bottom-6 z-40 max-w-sm rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-lg" role="status">
            <div className="font-medium">{hover.n} passage{hover.n === 1 ? '' : 's'}</div>
            <div className="text-xs text-muted">{byId.get(hover.a)?.name} × {byId.get(hover.b)?.name}</div>
          </div>
        )}
      </div>
      {hidden > 0 && <p className="text-xs text-muted">{hidden} codes are not shown: {codes.length >= 40 ? 'only the 40 that share the most passages are, and ' : ''}codes that never share a passage with another code are left out. Filter by group to see others.</p>}
    </div>
  )
}

function Network({ project }: { project: Project }) {
  const [group, setGroup] = useState('')
  const [min, setMin] = useState(1)
  const [hover, setHover] = useState<string | null>(null)
  const counts = useMemo(() => cooccurrence(project), [project])
  const used = useUsedCodes(project, group)
  // Codes with at least one link at this threshold; unlinked dots only crowd the circle.
  const codes = useMemo(() => {
    const ids = new Set(used.map((c) => c.id))
    const linked = new Set<string>()
    for (const [k, n] of counts) { const [a, b] = k.split('|'); if (n >= min && ids.has(a) && ids.has(b)) { linked.add(a); linked.add(b) } }
    const degree = new Map<string, number>()
    for (const [k, n] of counts) { const [a, b] = k.split('|'); if (n >= min && linked.has(a) && linked.has(b)) { degree.set(a, (degree.get(a) ?? 0) + n); degree.set(b, (degree.get(b) ?? 0) + n) } }
    const keep = new Set([...linked].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0)).slice(0, 48))
    return used.filter((c) => keep.has(c.id))
  }, [used, counts, min])
  const uses = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of project.codings) if (c.status === 'accepted') m.set(c.codeId, (m.get(c.codeId) ?? 0) + 1)
    return m
  }, [project.codings])
  const ids = new Set(codes.map((c) => c.id))
  const edges = [...counts].map(([k, n]) => { const [a, b] = k.split('|'); return { a, b, n } }).filter((e) => ids.has(e.a) && ids.has(e.b) && e.n >= min)
  const maxEdge = Math.max(1, ...edges.map((e) => e.n))
  const maxUse = Math.max(1, ...codes.map((c) => uses.get(c.id) ?? 0))
  const R = 200, cx0 = 450, cy0 = 390
  const pos = new Map(codes.map((c, i) => {
    const t = (i / codes.length) * Math.PI * 2 - Math.PI / 2
    return [c.id, { x: cx0 + R * Math.cos(t), y: cy0 + R * Math.sin(t), t }]
  }))
  const linked = (id: string) => edges.filter((e) => e.a === id || e.b === id)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <GroupFilter value={group} onChange={setGroup} />
        <label className="flex items-center gap-2 text-muted">Hide links under
          <Select value={String(min)} onChange={(e) => setMin(Number(e.target.value))} className="h-8">{[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
          shared passages</label>
        <span className="text-muted">Dot size = times applied. Line weight = passages shared. Codes with no link at this threshold are left out. Hover a code to isolate it.</span>
      </div>
      <div className="overflow-auto rounded-lg border border-line bg-surface">
        <svg viewBox="0 0 900 780" className="mx-auto block w-full max-w-4xl" role="img" aria-label="Network of codes that co-occur">
          {edges.map((e) => {
            const a = pos.get(e.a)!, b = pos.get(e.b)!
            const on = !hover || e.a === hover || e.b === hover
            return <path key={e.a + e.b} d={`M${a.x},${a.y} Q${cx0},${cy0} ${b.x},${b.y}`} fill="none" stroke="var(--accent)" strokeOpacity={on ? 0.25 + (e.n / maxEdge) * 0.6 : 0.05} strokeWidth={1 + (e.n / maxEdge) * 5}><title>{`${e.n} shared passages`}</title></path>
          })}
          {codes.map((c) => {
            const p = pos.get(c.id)!
            const u = uses.get(c.id) ?? 0
            const r = 4 + Math.sqrt(u / maxUse) * 10
            const on = !hover || hover === c.id || linked(hover).some((e) => e.a === c.id || e.b === c.id)
            const right = Math.cos(p.t) >= 0
            return (
              <g key={c.id} opacity={on ? 1 : 0.25} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)} className="cursor-default">
                <circle cx={p.x} cy={p.y} r={r} fill={c.color} stroke="var(--surface)" strokeWidth={2}><title>{`${c.name}: applied ${u} times`}</title></circle>
                {/* Labels radiate outwards along each dot's angle, so neighbours do not overlap. */}
                <text transform={`translate(${p.x},${p.y}) rotate(${(p.t * 180) / Math.PI + (right ? 0 : 180)})`} x={right ? r + 4 : -r - 4} y={3.5} textAnchor={right ? 'start' : 'end'} fontSize={10} fill="var(--muted)">{c.name.length > 32 ? c.name.slice(0, 31) + '…' : c.name}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function Terms({ project }: { project: Project }) {
  const [code, setCode] = useState('')
  const [source, setSource] = useState('')
  const [phrases, setPhrases] = useState(false)
  const sources = indexBy(project.sources)
  const terms = useMemo(() => {
    const texts = project.codings
      .filter((c) => c.status === 'accepted' && (!code || c.codeId === code) && (!source || c.sourceId === source))
      .map((c) => sources.get(c.sourceId)?.text.slice(c.start, c.end) ?? '')
    return (phrases ? topPhrases : topTerms)([...new Set(texts)], 30)
  }, [project.codings, code, source, sources, phrases])
  const max = Math.max(1, ...terms.map((t) => t[1]))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Select value={code} onChange={(e) => setCode(e.target.value)} className="h-8" aria-label="Code">
          <option value="">All coded passages</option>
          {orderedCodes(project).map(({ code: c }) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="h-8" aria-label="Source">
          <option value="">All sources</option>
          {project.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={phrases ? 'phrases' : 'words'} onChange={(e) => setPhrases(e.target.value === 'phrases')} className="h-8" aria-label="Words or phrases">
          <option value="words">Single words</option>
          <option value="phrases">Two-word phrases</option>
        </Select>
        <span className="text-muted">Most frequent {phrases ? 'two-word phrases' : 'words'} in the selected passages, with common and filler words removed.</span>
      </div>
      <Panel bodyClass="p-4">
        {terms.length === 0 ? <p className="text-sm text-muted">No words to show.</p> : (
          <ol className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {terms.map(([w, n]) => (
              <li key={w} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
                <Link to="/p/$projectId/retrieve" params={{ projectId: project.id }} search={{ q: w, codes: code || undefined }} className="truncate hover:text-accent">{w}</Link>
                <div className="h-2 rounded-r-[4px] bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                <span className="text-right text-xs tabular-nums text-muted">{n}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
