import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { Project } from '../../lib/types'
import { buildMatrix, mkey, patternOrder, type MatrixLevel, type MatrixRow } from '../../lib/matrix'
import type { Person } from '../../lib/positions'
import { Panel, Select, Swatch, cx } from '../../components/ui'
import { Caveat, useTip } from './Positions'
import { choiceColor } from './colors'
import { median } from '../../lib/positions'
import type { Claim } from '../../lib/claims'

type Show = 'people' | 'stance' | 'evidence' | 'passages' | 'share'
type Order = 'codebook' | 'pattern'

const SHOW_HELP: Record<Show, string> = {
  people: 'A dot where the person raised the code at least once. Counts people, not passages.',
  stance: "Each person's middle stance on the code, from supportive (blue) to opposed (red).",
  evidence: 'The strongest evidence each person gave: a full ball is documented, a quarter is opinion.',
  passages: 'Number of coded passages. Longer interviews have more of everything.',
  share: "Each person's passages on the code as a share of all their coded passages, so a talkative person does not dominate.",
}

/** Columns: every participant, or participants grouped by one attribute. */
interface Column { id: string; label: string; people: Person[] }

function attributesOf(project: Project, person: Person): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of person.sourceIds) Object.assign(out, project.sources.find((s) => s.id === id)?.attributes ?? {})
  Object.assign(out, project.cases.find((k) => k.id === person.id)?.attributes ?? {})
  return out
}

/**
 * Who raised what: codes (or code groups) down the side, participants or
 * groups of participants across the top. After MAXQDA's Code Matrix Browser
 * and NVivo's crosstab query, with people as the default unit.
 */
