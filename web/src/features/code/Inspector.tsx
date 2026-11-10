import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Lightbulb, Pencil, Star, Trash2, X } from 'lucide-react'
import type { CoverageStatus, Project, Source, SourceStatus } from '../../lib/types'
import {
  checkRules, excerpt, formatTime, groupOf, indexBy, rawSpeakers, snapToSentence, timeAt,
} from '../../lib/model'
import {
  addCandidate, addMemo, editPassage, removeCoding, resizeSpan, setCoverage, setExtraction, updateCoding, updateMemo, updateSource,
} from '../../lib/actions'
import { Badge, Button, IconButton, Input, Select, Swatch, Textarea, cx } from '../../components/ui'
import { CodeCard } from './CodeCard'
import { COVERAGE_LABEL } from '../guide/coverage'

interface SpanProps {
  project: Project
  source: Source
  span: { start: number; end: number }
  onClose: () => void
  onCode: () => void
}

export function SpanInspector({ project, source, span, onClose, onCode }: SpanProps) {
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const groups = useMemo(() => indexBy(project.groups), [project.groups])
  const here = project.codings.filter((c) => c.sourceId === source.id && c.start === span.start && c.end === span.end)
  const overlapping = project.codings.filter(
    (c) => c.sourceId === source.id && c.start < span.end && c.end > span.start && !(c.start === span.start && c.end === span.end) && c.status === 'accepted',
  )
  const issues = checkRules(project, source.id).filter((v) => v.start === span.start && v.end === span.end)
  const memo = project.memos.find((m) => m.sourceId === source.id && m.start === span.start && m.end === span.end)
  const text = source.text.slice(span.start, span.end)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [candidate, setCandidate] = useState('')
  const [question, setQuestion] = useState('')
  const flagCodings = here.filter((c) => groupOf(codes.get(c.codeId), codes, groups)?.kind === 'flag')
  const sentence = snapToSentence(source.text, span.start, span.end)
  const canSnap = (sentence[0] !== span.start || sentence[1] !== span.end) && here.length > 0

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-muted">Selected passage {formatTime(timeAt(source, span.start)) && `· ${formatTime(timeAt(source, span.start))}`}</div>
          <div className="text-xs text-faint">{span.end - span.start} characters</div>
        </div>
        <IconButton label="Close passage" onClick={onClose}><X size={15} /></IconButton>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} className="font-serif" />
          <p className="text-xs text-muted">Corrects the transcript wording. Codes and memos on this passage stay attached.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => { editPassage(source.id, span.start, span.end, draft); setEditing(false); onClose() }}>Save wording</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <blockquote className="relative rounded-md border-l-2 border-accent bg-sunken px-3 py-2 font-serif text-[15px] leading-relaxed">
          {excerpt(source.text, span.start, span.end).slice(0, 600)}
          <button type="button" onClick={() => { setDraft(text); setEditing(true) }} className="absolute top-1 right-1 rounded p-1 text-faint hover:bg-surface hover:text-ink" title="Correct the wording">
            <Pencil size={13} />
          </button>
        </blockquote>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Codes on this passage</h3>
          <Button size="sm" variant="primary" onClick={onCode}>Code…</Button>
        </div>
        {here.length === 0 ? (
          <p className="text-sm text-muted">None yet. Press <span className="font-medium">Code…</span> or pick from the codebook.</p>
        ) : (
          <ul className="space-y-1">
            {here.map((c) => {
              const code = codes.get(c.codeId)
              return (
                <li key={c.id} className="group rounded-md border border-line px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <Swatch color={code?.color ?? '#888'} />
                    <span className="min-w-0 flex-1 truncate text-sm" title={code?.definition}>{code?.name ?? 'Deleted code'}</span>
                    {c.status === 'suggested' && <Badge tone="accent">suggested</Badge>}
                    <IconButton label={c.important ? 'Unmark key passage' : 'Mark as key passage'} onClick={() => updateCoding(c.id, { important: !c.important })}>
                      <Star size={14} className={c.important ? 'fill-warn text-warn' : ''} />
                    </IconButton>
                    <IconButton label="Remove code" onClick={() => removeCoding(c.id)}><Trash2 size={14} /></IconButton>
                  </div>
                  {c.coder !== project.coder && <div className="pl-4.5 text-xs text-muted">by {c.coder}</div>}
                </li>
              )
            })}
          </ul>
        )}
        {canSnap && (
          <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => resizeSpan(source.id, span, { start: sentence[0], end: sentence[1] })}>
            Extend these codes to the whole sentence
          </button>
        )}
      </section>

      {issues.length > 0 && (
        <section className="rounded-md bg-warn-soft px-3 py-2">
          {issues.map((v, i) => (
            <p key={i} className="flex items-center gap-1.5 text-sm text-warn"><AlertTriangle size={14} /> {v.message}</p>
          ))}
        </section>
      )}
      {here.length > 0 && issues.length === 0 && project.rules.some((r) => r.enabled) && (
        <p className="flex items-center gap-1.5 text-sm text-good"><CheckCircle2 size={14} /> Meets the codebook rules</p>
      )}

      {flagCodings.map((c) => {
        const row = project.extractions.find((e) => e.codingId === c.id)
        return (
          <section key={c.id} className="space-y-2">
            <h3 className="text-sm font-semibold">Extraction · {codes.get(c.codeId)?.name}</h3>
            {project.extractionFields.map((f) => (
              <label key={f} className="block">
                <span className="text-xs text-muted">{f}</span>
                <Input defaultValue={row?.values[f] ?? ''} onBlur={(e) => {
                  if ((row?.values[f] ?? '') !== e.target.value) setExtraction(c.id, { ...(row?.values ?? {}), [f]: e.target.value })
                }} />
              </label>
            ))}
          </section>
        )
      })}

      {overlapping.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Overlapping codes</h3>
          <ul className="flex flex-wrap gap-1">
            {[...new Set(overlapping.map((c) => c.codeId))].map((id) => (
              <li key={id}><Badge><Swatch color={codes.get(id)?.color ?? '#888'} />{codes.get(id)?.name}</Badge></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-sm font-semibold">Memo</h3>
        <Textarea
          key={memo?.id ?? 'new'}
          rows={3}
          placeholder="What is going on here? Why does it matter?"
          defaultValue={memo?.body ?? ''}
          onBlur={(e) => {
            const body = e.target.value
            if (memo) { if (body !== memo.body) updateMemo(memo.id, { body }) }
            else if (body.trim()) addMemo({ title: excerpt(source.text, span.start, span.end).slice(0, 60), body, sourceId: source.id, start: span.start, end: span.end })
          }}
        />
      </section>

      {project.guide.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Answers a guide question</h3>
          <div className="flex gap-2">
            <Select value={question} onChange={(e) => setQuestion(e.target.value)} className="min-w-0 flex-1">
              <option value="">Choose…</option>
              {project.guide.map((q) => <option key={q.id} value={q.id}>{q.key} — {q.title}</option>)}
            </Select>
            <Button size="sm" disabled={!question} onClick={() => { setCoverage(source.id, question, { status: 'answered', start: span.start, end: span.end }); setQuestion('') }}>Link</Button>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Lightbulb size={14} /> Candidate code</h3>
        <p className="mb-2 text-xs text-muted">Doesn't fit the codebook? Log it for the reconciliation meeting instead of creating a code mid-interview.</p>
        <div className="flex gap-2">
          <Input value={candidate} onChange={(e) => setCandidate(e.target.value)} placeholder="Proposed code name" />
          <Button size="sm" disabled={!candidate.trim()} onClick={() => { addCandidate({ name: candidate.trim(), sourceId: source.id, start: span.start, end: span.end }); setCandidate('') }}>Log</Button>
        </div>
      </section>
    </div>
  )
}

const STATUSES: SourceStatus[] = ['new', 'reading', 'coding', 'done']

export function SourceInspector({ project, source, focusCodeId, onJump }: { project: Project; source: Source; focusCodeId: string | null; onJump: (o: { start: number; end: number }) => void }) {
  const issues = useMemo(() => checkRules(project, source.id), [project, source.id])
  const focus = focusCodeId ? project.codes.find((c) => c.id === focusCodeId) : undefined
  const speakers = rawSpeakers(source)
  const coverage = project.guide.map((q) => ({ q, mark: project.coverage.find((c) => c.sourceId === source.id && c.questionId === q.id) }))

  return (
    <div className="space-y-6 p-4">
      {focus && (
        <section className="rounded-lg border border-line p-3">
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">Showing only</div>
          <CodeCard code={focus} />
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Status</h3>
        <div className="grid grid-cols-4 gap-1 rounded-md bg-sunken p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (s === 'done' && issues.length && !confirm(`This source has ${issues.length} codebook rule issues. Mark it done anyway?`)) return
                updateSource(source.id, { status: s }, 'set status')
              }}
              className={cx('rounded px-1 py-1 text-xs font-medium capitalize', source.status === s ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
          Rule issues <Badge tone={issues.length ? 'bad' : 'good'}>{issues.length}</Badge>
        </h3>
        {issues.length === 0 ? <p className="text-sm text-muted">No issues in this source.</p> : (
          <ul className="max-h-56 space-y-1 overflow-y-auto scroll-thin">
            {issues.map((v, i) => (
              <li key={i}>
                <button type="button" onClick={() => onJump(v)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-sunken">
                  <div className="text-sm text-bad">{v.message}</div>
                  <div className="truncate font-serif text-xs text-muted">{excerpt(source.text, v.start, v.end)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {coverage.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Interview guide</h3>
          <ul className="space-y-1">
            {coverage.map(({ q, mark }) => (
              <li key={q.id} className="flex items-center gap-2">
                <span className="w-8 font-mono text-xs text-muted">{q.key}</span>
                <span className="min-w-0 flex-1 truncate text-sm" title={q.prompt}>{q.title}</span>
                <Select
                  value={mark?.status ?? 'unmarked'}
                  onChange={(e) => setCoverage(source.id, q.id, { status: e.target.value as CoverageStatus })}
                  className="h-7 w-28 text-xs"
                  aria-label={`Coverage of ${q.key}`}
                >
                  {Object.entries(COVERAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                {mark?.start != null && (
                  <IconButton label="Jump to answer" onClick={() => onJump({ start: mark.start!, end: mark.end ?? mark.start! })}>↗</IconButton>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {speakers.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Speakers</h3>
          <ul className="space-y-2">
            {speakers.map((raw) => {
              const sp = source.speakers.find((s) => s.raw === raw)
              const save = (change: Partial<{ name: string; role: 'respondent' | 'interviewer' | 'observer' | 'unknown' }>) => {
                const next = { raw, name: sp?.name ?? '', role: sp?.role ?? 'unknown', ...change }
                updateSource(source.id, { speakers: [...source.speakers.filter((s) => s.raw !== raw), next] }, 'edit speaker')
              }
              return (
                <li key={raw} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-1.5">
                  <span className="truncate text-xs text-muted" title={raw}>{raw}</span>
                  <Input className="h-7 text-xs" placeholder="Name or ID" defaultValue={sp?.name ?? ''} onBlur={(e) => e.target.value !== (sp?.name ?? '') && save({ name: e.target.value })} />
                  <Select className="h-7 text-xs" value={sp?.role ?? 'unknown'} onChange={(e) => save({ role: e.target.value as 'respondent' })}>
                    <option value="unknown">Unknown</option>
                    <option value="respondent">Respondent</option>
                    <option value="interviewer">Interviewer</option>
                    <option value="observer">Observer</option>
                  </Select>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {Object.keys(source.attributes).length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Attributes</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {Object.entries(source.attributes).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="truncate">{v || '—'}</dd></div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
