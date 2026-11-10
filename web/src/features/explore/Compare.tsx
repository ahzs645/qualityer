import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { Coding, Project } from '../../lib/types'
import { formatTime, indexBy, quotable, timeAt } from '../../lib/model'
import { choiceGroups, summariseDecisions } from '../../lib/claims'
import { compare, type Confusion } from '../../lib/compare'
import { Empty, Panel, Select, Stat, Swatch, cx, pct } from '../../components/ui'
import { codeKey } from '../review/Claims'

const SERIES = { both: 'var(--viz-speaker-1)', ref: 'var(--viz-human)', other: 'var(--viz-unchecked)' }

/**
 * Two questions about AI assistance. Where a person coded the same interview:
 * how does the AI's coding differ from theirs, passage by passage? And where a
 * person reviewed the AI's coding: what did they change?
 */
export function Compare({ project }: { project: Project }) {
  const pairs = useMemo(() => project.aiRuns.flatMap((r) => r.sourceIds
    .filter((sid) => project.codings.some((c) => c.sourceId === sid && !c.origin && c.status === 'accepted') && project.codings.some((c) => c.origin?.runId === r.id && c.sourceId === sid))
    .map((sid) => ({ run: r, sourceId: sid, key: `${r.id}|${sid}` }))), [project.aiRuns, project.codings])
  const [pick, setPick] = useState('')
  const cur = pairs.find((p) => p.key === pick) ?? pairs[0]
  const reviewed = project.sources.filter((s) => project.reviewLog.some((e) => e.sourceId === s.id && e.ai))

  if (!pairs.length && !reviewed.length) {
    return <Panel><Empty title="Nothing to compare yet">Run an AI pass over an interview a person has already coded to see where they differ, or review some AI-coded claims to see what review changes.</Empty></Panel>
  }
  return (
    <div className="space-y-6">
      {cur && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <h2 className="font-semibold">The AI against a person's coding</h2>
            <Select value={cur.key} onChange={(e) => setPick(e.target.value)} className="h-8 w-full min-w-0 sm:w-auto sm:max-w-xl" aria-label="Pass to compare">
              {pairs.map((p) => {
                const n = project.codings.filter((c) => c.origin?.runId === p.run.id && c.sourceId === p.sourceId).length
                return <option key={p.key} value={p.key}>{project.sources.find((s) => s.id === p.sourceId)?.name.split(' — ')[0]} · {p.run.model} · {new Date(p.run.startedAt).toLocaleString()} · {n} codings</option>
              })}
            </Select>
          </div>
          <Against project={project} runId={cur.run.id} sourceId={cur.sourceId} />
        </section>
      )}
      {reviewed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">What review changed</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{reviewed.map((s) => <Changed key={s.id} project={project} sourceId={s.id} />)}</div>
        </section>
      )}
    </div>
  )
}

