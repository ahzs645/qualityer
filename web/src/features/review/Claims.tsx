import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, EyeOff, Play, Undo2, X } from 'lucide-react'
import type { Coding, Project, Source } from '../../lib/types'
import {
  GROUP_KIND_LABEL, formatTime, groupOf, indexBy, orderedCodes, segmentsOf, snapToSentence, speakerOf, timeAt, timeRange,
} from '../../lib/model'
import { CLAIM_STATE_LABEL, buildClaims, choiceGroups, codeKey, confidenceBand, stepEdge, type Claim, type ClaimState } from '../../lib/claims'

export { codeKey }
import {
  addToClaim, chooseInGroup, confirmClaim, recodeCoding, rejectClaim, removeReviewed, respanClaim, setClaimNote, setComparisonOnly, setRestricted,
} from '../../lib/review'
import { setExtraction } from '../../lib/actions'
import { undo, useProject } from '../../lib/store'
import { hasPlayer, playRange } from '../../lib/player'
import { Badge, Button, Empty, IconButton, Input, Kbd, Panel, Select, Swatch, Textarea, cx } from '../../components/ui'
import { CodeCard } from '../code/CodeCard'
import { AudioBar } from '../code/AudioBar'

type Queue = 'todo' | 'pending' | 'unchecked' | 'checked' | 'all'

const QUEUE_LABEL: Record<Queue, string> = {
  todo: 'Everything not yet checked by you',
  pending: 'Suggestions needing a decision',
  unchecked: 'Accepted, not checked by you',
  checked: 'Checked by you',
  all: 'All AI-coded claims',
}

export const STATE_COLOR: Record<ClaimState, string> = {
  pending: 'var(--viz-pending)', unchecked: 'var(--viz-unchecked)', checked: 'var(--viz-checked)', human: 'var(--viz-human)',
}

