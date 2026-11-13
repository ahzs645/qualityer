import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, CheckCircle2, CornerDownRight, Pencil, Play, Plus } from 'lucide-react'
import type { CoverageStatus, Project, Source, SourceStatus, Speaker } from '../../lib/types'
import { checkRules, excerpt, formatTime, rawSpeakers, segmentsOf, speakerOf, timeAt } from '../../lib/model'
import { joinTurn, setCoverage, updateSource } from '../../lib/actions'
import { brokenTurns } from '../../lib/listen'
import { hasPlayer, seek } from '../../lib/player'
import { Badge, Input, Progress, cx, pct } from '../../components/ui'
import { CodeCard } from './CodeCard'
import { COVERAGE_LABEL, COVERAGE_ORDER, COVERAGE_STYLE } from '../guide/coverage'

const STATUSES: SourceStatus[] = ['new', 'reading', 'coding', 'done']
const ROLES: { value: Speaker['role']; label: string }[] = [
  { value: 'respondent', label: 'Respondent' },
  { value: 'interviewer', label: 'Interviewer' },
  { value: 'observer', label: 'Observer' },
  { value: 'unknown', label: '?' },
]
const SPEAKER_DOTS = ['#2f7d78', '#c2573a', '#5b5fc7', '#b8892c', '#7a4fa3', '#3f7fb5']

function useOpen(key: string, initial = true): [boolean, () => void] {
  const storageKey = `rw-section-${key}`
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(storageKey); return v == null ? initial : v === '1' } catch { return initial }
  })
  return [open, () => setOpen((o) => { try { localStorage.setItem(storageKey, o ? '0' : '1') } catch { /* ignore */ } return !o })]
}

