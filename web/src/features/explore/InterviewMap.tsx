import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { CodeGroup, Project, Source } from '../../lib/types'
import { excerpt, formatTime, groupOf, indexBy, offsetAt, quotable, segmentsOf, speakerOf, timeAt } from '../../lib/model'
import { CLAIM_STATE_LABEL, buildClaims, type ClaimState } from '../../lib/claims'
import { COVERAGE_LABEL } from '../guide/coverage'
import { Panel, Select, Swatch, cx } from '../../components/ui'
import { STATE_COLOR, codeKey } from '../review/Claims'
import { choiceColor } from './colors'

type LaneKind = 'speakers' | 'guide' | 'codes' | 'grade' | 'review' | 'record'
const LANE_LABEL: Record<LaneKind, string> = {
  speakers: 'Who is speaking', guide: 'Guide questions', codes: 'Code groups', grade: 'Evidence and stance', review: 'Review state', record: 'Off the record',
}

interface Mark { start: number; end: number; color: string; tip: string; label?: string; outline?: boolean }
interface Lane { id: string; label: string; title?: string; marks: Mark[]; tall?: boolean }

/**
 * One interview from start to end as stacked lanes: who is speaking, where each
 * guide question was answered, what was coded per group, how it was graded and
 * how far review has got. A reading aid for finding your way around a long
 * transcript; every mark opens the passage.
 */