function Against({ project, runId, sourceId }: { project: Project; runId: string; sourceId: string }) {
  const source = project.sources.find((s) => s.id === sourceId)!
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const groups = useMemo(() => indexBy(project.groups), [project.groups])
  const choices = useMemo(() => choiceGroups(project), [project.rules, project.groups, project.codes])
  const result = useMemo(() => {
    const ref = project.codings.filter((c) => c.sourceId === sourceId && !c.origin && c.status === 'accepted')
    const other = project.codings.filter((c) => c.sourceId === sourceId && c.origin?.runId === runId)
    return compare(project, ref, other, choices.map((c) => c.group.id))
  }, [project, runId, sourceId, choices])
  const [cell, setCell] = useState<{ groupId: string; ref: string; other: string } | null>(null)
  const sub = result.byKind.substantive
  const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
  const domains = result.byGroup.filter((g) => groups.get(g.groupId)?.kind === 'substantive')
  const maxDomain = Math.max(1, ...domains.map((g) => g.both + g.refOnly + g.otherOnly))
  const open = cell && result.confusions.find((c) => c.groupId === cell.groupId)
  const listed = open ? open.pairs.filter((p) => (p.ref?.codeId ?? '') === cell!.ref && (p.other?.codeId ?? '') === cell!.other) : []
  const name = (id: string) => (id ? codes.get(id)?.name.replace(/\s{2,}/, ' ') ?? '?' : 'nothing')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Substantive codes the AI also found" value={fmt(sub?.recall)} sub={`recall · of ${sub?.ref ?? 0} the person applied`} />
        <Stat label="AI substantive codes the person also had" value={fmt(sub?.precision)} sub={`precision · of ${sub?.other ?? 0} the AI applied`} />
        {result.confusions.map((c) => (
          <Stat key={c.groupId} label={`Same ${groups.get(c.groupId)?.name.replace(/^[A-Z]\s+/, '').toLowerCase()}`} value={c.compared ? pct(c.agree / c.compared) : '—'} sub={`${c.agree} of ${c.compared} passages both graded`} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {result.confusions.map((c) => <Matrix key={c.groupId} project={project} confusion={c} active={cell?.groupId === c.groupId ? cell : null} onPick={(ref, other) => setCell({ groupId: c.groupId, ref, other })} />)}
      </div>

      {cell && (
        <Panel title={`Person: ${name(cell.ref)} · AI: ${name(cell.other)} · ${listed.length} passage${listed.length === 1 ? '' : 's'}`} bodyClass="p-0" actions={<button type="button" className="text-xs text-accent hover:underline" onClick={() => setCell(null)}>Close</button>}>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto scroll-thin">
            {listed.map((p, i) => {
              const c = (p.ref ?? p.other) as Coding
              return (
                <li key={i}>
                  <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: sourceId, at: c.start, end: c.end }} className="block px-4 py-2.5 hover:bg-sunken/60">
                    <p className="font-serif text-[14.5px]">{quotable(project, source, c.start, c.end)}</p>
                    <p className="mt-0.5 text-xs text-muted"><span className="font-mono">{formatTime(timeAt(source, c.start))}</span>{p.other?.rationale ? ` · AI: ${p.other.rationale}` : ''}</p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <Panel title="By domain: substantive codes each applied">
        <div className="space-y-1.5">
          {domains.map((g) => {
            const total = g.both + g.refOnly + g.otherOnly
            const parts: [keyof typeof SERIES, number, string][] = [['both', g.both, 'both'], ['ref', g.refOnly, 'person only'], ['other', g.otherOnly, 'AI only']]
            return (
              <div key={g.groupId} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_auto]">
                <span className="truncate text-right text-muted" title={groups.get(g.groupId)?.name}>{groups.get(g.groupId)?.name}</span>
                <div className="flex h-3.5 gap-0.5" role="img" aria-label={`${groups.get(g.groupId)?.name}: ${g.both} both, ${g.refOnly} person only, ${g.otherOnly} AI only`} style={{ width: `${(total / maxDomain) * 100}%` }}>
                  {parts.map(([k, n, label]) => n > 0 && <span key={k} className="h-full rounded-[2px]" style={{ width: `${(n / total) * 100}%`, background: SERIES[k] }} title={`${n} ${label}`} />)}
                </div>
                <span className="w-24 text-right text-xs tabular-nums text-muted">{g.both} · {g.refOnly} · {g.otherOnly}</span>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><Swatch color={SERIES.both} />Both applied the code to overlapping passages</span>
          <span className="inline-flex items-center gap-1.5"><Swatch color={SERIES.ref} />Person only</span>
          <span className="inline-flex items-center gap-1.5"><Swatch color={SERIES.other} />AI only</span>
          <span className="ml-auto">Numbers on the right: both · person only · AI only</span>
        </div>
      </Panel>
    </div>
  )
}

function Matrix({ project, confusion, active, onPick }: { project: Project; confusion: Confusion; active: { ref: string; other: string } | null; onPick: (ref: string, other: string) => void }) {
  const codes = indexBy(project.codes)
  const group = project.groups.find((g) => g.id === confusion.groupId)
  const get = (r: string, o: string) => confusion.counts.get(r)?.get(o) ?? 0
  const ids = confusion.codeIds.filter((id) => id === '' || confusion.codeIds.some((o) => get(id, o) || get(o, id)))
  const max = Math.max(1, ...ids.flatMap((r) => ids.map((o) => get(r, o))))
  const label = (id: string) => (id ? codeKey(codes.get(id)?.name ?? '?') : 'none')
  return (
    <Panel title={`${group?.name ?? 'Group'}: person (rows) against AI (columns)`} className="min-w-0" bodyClass="overflow-x-auto p-4">
      <table className="border-separate border-spacing-[3px] text-sm">
        <thead>
          <tr><th />{ids.map((o) => <th key={o} className="w-14 pb-1 text-center text-xs font-medium text-muted" title={o ? codes.get(o)?.name : 'The AI coded nothing here'}>{label(o)}</th>)}</tr>
        </thead>
        <tbody>
          {ids.map((r) => (
            <tr key={r}>
              <th className="pr-2 text-right text-xs font-medium whitespace-nowrap text-muted" title={r ? codes.get(r)?.name : 'The person coded nothing here'}>{r ? codes.get(r)?.name.replace(/\s{2,}/, ' ') : 'none'}</th>
              {ids.map((o) => {
                const n = get(r, o)
                const on = active?.ref === r && active.other === o
                const diag = r === o && r !== ''
                if (r === '' && o === '') return <td key={o} />
                return (
                  <td key={o} className="p-0">
                    <button
                      type="button" disabled={!n} onClick={() => onPick(r, o)}
                      aria-label={`Person ${label(r)}, AI ${label(o)}: ${n} passages`}
                      className={cx('grid h-9 w-14 place-items-center rounded-[4px] tabular-nums', n / max > 0.5 ? 'text-white' : 'text-ink', on && 'ring-2 ring-ink', diag && 'font-semibold', !n && 'text-faint')}
                      style={{ background: n ? `color-mix(in oklab, var(--viz-seq) ${12 + (n / max) * 88}%, var(--surface))` : 'var(--sunken)', outline: diag ? '1.5px solid var(--line-strong)' : undefined, outlineOffset: diag ? 1 : undefined }}
                    >{n || ''}</button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Outlined cells are agreement. Each of the person's codings is paired with the AI coding in the same group that overlaps it most. Click a cell to read its passages.</p>
    </Panel>
  )
}

function Changed({ project, sourceId }: { project: Project; sourceId: string }) {
  const source = project.sources.find((s) => s.id === sourceId)!
  const codes = indexBy(project.codes)
  const sum = useMemo(() => summariseDecisions(project, sourceId), [project.reviewLog, sourceId])
  const bands = (['high', 'medium', 'low', 'none'] as const).filter((b) => sum.byBand[b].kept + sum.byBand[b].recoded + sum.byBand[b].rejected > 0)
  const parts = [['kept', 'var(--viz-checked)', 'Kept'], ['recoded', 'var(--viz-speaker-1)', 'Code changed'], ['rejected', 'var(--viz-unchecked)', 'Rejected']] as const
  return (
    <Panel title={source.name}>
      <p className="text-sm text-muted">{sum.total} AI codings reviewed: <span className="font-medium text-ink">{sum.kept} kept</span>, <span className="font-medium text-ink">{sum.recoded} changed</span>, <span className="font-medium text-ink">{sum.rejected} rejected</span>; {sum.added} added by the reviewer.</p>
      <div className="mt-3 space-y-1.5">
        {bands.map((b) => {
          const v = sum.byBand[b]
          const total = v.kept + v.recoded + v.rejected
          return (
            <div key={b} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-sm">
              <span className="text-right text-muted">{b === 'none' ? 'No confidence' : `${b[0].toUpperCase()}${b.slice(1)} confidence`}</span>
              <div className="flex h-3.5 gap-0.5" role="img" aria-label={`${b} confidence: ${v.kept} kept, ${v.recoded} changed, ${v.rejected} rejected`}>
                {parts.map(([k, color, label]) => v[k] > 0 && <span key={k} className="h-full rounded-[2px]" style={{ width: `${(v[k] / total) * 100}%`, background: color }} title={`${label}: ${v[k]} of ${total}`} />)}
              </div>
              <span className="text-right text-xs tabular-nums text-muted" title="Kept as proposed">{pct(v.kept / total)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">{parts.map(([k, color, label]) => <span key={k} className="inline-flex items-center gap-1.5"><Swatch color={color} />{label}</span>)}<span className="ml-auto">% kept as proposed</span></div>
      {sum.changes.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-faint uppercase">Most frequent corrections</h3>
          <ul className="space-y-0.5 text-sm">
            {sum.changes.slice(0, 8).map((c) => (
              <li key={c.fromId + c.toId} className="flex items-center gap-2"><span className="w-7 text-right font-medium tabular-nums">{c.n}</span><span className="text-muted">{codes.get(c.fromId)?.name.replace(/\s{2,}/, ' ') ?? '?'}</span><span aria-hidden>→</span><span>{codes.get(c.toId)?.name.replace(/\s{2,}/, ' ') ?? '?'}</span></li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