function Section({ id, title, aside, children, initial = true }: { id: string; title: string; aside?: ReactNode; children: ReactNode; initial?: boolean }) {
  const [open, toggle] = useOpen(id, initial)
  return (
    <section className="border-b border-line last:border-b-0">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-sunken/50">
        <ChevronDown size={14} className={cx('shrink-0 text-faint transition-transform', !open && '-rotate-90')} />
        <h3 className="flex-1 text-[13px] font-semibold">{title}</h3>
        {aside}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

export function SourceInspector({ project, source, focusCodeId, onJump }: { project: Project; source: Source; focusCodeId: string | null; onJump: (o: { start: number; end: number }) => void }) {
  const issues = useMemo(() => checkRules(project, source.id), [project, source.id])
  const focus = focusCodeId ? project.codes.find((c) => c.id === focusCodeId) : undefined
  const segments = segmentsOf(source)
  const lastTime = [...segments].reverse().find((s) => s.time != null)?.time ?? null
  const words = useMemo(() => source.text.split(/\s+/).filter(Boolean).length, [source.text])
  const read = source.text.length ? source.readTo / source.text.length : 0

  return (
    <div className="pb-6">
      <header className="border-b border-line px-4 py-4">
        <h2 className="text-[15px] leading-snug font-semibold">{source.name}</h2>
        <p className="mt-1 text-xs text-muted">
          {[lastTime != null && `${formatTime(lastTime)} long`, `${words.toLocaleString()} words`, `${segments.length} turns`].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Progress value={read} label="Read" />
          <span className="shrink-0 text-xs tabular-nums text-muted">{pct(read)} read</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-0.5 rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="Source status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={source.status === s}
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
      </header>

      {focus && (
        <div className="border-b border-line bg-accent-soft/40 px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-accent uppercase">Showing only this code</div>
          <CodeCard code={focus} />
        </div>
      )}

      <Section id="checks" title="Codebook checks" aside={<Badge tone={issues.length ? 'bad' : 'good'}>{issues.length}</Badge>}>
        {issues.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-good"><CheckCircle2 size={14} /> Every coded claim meets the rules.</p>
        ) : (
          <ul className="-mx-2 max-h-64 space-y-0.5 overflow-y-auto scroll-thin">
            {issues.map((v, i) => (
              <li key={i}>
                <button type="button" onClick={() => onJump(v)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-sunken">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-bad"><AlertTriangle size={13} className="shrink-0" />{v.message}</div>
                  <div className="line-clamp-2 pl-5 font-serif text-xs text-muted">{excerpt(source.text, v.start, v.end)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {project.guide.length > 0 && <GuideSection project={project} source={source} onJump={onJump} />}

      <SpeakersSection source={source} onJump={onJump} />

      <AttributesSection source={source} />
    </div>
  )
}

function GuideSection({ project, source, onJump }: { project: Project; source: Source; onJump: (o: { start: number; end: number }) => void }) {
  const marks = project.guide.map((q) => ({ q, mark: project.coverage.find((c) => c.sourceId === source.id && c.questionId === q.id) }))
  const done = marks.filter((m) => m.mark && m.mark.status !== 'unmarked').length
  const [noteFor, setNoteFor] = useState<string | null>(null)
  return (
    <Section id="guide" title="Interview guide" aside={<span className="text-xs tabular-nums text-muted">{done}/{marks.length} marked</span>}>
      <ul className="space-y-1">
        {marks.map(({ q, mark }) => {
          const status: CoverageStatus = mark?.status ?? 'unmarked'
          const editing = noteFor === q.id
          return (
            <li key={q.id}>
              <div className="group flex items-center gap-2">
                <span className="w-7 shrink-0 font-mono text-[11px] text-faint">{q.key}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]" title={q.prompt || q.title}>{q.title}</span>
                <button type="button" title={mark?.note ? 'Edit the note' : 'Add a note: what was asked, or why not'} aria-label={`Note on ${q.key}`} onClick={() => setNoteFor(editing ? null : q.id)}
                  className={cx('rounded p-0.5 hover:bg-sunken hover:text-accent', mark?.note ? 'text-muted' : 'text-faint opacity-0 group-hover:opacity-100 focus:opacity-100')}>
                  <Pencil size={12} />
                </button>
                {mark?.start != null && (
                  <button type="button" title="Jump to the answer" onClick={() => onJump({ start: mark.start!, end: mark.end ?? mark.start! })} className="rounded p-0.5 text-faint hover:bg-sunken hover:text-accent">
                    <CornerDownRight size={13} />
                  </button>
                )}
                <select
                  value={status}
                  onChange={(e) => setCoverage(source.id, q.id, { status: e.target.value as CoverageStatus })}
                  className={cx('h-6 w-[6.5rem] shrink-0 cursor-pointer appearance-none rounded px-2 text-[11px] font-medium', COVERAGE_STYLE[status])}
                  aria-label={`Coverage of ${q.key}`}
                >
                  {COVERAGE_ORDER.map((o) => <option key={o} value={o}>{COVERAGE_LABEL[o]}</option>)}
                </select>
              </div>
              {editing ? (
                <CoverageNote initial={mark?.note ?? ''} label={`Note on ${q.key} in ${source.name}`} onDone={(note) => { if (note !== (mark?.note ?? '')) setCoverage(source.id, q.id, { note }); setNoteFor(null) }} />
              ) : mark?.note ? (
                <p className="mb-1 ml-9 line-clamp-2 text-[11px] text-muted" title={mark.note}>{mark.note}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** A coverage note: what was asked, how it was answered, or why it was not asked. Enter or leaving the field saves. */
export function CoverageNote({ initial, label, onDone }: { initial: string; label: string; onDone: (note: string) => void }) {
  const [v, setV] = useState(initial)
  return (
    <textarea
      autoFocus rows={2} value={v} aria-label={label}
      placeholder="e.g. Not asked: interviewer read out the respondent's role"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim())}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onDone(v.trim()) } if (e.key === 'Escape') onDone(initial) }}
      className="mt-1 mb-1.5 ml-9 block w-[calc(100%-2.25rem)] rounded-md border border-line-strong bg-surface px-2 py-1 text-[12px]"
    />
  )
}

function SpeakersSection({ source, onJump }: { source: Source; onJump: (o: { start: number; end: number }) => void }) {
  const raws = rawSpeakers(source)
  const broken = useMemo(() => (source.segments?.length ? brokenTurns(source) : []), [source])
  const stats = useMemo(() => {
    const m = new Map<string, { turns: number; chars: number }>()
    let total = 0
    for (const s of segmentsOf(source)) {
      if (!s.speaker) continue
      const cur = m.get(s.speaker) ?? { turns: 0, chars: 0 }
      cur.turns++; cur.chars += s.end - s.start; total += s.end - s.start
      m.set(s.speaker, cur)
    }
    return { m, total }
  }, [source])
  if (!raws.length) {
    return (
      <Section id="speakers" title="Speakers" initial={false}>
        <p className="text-sm text-muted">No speaker labels were found in this transcript.</p>
      </Section>
    )
  }
  const save = (raw: string, change: Partial<Speaker>) => {
    const sp = source.speakers.find((s) => s.raw === raw)
    const next: Speaker = { raw, name: sp?.name ?? '', role: sp?.role ?? 'unknown', ...change }
    updateSource(source.id, { speakers: [...source.speakers.filter((s) => s.raw !== raw), next] }, 'edit speaker')
  }
  return (
    <Section id="speakers" title="Speakers" aside={<span className="text-xs text-muted">{raws.length}</span>}>
      <ul className="space-y-3">
        {raws.map((raw, i) => {
          const sp = source.speakers.find((s) => s.raw === raw)
          const st = stats.m.get(raw)
          const share = st && stats.total ? st.chars / stats.total : 0
          return (
            <li key={raw} className="rounded-lg border border-line p-2.5">
              <div className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: SPEAKER_DOTS[i % SPEAKER_DOTS.length] }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted" title={raw}>{raw}</span>
                <span className="text-[11px] tabular-nums text-faint">{st?.turns ?? 0} turns · {pct(share)}</span>
              </div>
              <Input
                key={sp?.name ?? ''}
                className="mt-2 h-8"
                placeholder="Display name, e.g. R01"
                defaultValue={sp?.name ?? ''}
                onBlur={(e) => e.target.value !== (sp?.name ?? '') && save(raw, { name: e.target.value })}
                aria-label={`Name for ${raw}`}
              />
              <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-0.5 rounded-md bg-sunken p-0.5" role="radiogroup" aria-label={`Role of ${raw}`}>
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={(sp?.role ?? 'unknown') === r.value}
                    title={r.value === 'unknown' ? 'Unknown' : r.label}
                    onClick={() => save(raw, { role: r.value })}
                    className={cx('rounded px-1.5 py-1 text-[11px] font-medium', (sp?.role ?? 'unknown') === r.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      {broken.length > 0 && <BrokenTurns source={source} broken={broken} onJump={onJump} />}
    </Section>
  )
}

/** Sentences the machine transcript cut in two, giving a word or two to another speaker. */
function BrokenTurns({ source, broken, onJump }: { source: Source; broken: ReturnType<typeof brokenTurns>; onJump: (o: { start: number; end: number }) => void }) {
  const [open, setOpen] = useState(false)
  const segs = segmentsOf(source)
  const name = (raw: string) => speakerOf(source, raw)?.name || raw
  return (
    <div className="mt-3 rounded-lg border border-warn/40 bg-warn-soft/40 p-2.5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-1.5 text-left text-xs font-medium">
        <AlertTriangle size={13} className="shrink-0 text-warn" />
        <span className="flex-1">{broken.length} {broken.length === 1 ? 'sentence looks' : 'sentences look'} cut by another speaker</span>
        <ChevronDown size={13} className={cx('text-faint transition-transform', !open && '-rotate-90')} />
      </button>
      {open && (
        <>
          <p className="mt-1.5 text-[11px] text-muted">A word or two given to someone else in the middle of a sentence. Joining gives it back, so the sentence is one turn and can be quoted whole. Listen first if unsure.</p>
          <ul className="mt-2 space-y-2">
            {broken.map((b) => {
              const seg = segs[b.index]
              return (
                <li key={b.index} className="rounded-md bg-surface p-2 text-[12px]">
                  <button type="button" onClick={() => onJump({ start: seg.start, end: seg.end })} className="block w-full text-left font-serif text-muted hover:text-ink">
                    …{b.before} <mark className="rounded bg-warn-soft px-0.5 text-ink">{b.text}</mark> {b.after}…
                  </button>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="flex-1 truncate text-[11px] text-faint">{name(seg.speaker)} → {name(b.speaker)}</span>
                    {hasPlayer() && (
                      <button type="button" aria-label="Play this point" className="rounded p-1 text-muted hover:bg-sunken hover:text-ink"
                        onClick={() => { const t = timeAt(source, seg.start); if (t != null) seek(Math.max(0, t - 3), true) }}>
                        <Play size={12} />
                      </button>
                    )}
                    <button type="button" onClick={() => joinTurn(source.id, b.index)} className="rounded border border-line-strong px-2 py-0.5 text-[11px] font-medium hover:bg-sunken">Join</button>
                  </div>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => { for (const b of [...broken].reverse()) joinTurn(source.id, b.index) }}
            className="mt-2 w-full rounded border border-line-strong px-2 py-1 text-[11px] font-medium hover:bg-sunken">
            Join all {broken.length}
          </button>
        </>
      )}
    </div>
  )
}

function AttributesSection({ source }: { source: Source }) {
  const entries = Object.entries(source.attributes)
  const [adding, setAdding] = useState(false)
  const [key, setKey] = useState('')
  const set = (k: string, v: string) => updateSource(source.id, { attributes: { ...source.attributes, [k]: v } }, 'edit attribute')
  return (
    <Section id="attributes" title="Attributes" aside={<span className="text-xs text-muted">{entries.length}</span>}>
      {entries.length === 0 && !adding && <p className="text-sm text-muted">None yet.</p>}
      <dl className="space-y-2.5">
        {entries.map(([k, v]) => <Attribute key={k} name={k} value={v} onSave={(nv) => set(k, nv)} />)}
      </dl>
      {adding ? (
        <form className="mt-3 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (key.trim()) { set(key.trim(), ''); setKey(''); setAdding(false) } }}>
          <Input autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="Attribute name" className="h-8" />
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"><Plus size={12} /> Add attribute</button>
      )}
    </Section>
  )
}

function Attribute({ name, value, onSave }: { name: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const long = value.length > 90
  return (
    <div className="group">
      <dt className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-faint uppercase">
        <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-sunken hover:text-ink focus:opacity-100" aria-label={`Edit ${name}`}>
            <Pencil size={11} />
          </button>
        )}
      </dt>
      <dd className="mt-0.5">
        {editing ? (
          <textarea
            autoFocus
            defaultValue={value}
            rows={Math.min(5, Math.max(1, Math.ceil(value.length / 34)))}
            onBlur={(e) => { setEditing(false); if (e.target.value !== value) onSave(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } if (e.key === 'Escape') setEditing(false) }}
            className="w-full rounded-md border border-line-strong bg-surface px-2 py-1 text-[13px]"
          />
        ) : value ? (
          <button type="button" onClick={() => long && setExpanded((x) => !x)} className={cx('block w-full text-left text-[13px] break-words', long && 'cursor-pointer')}>
            <span className={cx(!expanded && 'line-clamp-2')}>{value}</span>
            {long && <span className="text-[11px] text-accent">{expanded ? 'Show less' : 'Show more'}</span>}
          </button>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-faint italic hover:text-muted">Not set</button>
        )}
      </dd>
    </div>
  )
}