export function CodeMatrix({ project }: { project: Project }) {
  const [level, setLevel] = useState<MatrixLevel>('group')
  const [groupId, setGroupId] = useState('')
  const [show, setShow] = useState<Show>('people')
  const [order, setOrder] = useState<Order>('codebook')
  const [by, setBy] = useState('')
  const [hideEmpty, setHideEmpty] = useState(true)
  const navigate = useNavigate()
  const { box, show: tip, hide, layer } = useTip()
  const m = useMemo(() => buildMatrix(project, level, groupId), [project, level, groupId])

  const attrs = useMemo(() => new Map(m.people.map((p) => [p.id, attributesOf(project, p)])), [project, m.people])
  const choices = useMemo(() => {
    const names = [...new Set([...attrs.values()].flatMap((a) => Object.keys(a)))]
    return names.filter((name) => {
      const values = new Set([...attrs.values()].map((a) => a[name]?.trim()).filter(Boolean))
      return values.size >= 2 && values.size < m.people.length && !/\b(id|date|duration|min|status|reviewed|consent)\b/i.test(name)
    })
  }, [attrs, m.people.length])
  const columns: Column[] = useMemo(() => {
    if (!by || !choices.includes(by)) return m.people.map((p) => ({ id: p.id, label: p.label, people: [p] }))
    const groups = new Map<string, Person[]>()
    for (const p of m.people) { const v = attrs.get(p.id)?.[by]?.trim() || 'Not recorded'; groups.set(v, [...(groups.get(v) ?? []), p]) }
    return [...groups].sort((a, b) => (a[0] === 'Not recorded' ? 1 : b[0] === 'Not recorded' ? -1 : a[0].localeCompare(b[0]))).map(([v, ps]) => ({ id: v, label: v, people: ps }))
  }, [by, choices, m.people, attrs])
  const grouped = columns.some((c) => c.people.length > 1)

  const rows = (order === 'pattern' ? patternOrder(m) : m.rows).filter((r) => !hideEmpty || (m.reach.get(r.id) ?? 0) > 0)
  const cell = (row: MatrixRow, col: Column) => {
    const cs = col.people.map((p) => m.cells.get(mkey(row.id, p.id))!)
    const passages = cs.reduce((n, c) => n + c.claims.length, 0)
    const raised = cs.filter((c) => c.claims.length).length
    const total = col.people.reduce((n, p) => n + (m.totals.get(p.id) ?? 0), 0)
    return { passages, raised, of: col.people.length, share: total ? passages / total : 0, claims: cs.flatMap((c) => c.claims) }
  }
  const all = rows.flatMap((r) => columns.map((c) => cell(r, c)))
  const maxPassages = Math.max(1, ...all.map((c) => c.passages))
  const maxShare = Math.max(0.0001, ...all.map((c) => c.share))
  const groupsInScope = project.groups.filter((g) => g.kind !== 'evidence' && g.kind !== 'stance')

  const stanceCodes = useMemo(() => { const g = project.groups.find((x) => x.kind === 'stance'); return g ? project.codes.filter((c) => c.groupId === g.id) : [] }, [project])
  const gradeCodes = useMemo(() => { const g = project.groups.find((x) => x.kind === 'evidence'); return g ? project.codes.filter((c) => c.groupId === g.id) : [] }, [project])
  const stanceAt = new Map(stanceCodes.map((c, i) => [c.id, i]))
  const gradeAt = new Map(gradeCodes.map((c, i) => [c.id, i]))
  const middleStance = (claims: Claim[]) => median(claims.flatMap((c) => c.codings.map((x) => stanceAt.get(x.codeId)).filter((i): i is number => i !== undefined)))
  const bestGrade = (claims: Claim[]) => { const g = claims.flatMap((c) => c.codings.map((x) => gradeAt.get(x.codeId)).filter((i): i is number => i !== undefined)); return g.length ? Math.min(...g) : null }
  const short = (name: string) => name.trim().split(/\s{2,}/).join(' ')
  const fill = (t: number) => (t > 0 ? `color-mix(in oklab, var(--viz-seq) ${12 + t * 88}%, var(--surface))` : 'transparent')
  return (
    <Panel
      title="Who raised what"
      actions={<span className="text-xs text-muted">{SHOW_HELP[show]}</span>}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 text-xs text-muted">
        <label className="flex items-center gap-1.5">Rows
          <Select value={level} onChange={(e) => setLevel(e.target.value as MatrixLevel)} className="h-7 text-xs" aria-label="Rows">
            <option value="group">Code groups</option><option value="code">Codes</option>
          </Select>
        </label>
        {level === 'code' && (
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-7 text-xs" aria-label="Which codes">
            <option value="">All substantive codes</option>
            {groupsInScope.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        )}
        <label className="flex items-center gap-1.5">Columns
          <Select value={choices.includes(by) ? by : ''} onChange={(e) => setBy(e.target.value)} className="h-7 text-xs" aria-label="Columns">
            <option value="">Each participant</option>
            {choices.map((c) => <option key={c} value={c}>Grouped by {c}</option>)}
          </Select>
        </label>
        <div className="flex gap-0.5 rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="Show">
          {([['people', 'People'], ['stance', 'Stance'], ['evidence', 'Evidence'], ['passages', 'Passages'], ['share', 'Share of each person']] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={show === v} onClick={() => setShow(v)} className={cx('rounded px-2 py-1', show === v ? 'bg-surface font-medium text-ink shadow-sm' : '')}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5">Order
          <Select value={order} onChange={(e) => setOrder(e.target.value as Order)} className="h-7 text-xs" aria-label="Order rows">
            <option value="codebook">Codebook</option><option value="pattern">Most people first, alike together</option>
          </Select>
        </label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Hide rows nobody raised</label>
      </div>
      {(show === 'stance' || show === 'evidence') && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs text-muted">
          {show === 'stance'
            ? stanceCodes.map((c, i) => <span key={c.id} className="inline-flex items-center gap-1.5"><span className="block size-2.5 rounded-full" style={{ background: choiceColor('stance', i, stanceCodes.length) }} />{short(c.name)}</span>)
            : gradeCodes.map((c, i) => <span key={c.id} className="inline-flex items-center gap-1.5"><Harvey filled={(gradeCodes.length - i) / gradeCodes.length} />{short(c.name)}</span>)}
          <span className="inline-flex items-center gap-1.5"><span className="text-faint">–</span>raised, not {show === 'stance' ? 'given a stance' : 'graded'}</span>
        </div>
      )}
      <div ref={box} className="relative overflow-x-auto" onMouseLeave={hide}>
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">{level === 'group' ? 'Code group' : 'Code'}</th>
              {columns.map((c) => <th key={c.id} className="w-24 px-2 py-2 text-center font-medium">{c.label}{grouped && <span className="block font-normal text-faint">{c.people.length} {c.people.length === 1 ? 'person' : 'people'}</span>}</th>)}
              <th className="w-28 border-l border-line px-3 py-2 font-medium">People</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const reach = m.reach.get(row.id) ?? 0
              return (
                <tr key={row.id} className="border-b border-line/70 last:border-0">
                  <th className="max-w-[22rem] px-4 py-1 text-left font-normal" style={{ paddingLeft: `${1 + row.depth * 0.9}rem` }}>
                    <span className="flex items-center gap-2"><Swatch color={row.color} /><span className="truncate" title={row.name}>{row.name.replace(/\s{2,}/, ' ')}</span></span>
                  </th>
                  {columns.map((col) => {
                    const c = cell(row, col)
                    const label = `${row.name.replace(/\s{2,}/, ' ')} · ${col.label}`
                    const st = middleStance(c.claims)
                    const gr = bestGrade(c.claims)
                    const body = (
                      <>
                        <div className="font-semibold">{label}</div>
                        {grouped && <div className="mt-1">Raised by {c.raised} of {c.of} {c.of === 1 ? 'person' : 'people'}</div>}
                        <div className="mt-1 text-muted">{c.passages} passage{c.passages === 1 ? '' : 's'} · {Math.round(c.share * 100)}% of {grouped ? 'the group' : 'their'} coded passages</div>
                        {st !== null && <div className="mt-1">Middle stance: <b>{short(stanceCodes[Math.round(st)].name)}</b></div>}
                        {gr !== null && <div>Strongest evidence: <b>{short(gradeCodes[gr].name)}</b></div>}
                        {c.passages > 0 && <div className="mt-1 text-faint">Click to read them</div>}
                      </>
                    )
                    const t = show === 'people' ? c.raised / c.of : show === 'passages' ? c.passages / maxPassages : show === 'share' ? c.share / maxShare : 0
                    const glyph = show === 'stance'
                      ? (st === null ? (c.passages ? <span className="text-[10px] text-faint">–</span> : <span className="block size-1 rounded-full bg-line-strong" />) : <span className="block size-3 rounded-full" style={{ background: choiceColor('stance', Math.round(st), stanceCodes.length) }} />)
                      : gr === null ? (c.passages ? <span className="text-[10px] text-faint">–</span> : <span className="block size-1 rounded-full bg-line-strong" />) : <Harvey filled={(gradeCodes.length - gr) / gradeCodes.length} />
                    return (
                      <td key={col.id} className="p-0.5 text-center">
                        <button
                          type="button" disabled={!c.passages}
                          aria-label={`${label}: ${grouped ? `${c.raised} of ${c.of} people, ` : ''}${c.passages} passages`}
                          onMouseEnter={(e) => tip(e, body)} onFocus={(e) => tip(e, body)} onBlur={hide}
                          onClick={() => navigate({ to: '/p/$projectId/retrieve', params: { projectId: project.id }, search: { codes: row.codeIds.join(','), sources: col.people.flatMap((p) => p.sourceIds).join(',') } })}
                          className={cx('grid h-6 w-full place-items-center rounded-[3px] text-[11px] tabular-nums', t > 0.55 ? 'text-white' : 'text-muted', c.passages ? 'cursor-pointer' : 'cursor-default')}
                          style={{ background: (show === 'people' && !grouped) || show === 'stance' || show === 'evidence' ? 'transparent' : fill(t) }}
                        >
                          {show === 'stance' || show === 'evidence' ? glyph : show === 'people'
                            ? grouped ? (c.raised ? `${c.raised}/${c.of}` : '') : c.raised ? <span className="block size-2.5 rounded-full" style={{ background: 'var(--viz-seq)' }} /> : <span className="block size-1 rounded-full bg-line-strong" />
                            : show === 'passages' ? c.passages || '' : c.passages ? `${Math.round(c.share * 100)}%` : ''}
                        </button>
                      </td>
                    )
                  })}
                  <td className="border-l border-line px-3 py-1">
                    <span className="flex items-center gap-2 text-xs tabular-nums text-muted">
                      <span className="w-7 text-right text-ink">{reach}/{m.people.length}</span>
                      {/* One block per person who raised it, coloured by their middle stance and sorted supportive to opposed; grey blocks are people who did not. */}
                      <span className="flex gap-0.5" aria-hidden>{m.people.map((p) => middleStance(m.cells.get(mkey(row.id, p.id))!.claims) ?? (m.cells.get(mkey(row.id, p.id))!.claims.length ? -1 : 99)).sort((a, b) => a - b).map((v, i) => (
                        <span key={i} className="h-2.5 w-1.5 rounded-[1px]" style={{ background: v === 99 ? 'var(--line)' : v < 0 || !stanceCodes.length ? 'var(--muted)' : choiceColor('stance', Math.round(v), stanceCodes.length) }} />
                      ))}</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <p className="px-4 py-6 text-sm text-muted">Nothing coded in this selection yet.</p>}
        {layer}
      </div>
      <Caveat>
        With {m.people.length} participant{m.people.length === 1 ? '' : 's'}, read “People” first: a code raised by {Math.min(3, m.people.length)} of {m.people.length} people is a pattern to check, not a prevalence. Passage counts follow interview length and how finely the passages were cut; “Share of each person” corrects for length only. Claims still awaiting a decision are left out.
      </Caveat>
    </Panel>
  )
}

/** A Harvey ball: a circle filled by quarters, for an ordinal grade. */
function Harvey({ filled }: { filled: number }) {
  const r = 6, a = filled * 2 * Math.PI
  const x = 7 + r * Math.sin(a), y = 7 - r * Math.cos(a)
  return (
    <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
      <circle cx="7" cy="7" r={r} fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.2" />
      {filled >= 1 ? <circle cx="7" cy="7" r={r} fill="var(--ink)" /> : filled > 0 && <path d={`M7,7 L7,1 A${r},${r} 0 ${filled > 0.5 ? 1 : 0} 1 ${x},${y} Z`} fill="var(--ink)" />}
    </svg>
  )
}
