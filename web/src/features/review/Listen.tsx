import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, ChevronLeft, ChevronRight, FileUp, Pencil, Play } from 'lucide-react'
import type { Source } from '../../lib/types'
import { formatTime, indexBy, segmentsOf, speakerOf, timeAt, timeRange } from '../../lib/model'
import { listenQueue, parseRTTM, wordingChecks } from '../../lib/listen'
import { editPassage, importSpeakerTrack, setSpanVerified, setWordingChecks } from '../../lib/actions'
import { useProject } from '../../lib/store'
import { hasPlayer, playRange } from '../../lib/player'
import { Badge, Button, Empty, IconButton, Kbd, Panel, Select, Swatch, Textarea, cx, pct } from '../../components/ui'
import { AudioBar } from '../code/AudioBar'
import { codeKey } from '../../lib/claims'

/**
 * Coded passages in the order worth hearing: quoted evidence first, then
 * passages where two transcriptions disagree, then low-confidence words. One
 * card plays the passage, lets the wording be corrected, and records that a
 * person has checked it.
 */
export function Listen() {
  const project = useProject()
  const [sourceId, setSourceId] = useState(project.sources.find((s) => s.media)?.id ?? project.sources[0]?.id ?? '')
  const [todo, setTodo] = useState(true)
  const [idx, setIdx] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const source = project.sources.find((s) => s.id === sourceId)
  const all = useMemo(() => (sourceId ? listenQueue(project, sourceId) : []), [project, sourceId])
  const items = todo ? all.filter((i) => !i.verified) : all
  const i = Math.min(idx, Math.max(0, items.length - 1))
  const item = items[i]
  const checked = all.filter((x) => x.verified).length
  const transRef = useRef<HTMLInputElement>(null)
  const trackRef = useRef<HTMLInputElement>(null)
  useEffect(() => setIdx(0), [sourceId, todo])

  if (!source) return <Panel><Empty title="No sources yet" /></Panel>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-8 max-w-64" aria-label="Source">
          {project.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} /> Not yet checked only</label>
        <span className="text-sm text-muted tabular-nums">{checked} of {all.length} passages checked against the recording</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" icon={<FileUp size={13} />} onClick={() => transRef.current?.click()} title="A Whisper-style JSON of the whole recording, or a list of passages. Shows where two transcriptions disagree.">Second transcription…</Button>
          <Button size="sm" icon={<FileUp size={13} />} onClick={() => trackRef.current?.click()} title="An RTTM speaker track from a diarization tool. Splits turns where the speaker changes; text and coding stay where they are.">Speaker track…</Button>
        </span>
        <input ref={transRef} type="file" accept=".json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''
          if (!f) return
          try {
            const checks = wordingChecks(project, source, JSON.parse(await f.text()), f.name)
            setWordingChecks(source.id, checks)
            setMsg(`Compared ${checks.length} coded passages with ${f.name}: ${checks.filter((c) => c.agreement < 0.85).length} agree on less than 85% of words.`)
          } catch (err) { setMsg(err instanceof Error ? err.message : String(err)) }
        }} />
        <input ref={trackRef} type="file" accept=".rttm,.txt" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''
          if (!f) return
          try {
            const track = parseRTTM(await f.text())
            if (!track.length) throw new Error('No SPEAKER lines were found in that file.')
            const r = await importSpeakerTrack(source.id, track)
            setMsg(`Speaker track applied: ${r.splits} turns split, ${r.changed} relabelled. A snapshot was saved first.`)
          } catch (err) { setMsg(err instanceof Error ? err.message : String(err)) }
        }} />
      </div>
      {msg && <p className="rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">{msg}</p>}
      {!source.media && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">No recording is attached to this source. Attach it under <Link to="/p/$projectId/sources" params={{ projectId: project.id }} className="underline">Sources</Link> to play passages; the queue and the transcription comparison work without it.</p>}

      {!item ? (
        <Panel><Empty icon={<AudioLines size={26} />} title={all.length ? 'Every coded passage has been checked' : 'Nothing coded in this source yet'} /></Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <ol className="hidden max-h-[calc(100vh-17rem)] divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface scroll-thin lg:block" aria-label="Passages to check">
            {items.map((it, k) => (
              <li key={it.claim.key}>
                <button type="button" aria-current={k === i} onClick={() => setIdx(k)} className={cx('flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-sunken/60', k === i && 'bg-accent-soft')}>
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: it.verified ? 'var(--viz-checked)' : it.risk >= 1 ? 'var(--viz-pending)' : 'var(--line-strong)' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{source.text.slice(it.claim.start, it.claim.end)}</span>
                    <span className="block truncate text-[11px] text-muted"><span className="font-mono">{formatTime(timeAt(source, it.claim.start))}</span>{it.reasons.length ? ` · ${it.reasons[0]}` : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <Card key={item.claim.key} source={source} item={item} position={`${i + 1} of ${items.length}`} onPrev={i > 0 ? () => setIdx(i - 1) : undefined} onNext={i < items.length - 1 ? () => setIdx(i + 1) : undefined} stays={!todo} />
        </div>
      )}
    </div>
  )
}

function Card({ source, item, position, onPrev, onNext, stays }: { source: Source; item: ReturnType<typeof listenQueue>[number]; position: string; onPrev?: () => void; onNext?: () => void; stays: boolean }) {
  const project = useProject()
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const { claim, check } = item
  const span = { start: claim.start, end: claim.end }
  const text = source.text.slice(claim.start, claim.end)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const seg = segmentsOf(source).find((g) => g.start <= claim.start && g.end > claim.start)
  const who = seg ? speakerOf(source, seg.speaker)?.name || seg.speaker : ''
  const range = timeRange(source, claim.start, claim.end)
  const play = () => { if (range && hasPlayer()) playRange(range[0], range[1]) }
  const mark = (v: boolean) => { setSpanVerified(source.id, span, v); if (v && stays) onNext?.() }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'p') { e.preventDefault(); play() }
      else if (e.key === 'v') { e.preventDefault(); mark(!item.verified) }
      else if (e.key === 'e') { e.preventDefault(); setDraft(text); setEditing(true) }
      else if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); onNext?.() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <article className="min-w-0 rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-xs text-muted">
        {who && <span className="font-medium text-ink">{who}</span>}
        {range && <span className="font-mono">{formatTime(range[0])}–{formatTime(range[1])}</span>}
        {item.reasons.map((r) => <Badge key={r} tone="warn">{r}</Badge>)}
        {item.verified && <Badge tone="good">checked against audio</Badge>}
        <span className="ml-auto flex items-center gap-1 tabular-nums">{position}
          <IconButton label="Previous passage (←)" disabled={!onPrev} onClick={onPrev}><ChevronLeft size={15} /></IconButton>
          <IconButton label="Next passage (space)" disabled={!onNext} onClick={onNext}><ChevronRight size={15} /></IconButton>
        </span>
      </header>
      <div className="space-y-4 p-5">
        {editing ? (
          <div className="space-y-2">
            <Textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} className="font-serif text-[15.5px]" aria-label="Corrected wording" />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => { if (draft.trim() && draft !== text) editPassage(source.id, claim.start, claim.end, draft); setEditing(false) }}>Save wording</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <span className="self-center text-xs text-muted">Codes on the passage stay attached.</span>
            </div>
          </div>
        ) : (
          <p className="font-serif text-[16px] leading-relaxed whitespace-pre-wrap">
            <span className="text-faint">…{source.text.slice(Math.max(0, claim.start - 160), claim.start)}</span>
            <mark className="rounded-sm bg-accent-soft px-0.5 text-ink">{text}</mark>
            <span className="text-faint">{source.text.slice(claim.end, claim.end + 160)}…</span>
          </p>
        )}
        {check && (
          <div className="rounded-md bg-sunken px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted"><span className="font-medium text-ink">Second transcription</span> agrees on {pct(check.agreement)} of the words{check.model ? ` · ${check.model}` : ''}</div>
            <p className="font-serif text-[15px] text-muted">{check.other}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {claim.codings.filter((c) => c.status === 'accepted').map((c) => <Badge key={c.id}><Swatch color={codes.get(c.codeId)?.color ?? '#888'} />{codeKey(codes.get(c.codeId)?.name ?? '')}</Badge>)}
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        <Button icon={<Play size={14} />} disabled={!source.media || !range} onClick={play}>Play <Kbd>P</Kbd></Button>
        <Button variant={item.verified ? 'secondary' : 'primary'} icon={<AudioLines size={14} />} onClick={() => mark(!item.verified)}>{item.verified ? 'Clear the check' : 'Wording matches the recording'} <Kbd>V</Kbd></Button>
        {!editing && <Button icon={<Pencil size={14} />} onClick={() => { setDraft(text); setEditing(true) }}>Correct the wording <Kbd>E</Kbd></Button>}
        <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: source.id, at: claim.start, end: claim.end }} className="ml-auto text-sm text-accent hover:underline">Open in transcript</Link>
      </footer>
      {source.media && <AudioBar projectId={project.id} source={source} codings={claim.codings} codes={codes} focusCodeId={null} />}
    </article>
  )
}