export function Claims() {
  const project = useProject()
  const [sourceId, setSourceId] = useState('')
  const [queue, setQueue] = useState<Queue>('todo')
  const [groupId, setGroupId] = useState('')
  const [band, setBand] = useState('')
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)

  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const groups = useMemo(() => indexBy(project.groups), [project.groups])
  const all = useMemo(() => buildClaims(project).filter((c) => c.ai), [project])
  const inScope = useMemo(() => all.filter((c) => !sourceId || c.sourceId === sourceId), [all, sourceId])
  const items = useMemo(() => inScope.filter((c) =>
    (queue === 'all' || (queue === 'todo' ? c.state !== 'checked' : c.state === queue)) &&
    (!groupId || c.codings.some((x) => groupOf(codes.get(x.codeId), codes, groups)?.id === groupId)) &&
    (!band || confidenceBand(c.confidence) === band) &&
    (!issuesOnly || c.issues.length > 0),
  ), [inScope, queue, groupId, band, issuesOnly, codes, groups])

  const found = sel ? items.findIndex((c) => c.key === sel) : -1
  const i = found >= 0 ? found : Math.min(idx, Math.max(0, items.length - 1))
  const claim: Claim | undefined = items[i]
  useEffect(() => {
    if (claim && (claim.key !== sel || i !== idx)) { setSel(claim.key); setIdx(i) }
  }, [claim?.key, i])

  const counts = { pending: 0, unchecked: 0, checked: 0 }
  for (const c of inScope) if (c.state !== 'human') counts[c.state]++
  const total = inScope.length
  const parked = project.aiRuns.filter((r) => r.comparisonOnly)
  const queued = project.aiRuns.filter((r) => !r.comparisonOnly && project.codings.some((c) => c.origin?.runId === r.id && c.status === 'suggested'))
  const go = (n: number) => { const t = items[Math.max(0, Math.min(items.length - 1, n))]; if (t) { setSel(t.key); setIdx(Math.max(0, Math.min(items.length - 1, n))) } }

  if (!all.length && !parked.length) {
    return <Panel><Empty title="No AI-coded claims yet">When an AI pass suggests codes, each passage appears here with everything proposed for it, so you can settle the substantive code, evidence grade and stance together.</Empty></Panel>
  }

  return (
    <div className="space-y-3">
      <Passes project={project} parked={parked} queued={queued} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-8 max-w-64" aria-label="Source">
          <option value="">All sources</option>
          {project.sources.filter((s) => all.some((c) => c.sourceId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={queue} onChange={(e) => setQueue(e.target.value as Queue)} className="h-8" aria-label="Queue">
          {(Object.keys(QUEUE_LABEL) as Queue[]).map((q) => <option key={q} value={q}>{QUEUE_LABEL[q]}</option>)}
        </Select>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-8 max-w-52" aria-label="Code group">
          <option value="">Any code group</option>
          {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Select value={band} onChange={(e) => setBand(e.target.value)} className="h-8" aria-label="Confidence">
          <option value="">Any confidence</option>
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> Rule issues only</label>
      </div>

      {total > 0 && (
        <div>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Review progress: ${counts.checked} checked, ${counts.unchecked} accepted but not checked, ${counts.pending} needing a decision`}>
            {(['checked', 'unchecked', 'pending'] as const).map((s) => counts[s] > 0 && <div key={s} style={{ width: `${(counts[s] / total) * 100}%`, background: STATE_COLOR[s] }} />)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(['checked', 'unchecked', 'pending'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5"><Swatch color={STATE_COLOR[s]} /><span className="font-medium text-ink tabular-nums">{counts[s]}</span> {CLAIM_STATE_LABEL[s].toLowerCase()}</span>
            ))}
            <span className="ml-auto tabular-nums">{items.length} of {total} claims in this queue</span>
          </div>
        </div>
      )}

      {!claim ? (
        <Panel><Empty icon={<Check size={26} className="text-good" />} title={total ? 'Nothing left in this queue' : 'No AI-coded claims here'}>{total ? 'Switch the queue to “All AI-coded claims” to revisit decisions, or open the decision log.' : 'Suggestions kept for comparison only are not queued for review.'}</Empty></Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
          <QueueList project={project} items={items} current={claim.key} onPick={(k) => go(items.findIndex((c) => c.key === k))} />
          <ClaimCard
            key={claim.key}
            project={project}
            claim={claim}
            position={`${i + 1} of ${items.length}`}
            onPrev={i > 0 ? () => go(i - 1) : undefined}
            onNext={i < items.length - 1 ? () => go(i + 1) : undefined}
            onMoved={(k) => setSel(k)}
            staysAfterConfirm={queue === 'all' || queue === 'checked'}
          />
        </div>
      )}
    </div>
  )
}

function Passes({ project, parked, queued }: { project: Project; parked: Project['aiRuns']; queued: Project['aiRuns'] }) {
  if (!parked.length && !queued.length) return null
  const sources = indexBy(project.sources)
  const row = (r: Project['aiRuns'][number], isParked: boolean) => {
    const n = project.codings.filter((c) => c.origin?.runId === r.id && c.status === 'suggested').length
    const humanCoded = r.sourceIds.some((id) => project.codings.some((c) => c.sourceId === id && !c.origin && c.status === 'accepted'))
    return (
      <li key={r.id} className="flex flex-wrap items-center gap-2 py-1 text-sm">
        <span className="font-medium">{r.sourceIds.map((id) => sources.get(id)?.name.split(' — ')[0] ?? '?').join(', ')}</span>
        <span className="text-muted">{r.model} · {new Date(r.startedAt).toLocaleDateString()} · {n} unreviewed</span>
        {isParked ? <Badge>comparison only</Badge> : humanCoded && <Badge tone="warn">source already coded by a person</Badge>}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setComparisonOnly(r.id, !isParked)}>{isParked ? 'Return to the review queue' : 'Keep for comparison only'}</Button>
      </li>
    )
  }
  return (
    <details className="rounded-lg border border-line bg-surface px-4 py-2" open={queued.some((r) => r.sourceIds.some((id) => project.codings.some((c) => c.sourceId === id && !c.origin && c.status === 'accepted')))}>
      <summary className="cursor-pointer text-sm font-medium">AI passes <span className="font-normal text-muted">· {queued.length} in review{parked.length ? `, ${parked.length} kept for comparison only` : ''}</span></summary>
      <p className="mt-1 text-xs text-muted">A pass run over an interview you had already coded is a calibration check, not new coding. Keep it for comparison only and its suggestions leave this queue but stay available under Explore → AI and you.</p>
      <ul className="mt-1 divide-y divide-line">{queued.map((r) => row(r, false))}{parked.map((r) => row(r, true))}</ul>
    </details>
  )
}

function QueueList({ project, items, current, onPick }: { project: Project; items: Claim[]; current: string; onPick: (key: string) => void }) {
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const groups = useMemo(() => indexBy(project.groups), [project.groups])
  const sources = useMemo(() => indexBy(project.sources), [project.sources])
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => { ref.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }) }, [current])
  return (
    <ol ref={ref} className="hidden max-h-[calc(100vh-17rem)] divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface scroll-thin lg:block" aria-label="Claims in this queue">
      {items.map((c) => {
        const src = sources.get(c.sourceId)
        const main = c.codings.find((x) => groupOf(codes.get(x.codeId), codes, groups)?.kind === 'substantive') ?? c.codings[0]
        const tags = c.codings.filter((x) => ['evidence', 'stance'].includes(groupOf(codes.get(x.codeId), codes, groups)?.kind ?? '')).map((x) => codeKey(codes.get(x.codeId)?.name ?? ''))
        const t = src ? timeAt(src, c.start) : null
        return (
          <li key={c.key}>
            <button type="button" aria-current={c.key === current} onClick={() => onPick(c.key)} className={cx('flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-sunken/60', c.key === current && 'bg-accent-soft')}>
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: STATE_COLOR[c.state] }} title={CLAIM_STATE_LABEL[c.state]} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{codes.get(main.codeId)?.name ?? 'Deleted code'}</span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="font-mono">{t != null ? formatTime(t) : ''}</span>
                  <span>{tags.join(' · ')}</span>
                  {c.issues.length > 0 && <AlertTriangle size={11} className="text-warn" />}
                  {c.restricted && <EyeOff size={11} />}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function ClaimCard({ project, claim, position, onPrev, onNext, onMoved, staysAfterConfirm }: {
  project: Project; claim: Claim; position: string; onPrev?: () => void; onNext?: () => void; onMoved: (key: string) => void; staysAfterConfirm: boolean
}) {
  const source = project.sources.find((s) => s.id === claim.sourceId) as Source
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const groups = useMemo(() => indexBy(project.groups), [project.groups])
  const choices = useMemo(() => choiceGroups(project), [project.rules, project.groups, project.codes])
  const choiceIds = new Set(choices.map((c) => c.group.id))
  const gOf = (c: Coding) => groupOf(codes.get(c.codeId), codes, groups)
  const span = { start: claim.start, end: claim.end }
  const others = claim.codings.filter((c) => !choiceIds.has(gOf(c)?.id ?? ''))
  const flags = claim.codings.filter((c) => gOf(c)?.kind === 'flag')
  const [focus, setFocus] = useState<string | null>(null)
  const [wide, setWide] = useState(false)
  const focusCode = codes.get(focus ?? others[0]?.codeId ?? claim.codings[0]?.codeId)
  const seg = segmentsOf(source).find((g) => g.start <= claim.start && g.end >= claim.end) ?? segmentsOf(source).find((g) => g.start <= claim.start && g.end > claim.start)
  const lo = seg?.start ?? 0, hi = seg?.end ?? source.text.length
  const speaker = seg ? speakerOf(source, seg.speaker)?.name || seg.speaker : ''
  const t = timeAt(source, claim.start)
  const pad = wide ? 4000 : 320
  const from = Math.max(lo, claim.start - pad), to = Math.min(hi, claim.end + pad)
  const restriction = project.restricted.find((r) => r.sourceId === claim.sourceId && r.start < claim.end && r.end > claim.start)
  const note = claim.codings.find((c) => c.memo)?.memo ?? ''
  const [draft, setDraft] = useState(note)
  const nearby = project.codings.filter((c) => c.sourceId === claim.sourceId && c.start < claim.end && c.end > claim.start && !(c.start === claim.start && c.end === claim.end) && c.status === 'accepted')
  /** The code the AI first proposed for a coding, before any change in review. */
  const proposed = (c: Coding) => (c.origin ? project.reviewLog.find((e) => e.codingId === c.id && e.ai)?.codeId ?? c.codeId : null)

  // Number keys pick within the choice groups: 1–4 for the first group, then on.
  const keyed: { key: string; groupId: string; codeId: string }[] = []
  for (const g of choices) for (const c of g.codes) if (keyed.length < 9) keyed.push({ key: String(keyed.length + 1), groupId: g.group.id, codeId: c.id })

  const move = (next: { start: number; end: number }) => {
    if (next.end <= next.start) return
    respanClaim(claim.sourceId, span, next)
    onMoved(`${claim.sourceId}:${next.start}:${next.end}`)
  }
  const confirm = () => { confirmClaim(claim.sourceId, span); if (staysAfterConfirm) onNext?.() }
  // A rejected claim's codings are deleted, so its note goes to the decision log instead.
  const reject = () => rejectClaim(claim.sourceId, span, draft.trim() || undefined)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = keyed.find((x) => x.key === e.key)
      if (k) { e.preventDefault(); chooseInGroup(claim.sourceId, span, k.groupId, k.codeId) }
      else if (e.key === 'Enter') { e.preventDefault(); confirm() }
      else if (e.key === 'x') { e.preventDefault(); reject() }
      else if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); onNext?.() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev?.() }
      else if (e.key === 'Backspace') { e.preventDefault(); undo() }
      else if (e.key === 'p' && hasPlayer()) { const r = timeRange(source, claim.start, claim.end); if (r) playRange(r[0], r[1]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const sentence = snapToSentence(source.text, claim.start, claim.end)
  const edge = (which: 'start' | 'end', dir: -1 | 1) => {
    const p = stepEdge(source.text, which === 'start' ? claim.start : claim.end, which, dir, lo, hi)
    move(which === 'start' ? { start: p, end: claim.end } : { start: claim.start, end: p })
  }

  return (
    <>
      <article className="min-w-0 rounded-lg border border-line bg-surface">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink"><span className="size-2 rounded-full" style={{ background: STATE_COLOR[claim.state] }} />{CLAIM_STATE_LABEL[claim.state]}</span>
          <span>{source.name.split(' — ')[0]}</span>
          {speaker && speaker !== source.name.split(' — ')[0] && <span>· {speaker}</span>}
          {t != null && <span className="font-mono">{formatTime(t)}</span>}
          {claim.confidence != null && <Badge tone={claim.confidence >= 0.9 ? 'good' : claim.confidence >= 0.6 ? 'accent' : 'warn'}>{confidenceBand(claim.confidence)} confidence</Badge>}
          {claim.codings.some((c) => c.origin?.match === 'repaired') && <Badge tone="warn">quote repaired</Badge>}
          <span className="ml-auto flex items-center gap-1 tabular-nums">
            {position}
            <IconButton label="Previous claim (←)" disabled={!onPrev} onClick={onPrev}><ChevronLeft size={15} /></IconButton>
            <IconButton label="Next claim (space)" disabled={!onNext} onClick={onNext}><ChevronRight size={15} /></IconButton>
          </span>
        </header>

        <div className="space-y-4 p-5">
          <div>
            <p className={cx('font-serif text-[16px] leading-relaxed whitespace-pre-wrap', wide && 'max-h-80 overflow-y-auto scroll-thin')}>
              <span className="text-faint">{from > lo ? '…' : ''}{source.text.slice(from, claim.start)}</span>
              <mark className={cx('rounded-sm px-0.5 text-ink', restriction ? 'bg-warn-soft' : 'bg-accent-soft')}>{source.text.slice(claim.start, claim.end)}</mark>
              <span className="text-faint">{source.text.slice(claim.end, to)}{to < hi ? '…' : ''}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-0.5">Start
                <IconButton label="Start one word earlier" className="size-6" onClick={() => edge('start', -1)}><ChevronLeft size={13} /></IconButton>
                <IconButton label="Start one word later" className="size-6" onClick={() => edge('start', 1)}><ChevronRight size={13} /></IconButton>
              </span>
              <span className="inline-flex items-center gap-0.5">End
                <IconButton label="End one word earlier" className="size-6" onClick={() => edge('end', -1)}><ChevronLeft size={13} /></IconButton>
                <IconButton label="End one word later" className="size-6" onClick={() => edge('end', 1)}><ChevronRight size={13} /></IconButton>
              </span>
              {(sentence[0] !== claim.start || sentence[1] !== claim.end) && <button type="button" className="text-accent hover:underline" onClick={() => move({ start: sentence[0], end: sentence[1] })}>Whole sentence</button>}
              {(from > lo || to < hi || wide) && <button type="button" className="text-accent hover:underline" onClick={() => setWide(!wide)}>{wide ? 'Less context' : 'Whole turn'}</button>}
              {source.media && <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => { const r = timeRange(source, claim.start, claim.end); if (r) playRange(r[0], r[1]) }}><Play size={11} /> Play passage <Kbd>P</Kbd></button>}
              <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: claim.sourceId, at: claim.start, end: claim.end }} className="ml-auto text-accent hover:underline">Open in transcript</Link>
            </div>
          </div>

          <section aria-label="Codes on this claim">
            <ul className="space-y-1">
              {others.map((c) => {
                const code = codes.get(c.codeId)
                const was = proposed(c)
                return (
                  <li key={c.id} className="rounded-md border border-line px-2.5 py-1.5" onMouseEnter={() => setFocus(c.codeId)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Swatch color={code?.color ?? '#888'} />
                      <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => setFocus(c.codeId)} onFocus={() => setFocus(c.codeId)}>{code?.name ?? 'Deleted code'}</button>
                      {c.status === 'suggested' ? <Badge tone="warn">suggested</Badge> : !c.origin ? <Badge>added by {c.coder}</Badge> : was && was !== c.codeId ? <Badge tone="accent">changed from {codeKey(codes.get(was)?.name ?? '?')}</Badge> : null}
                      <Select value="" onChange={(e) => e.target.value && recodeCoding(c.id, e.target.value)} className="h-7 w-28 text-xs" aria-label={`Change ${code?.name ?? 'code'} to another code`}>
                        <option value="">Change to…</option>
                        <CodeOptions project={project} skip={choiceIds} />
                      </Select>
                      <IconButton label={`Remove ${code?.name ?? 'code'} from this claim`} onClick={() => { setFocus(null); removeReviewed(c.id) }}><X size={14} /></IconButton>
                    </div>
                    {c.rationale && <p className="mt-0.5 pl-4.5 text-xs text-muted"><span className="font-medium">AI: </span>{c.rationale}</p>}
                  </li>
                )
              })}
            </ul>
            <Select value="" onChange={(e) => e.target.value && addToClaim(claim.sourceId, span, e.target.value)} className="mt-1.5 h-7 text-xs" aria-label="Add a code to this claim">
              <option value="">+ Add a code…</option>
              <CodeOptions project={project} skip={choiceIds} />
            </Select>
          </section>

          {choices.map(({ group, codes: opts, required }) => {
            const here = claim.codings.filter((c) => gOf(c)?.id === group.id)
            const ai = new Set(here.map(proposed).filter(Boolean))
            return (
              <section key={group.id} aria-label={group.name}>
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted">
                  {group.name}
                  {required && here.length === 0 && <span className="text-warn">required</span>}
                  {here.length > 1 && <span className="text-warn">{here.length} set — pick one</span>}
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={group.name}>
                  {opts.map((o) => {
                    const on = here.some((c) => c.codeId === o.id)
                    const k = keyed.find((x) => x.codeId === o.id)?.key
                    return (
                      <button
                        key={o.id} type="button" role="radio" aria-checked={on}
                        onClick={() => chooseInGroup(claim.sourceId, span, group.id, o.id)}
                        onMouseEnter={() => setFocus(o.id)} onFocus={() => setFocus(o.id)}
                        className={cx('inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[13px]', on ? 'border-accent bg-accent-soft font-medium text-ink' : 'border-line-strong text-muted hover:bg-sunken hover:text-ink')}
                      >
                        {k && <Kbd>{k}</Kbd>}
                        {o.name.replace(/\s{2,}/, ' ')}
                        {ai.has(o.id) && <span className={cx('rounded px-1 text-[10px] font-semibold', on ? 'bg-accent text-accent-ink' : 'bg-sunken text-muted')} title="The AI's suggestion">AI</span>}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {flags.map((c) => {
            const row = project.extractions.find((e) => e.codingId === c.id)
            return (
              <section key={c.id} className="rounded-md bg-sunken px-3 py-2">
                <div className="mb-1.5 text-xs font-medium">Extraction row · {codes.get(c.codeId)?.name}</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {project.extractionFields.map((f) => (
                    <label key={f} className="block text-xs text-muted">{f}
                      <Input className="h-7 text-[13px]" defaultValue={row?.values[f] ?? ''} onBlur={(e) => { if ((row?.values[f] ?? '') !== e.target.value) setExtraction(c.id, { ...(row?.values ?? {}), [f]: e.target.value }) }} />
                    </label>
                  ))}
                </div>
              </section>
            )
          })}

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block text-xs font-medium text-muted">Reviewer note
              <Textarea key={claim.key + note.length} rows={2} className="mt-1 text-[13px] font-normal" placeholder="VERIFY: what to check against the recording. NOTE: why you decided this way." defaultValue={note} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => setClaimNote(claim.sourceId, span, e.target.value)} />
            </label>
            <label className="flex items-start gap-2 self-end rounded-md border border-line px-2.5 py-2 text-xs text-muted sm:max-w-52">
              <input type="checkbox" className="mt-0.5" checked={!!restriction} onChange={(e) => setRestricted(claim.sourceId, restriction ? { start: restriction.start, end: restriction.end } : span, e.target.checked ? 'Off the record' : null)} />
              <span><span className="font-medium text-ink">Off the record</span><br />Keep the code, withhold the wording from reports and exports.</span>
            </label>
          </div>

          {claim.issues.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn"><AlertTriangle size={14} />{claim.issues.join(' · ')}</p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <Button variant="primary" icon={<Check size={14} />} onClick={confirm} disabled={claim.state === 'checked'}>{claim.state === 'pending' ? 'Accept claim' : 'Confirm claim'} <Kbd>↵</Kbd></Button>
          <Button variant="danger" icon={<X size={14} />} onClick={reject}>Reject claim <Kbd>X</Kbd></Button>
          <Button variant="ghost" icon={<Undo2 size={14} />} onClick={undo}>Undo <Kbd>⌫</Kbd></Button>
          <span className="ml-auto text-xs text-muted"><Kbd>Space</Kbd> next · <Kbd>←</Kbd> back · number keys set grade and stance</span>
        </footer>
        {source.media && <AudioBar projectId={project.id} source={source} codings={claim.codings} codes={codes} focusCodeId={null} />}
      </article>

      <aside className="space-y-3 lg:col-start-2 xl:col-start-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          {focusCode ? <CodeCard code={focusCode} /> : <p className="text-sm text-muted">Point at a code to see its definition.</p>}
        </div>
        {nearby.length > 0 && (
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-faint uppercase">Also coded on overlapping passages</h3>
            <ul className="space-y-1 text-[13px]">
              {[...new Map(nearby.map((c) => [`${c.codeId}|${c.coder}`, c])).values()].slice(0, 14).map((c) => (
                <li key={c.id} className="flex items-center gap-2"><Swatch color={codes.get(c.codeId)?.color ?? '#888'} /><span className="min-w-0 flex-1 truncate">{codes.get(c.codeId)?.name}</span><span className="shrink-0 text-xs text-faint">{c.origin ? 'AI' : c.coder}</span></li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </>
  )
}

function CodeOptions({ project, skip }: { project: Project; skip: Set<string> }) {
  const list = useMemo(() => orderedCodes(project), [project.codes, project.groups])
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const groups = useMemo(() => indexBy(project.groups), [project.groups])
  const byGroup = new Map<string, typeof list>()
  for (const x of list) {
    const g = groupOf(x.code, codes, groups)
    if (g && skip.has(g.id)) continue
    const k = g?.id ?? ''
    if (!byGroup.has(k)) byGroup.set(k, [])
    byGroup.get(k)!.push(x)
  }
  return (
    <>
      {[...byGroup].map(([gid, items]) => {
        const g = groups.get(gid)
        return (
          <optgroup key={gid} label={g ? `${g.name}${g.kind !== 'substantive' ? ` · ${GROUP_KIND_LABEL[g.kind]}` : ''}` : 'Ungrouped'}>
            {items.map(({ code, depth }) => <option key={code.id} value={code.id}>{'  '.repeat(depth)}{code.name}</option>)}
          </optgroup>
        )
      })}
    </>
  )
}