export function InterviewMap({ project }: { project: Project }) {
  const [on, setOn] = useState<Record<LaneKind, boolean>>({ speakers: true, guide: true, codes: true, grade: true, review: true, record: true })
  const [zoom, setZoom] = useState(1)
  const [sourceId, setSourceId] = useState('')
  const sources = project.sources.filter((s) => !sourceId || s.id === sourceId)
  const kinds = (Object.keys(LANE_LABEL) as LaneKind[]).filter((k) => (k !== 'guide' || project.guide.length > 0) && (k !== 'record' || project.restricted.length > 0))
  const choice = project.groups.filter((g) => g.kind === 'evidence' || g.kind === 'stance')
  const hasAi = project.codings.some((c) => c.origin && c.status === 'accepted') || project.codings.some((c) => c.status === 'suggested')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-8 max-w-64" aria-label="Source">
          <option value="">All interviews</option>
          {project.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Lanes">
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={on[k]} onClick={() => setOn({ ...on, [k]: !on[k] })} className={cx('h-7 rounded-md border px-2 text-xs', on[k] ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-muted hover:bg-sunken')}>{LANE_LABEL[k]}</button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">Zoom
          <Select value={String(zoom)} onChange={(e) => setZoom(Number(e.target.value))} className="h-7 text-xs">{[1, 2, 4, 8].map((z) => <option key={z} value={z}>{z}×</option>)}</Select>
        </label>
      </div>

      {sources.map((s) => <SourceMap key={s.id} project={project} source={s} on={on} zoom={zoom} />)}

      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-xs text-muted">
        {on.grade && choice.map((g) => (
          <span key={g.id} className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1"><span className="font-medium text-ink">{g.name}</span>
            {project.codes.filter((c) => c.groupId === g.id).map((c, i, all) => <span key={c.id} className="inline-flex items-center gap-1"><Swatch color={choiceColor(g.kind, i, all.length)} />{c.name.replace(/\s{2,}/, ' ')}</span>)}
          </span>
        ))}
        {on.review && hasAi && (
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1"><span className="font-medium text-ink">Review state</span>
            {(['checked', 'unchecked', 'pending', 'human'] as ClaimState[]).map((st) => <span key={st} className="inline-flex items-center gap-1"><Swatch color={STATE_COLOR[st]} />{CLAIM_STATE_LABEL[st]}</span>)}
          </span>
        )}
        {on.speakers && <span className="inline-flex flex-wrap items-center gap-x-2.5"><span className="font-medium text-ink">Speakers</span><span className="inline-flex items-center gap-1"><Swatch color="var(--viz-speaker-1)" />Respondent</span><span className="inline-flex items-center gap-1"><Swatch color="var(--viz-speaker-2)" />Interviewer</span><span className="inline-flex items-center gap-1"><Swatch color="var(--viz-speaker-3)" />Others</span></span>}
      </div>
    </div>
  )
}

function SourceMap({ project, source, on, zoom }: { project: Project; source: Source; on: Record<LaneKind, boolean>; zoom: number }) {
  const navigate = useNavigate()
  const [tip, setTip] = useState<string | null>(null)
  const len = Math.max(1, source.text.length)
  const lanes = useMemo(() => buildLanes(project, source, on), [project, source, on])
  const ticks = useMemo(() => {
    const segs = segmentsOf(source)
    const last = [...segs].reverse().find((g) => g.time != null)?.time
    if (last == null) return [0, 0.25, 0.5, 0.75].map((f) => ({ at: f, label: `${Math.round(f * 100)}%` }))
    const total = source.media?.duration ?? last
    const step = total > 5400 ? 1200 : total > 2400 ? 600 : total > 900 ? 300 : 120
    const out: { at: number; label: string }[] = []
    for (let t = 0; t <= total; t += step) { const o = t === 0 ? 0 : offsetAt(source, t); if (o != null) out.push({ at: o / len, label: formatTime(t) }) }
    return out
  }, [source, len])
  const notAsked = project.guide.filter((q) => project.coverage.some((c) => c.sourceId === source.id && c.questionId === q.id && c.status === 'not-asked'))
  const open = (m: Mark) => navigate({ to: '/p/$projectId/code', params: { projectId: project.id }, search: { source: source.id, at: m.start, end: m.end } })

  return (
    <Panel
      title={source.name}
      actions={notAsked.length > 0 && on.guide ? <span className="text-xs text-muted">Not asked: {notAsked.map((q) => q.key).join(', ')}</span> : undefined}
      bodyClass="p-0"
    >
      <div className="overflow-x-auto scroll-thin" onMouseLeave={() => setTip(null)}>
        <div className="grid grid-cols-[8.5rem_1fr] gap-x-2 px-4 py-3" style={{ minWidth: zoom > 1 ? `${zoom * 60}rem` : undefined }}>
          <span />
          <div className="relative mb-1 h-4 text-[10.5px] text-faint tabular-nums">
            {ticks.map((t) => <span key={t.label} className="absolute top-0 border-l border-line pl-1" style={{ left: `${t.at * 100}%` }}>{t.label}</span>)}
          </div>
          {lanes.map((lane) => (
            <LaneRow key={lane.id} lane={lane} len={len} ticks={ticks} onTip={setTip} onOpen={open} />
          ))}
        </div>
      </div>
      <p className="min-h-9 border-t border-line px-4 py-2 text-xs text-muted" role="status">{tip ?? 'Point at a mark to read it; click to open the passage in the transcript.'}</p>
    </Panel>
  )
}

function LaneRow({ lane, len, ticks, onTip, onOpen }: { lane: Lane; len: number; ticks: { at: number }[]; onTip: (t: string | null) => void; onOpen: (m: Mark) => void }) {
  return (
    <>
      <span className="truncate self-center text-right text-[11px] text-muted" title={lane.title ?? lane.label}>{lane.label}</span>
      <div className={cx('relative my-px rounded-sm bg-sunken', lane.tall ? 'h-5' : 'h-3.5')}>
        {ticks.slice(1).map((t, i) => <span key={i} aria-hidden className="absolute inset-y-0 w-px" style={{ left: `${t.at * 100}%`, background: 'var(--viz-grid)' }} />)}
        {lane.marks.map((m, i) => (
          <button
            key={i} type="button" aria-label={m.tip}
            onMouseEnter={() => onTip(m.tip)} onFocus={() => onTip(m.tip)} onClick={() => onOpen(m)}
            className={cx('absolute inset-y-0 overflow-hidden rounded-[2px] text-left text-[10px] leading-[18px] font-medium whitespace-nowrap hover:z-10 hover:ring-1 hover:ring-ink focus-visible:z-10', m.outline ? 'border border-line-strong bg-surface text-muted' : 'ring-1 ring-surface')}
            style={{ left: `${(m.start / len) * 100}%`, width: `max(${m.label ? '1.7rem' : '3px'}, ${((m.end - m.start) / len) * 100}%)`, background: m.outline ? undefined : m.color }}
          >
            {m.label && <span className="px-1">{m.label}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

function buildLanes(project: Project, source: Source, on: Record<LaneKind, boolean>): Lane[] {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const gOf = (codeId: string) => groupOf(codes.get(codeId), codes, groups)
  const at = (o: number) => { const t = timeAt(source, o); return t != null ? formatTime(t) + ' · ' : '' }
  const quote = (a: number, b: number) => `“${quotable(project, source, a, b).slice(0, 150)}”`
  const lanes: Lane[] = []

  if (on.speakers) {
    lanes.push({
      id: 'speakers', label: 'Speaker',
      marks: segmentsOf(source).filter((g) => g.speaker).map((g) => {
        const sp = speakerOf(source, g.speaker)
        const role = sp?.role ?? 'unknown'
        return {
          start: g.start, end: g.end,
          color: role === 'respondent' ? 'var(--viz-speaker-1)' : role === 'interviewer' ? 'var(--viz-speaker-2)' : 'var(--viz-speaker-3)',
          tip: `${at(g.start)}${sp?.name || g.speaker}${role !== 'unknown' ? ` (${role})` : ''}: ${excerpt(source.text, g.start, g.end).split(' ').length} words`,
        }
      }),
    })
  }
  if (on.guide && project.guide.length) {
    const qs = indexBy(project.guide)
    lanes.push({
      id: 'guide', label: 'Guide question', tall: true,
      marks: project.coverage.filter((c) => c.sourceId === source.id && c.start != null && c.end != null && qs.has(c.questionId)).map((c) => {
        const q = qs.get(c.questionId)!
        return { start: c.start!, end: c.end!, color: '', outline: true, label: q.key, tip: `${at(c.start!)}${q.key} ${q.title} — ${COVERAGE_LABEL[c.status]}${c.note ? `. ${c.note}` : ''}` }
      }).sort((a, b) => a.start - b.start),
    })
  }

  const claims = buildClaims(project, { sourceId: source.id })
  if (on.codes) {
    const byGroup = new Map<string, Mark[]>()
    for (const c of project.codings) {
      if (c.sourceId !== source.id || c.status !== 'accepted') continue
      const g = gOf(c.codeId)
      if (g && (g.kind === 'evidence' || g.kind === 'stance')) continue
      const k = g?.id ?? ''
      if (!byGroup.has(k)) byGroup.set(k, [])
      byGroup.get(k)!.push({ start: c.start, end: c.end, color: g?.color ?? '#888', tip: `${at(c.start)}${codes.get(c.codeId)?.name ?? 'Code'}: ${quote(c.start, c.end)}` })
    }
    const order: (CodeGroup | undefined)[] = [...project.groups, undefined]
    for (const g of order) {
      const marks = byGroup.get(g?.id ?? '')
      if (marks?.length) lanes.push({ id: 'g' + (g?.id ?? ''), label: g?.name ?? 'Ungrouped', marks })
    }
  }
  if (on.grade) {
    for (const g of project.groups.filter((x) => x.kind === 'evidence' || x.kind === 'stance')) {
      const opts = project.codes.filter((c) => c.groupId === g.id)
      const marks = project.codings.filter((c) => c.sourceId === source.id && c.status === 'accepted' && gOf(c.codeId)?.id === g.id).map((c) => {
        const i = opts.findIndex((o) => o.id === c.codeId)
        return { start: c.start, end: c.end, color: choiceColor(g.kind, i, opts.length), tip: `${at(c.start)}${codes.get(c.codeId)?.name.replace(/\s{2,}/, ' ')}: ${quote(c.start, c.end)}` }
      })
      if (marks.length) lanes.push({ id: 'c' + g.id, label: g.name, marks })
    }
  }
  if (on.review && claims.length) {
    lanes.push({
      id: 'review', label: 'Review state',
      marks: claims.map((c) => ({
        start: c.start, end: c.end, color: STATE_COLOR[c.state],
        tip: `${at(c.start)}${CLAIM_STATE_LABEL[c.state]} · ${c.codings.map((x) => codeKey(codes.get(x.codeId)?.name ?? '')).join(', ')}${c.issues.length ? ` · ${c.issues.join(', ')}` : ''}`,
      })),
    })
  }
  if (on.record) {
    const marks = project.restricted.filter((r) => r.sourceId === source.id).map((r) => ({ start: r.start, end: r.end, color: 'var(--ink)', tip: `${at(r.start)}${r.reason}: wording withheld from reports and exports` }))
    if (marks.length) lanes.push({ id: 'record', label: 'Off the record', marks })
  }
  return lanes
}
