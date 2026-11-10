import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, FileText, Search, Users, Waves, X } from 'lucide-react'
import { useProject } from '../lib/store'
import { GROUP_KIND_LABEL, groupOf, indexBy, offsetAt, orderedCodes, snapToWords } from '../lib/model'
import { seek, skip, toggle, usePlayer } from '../lib/player'
import { AudioBar } from '../features/code/AudioBar'
import { markReadTo, toggleCode } from '../lib/actions'
import { Transcript, type TranscriptHandle } from '../features/code/Transcript'
import { CodePicker } from '../features/code/CodePicker'
import { SpanInspector } from '../features/code/Inspector'
import { SourceInspector } from '../features/code/SourceInspector'
import { Button, Empty, IconButton, Input, Progress, Select, Swatch, cx, pct } from '../components/ui'

interface CodeSearch { source?: string; at?: number; end?: number }

export const Route = createFileRoute('/p/$projectId/code')({
  validateSearch: (s: Record<string, unknown>): CodeSearch => ({
    source: typeof s.source === 'string' ? s.source : undefined,
    at: typeof s.at === 'number' ? s.at : undefined,
    end: typeof s.end === 'number' ? s.end : undefined,
  }),
  component: CodeView,
})

type Span = { start: number; end: number }

function CodeView() {
  const project = useProject()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const source = project.sources.find((s) => s.id === search.source) ?? project.sources[0]
  const [active, setActive] = useState<Span | null>(null)
  const [picker, setPicker] = useState<{ span: Span; rect: DOMRect } | null>(null)
  const [focusCode, setFocusCode] = useState<string | null>(null)
  const [flash, setFlash] = useState<Span | null>(null)
  const [dim, setDim] = useState(true)
  const [find, setFind] = useState('')
  const [showTree, setShowTree] = useState(false)
  const [follow, setFollow] = useState(true)
  const transcript = useRef<TranscriptHandle>(null)
  const { time, playing } = usePlayer((s) => ({ time: s.time, playing: s.playing }))
  const nowOffset = useMemo(() => (source?.media && (playing || time > 0) ? offsetAt(source, time) : null), [source, time, playing])
  const lastFollowed = useRef<number | null>(null)
  useEffect(() => {
    if (!follow || !playing || nowOffset == null) return
    if (lastFollowed.current != null && Math.abs(nowOffset - lastFollowed.current) < 300) return
    lastFollowed.current = nowOffset
    transcript.current?.scrollToOffset(nowOffset, 'auto')
  }, [nowOffset, follow, playing])
  const onSeekTime = useCallback((t: number) => seek(t, true), [])
  const codes = useMemo(() => indexBy(project.codes), [project.codes])

  const codings = useMemo(
    () => (source ? project.codings.filter((c) => c.sourceId === source.id && (c.status === 'accepted' || c.status === 'suggested')) : []),
    [project.codings, source],
  )

  const jump = useCallback((span: Span) => {
    transcript.current?.scrollToOffset(span.start)
    setFlash(span)
    setActive(span)
    setTimeout(() => setFlash(null), 1700)
  }, [])

  // Deep link: ?source=…&at=…&end=…
  useEffect(() => {
    if (search.at != null) {
      const t = setTimeout(() => jump({ start: search.at!, end: search.end ?? search.at! + 1 }), 50)
      return () => clearTimeout(t)
    }
  }, [search.at, search.end, search.source, jump])

  useEffect(() => { setActive(null); setPicker(null) }, [source?.id])

  const onSelect = useCallback((sel: { start: number; end: number; rect: DOMRect } | null) => {
    if (!sel || !source) return
    const [start, end] = snapToWords(source.text, sel.start, sel.end)
    if (end <= start) return
    setActive({ start, end })
    setPicker({ span: { start, end }, rect: sel.rect })
  }, [source])

  const onClickCoding = useCallback((span: Span) => { setActive(span); setPicker(null) }, [])
  const onMarkRead = useCallback((offset: number) => { if (source) markReadTo(source.id, offset) }, [source])

  // Keyboard: "c" opens the picker for the active span, Escape clears.
  // Ctrl+Space plays/pauses, Ctrl+←/→ skips five seconds (works while typing too).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); toggle(); return }
      if (e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); skip(-5); return }
      if (e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); skip(5); return }
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog')) return
      if (e.key === 'Escape') { setPicker(null); setActive(null); window.getSelection()?.removeAllRanges() }
      if (e.key === 'c' && active && !picker) {
        e.preventDefault()
        setPicker({ span: active, rect: new DOMRect(window.innerWidth / 2 - 200, window.innerHeight / 3, 0, 0) })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, picker])

  if (!source) {
    return (
      <Empty icon={<FileText size={28} />} title="No sources to code" action={<Link to="/p/$projectId/sources" params={{ projectId: project.id }}><Button variant="primary">Add a transcript</Button></Link>}>
        Add an interview transcript first.
      </Empty>
    )
  }

  const readFrac = source.text.length ? source.readTo / source.text.length : 0

  return (
    <div className="flex h-full min-h-0">
      {/* Codebook */}
      <aside className={cx('w-72 shrink-0 flex-col border-r border-line bg-surface', showTree ? 'fixed inset-y-0 left-0 z-40 flex shadow-xl lg:static lg:shadow-none' : 'hidden lg:flex')}>
        <CodeTree
          focusCode={focusCode}
          onFocus={(id) => setFocusCode((cur) => (cur === id ? null : id))}
          activeSpan={active}
          sourceId={source.id}
          onClose={() => setShowTree(false)}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <IconButton label="Codebook" className="lg:hidden" onClick={() => setShowTree(true)}><BookOpen size={16} /></IconButton>
          <Select
            aria-label="Source"
            value={source.id}
            onChange={(e) => navigate({ search: { source: e.target.value } })}
            className="max-w-[18rem] min-w-0 flex-1 sm:flex-none"
          >
            {project.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <div className="relative min-w-32 flex-1 sm:max-w-56">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
            <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find in transcript" className="pl-8" aria-label="Find in transcript" />
          </div>
          <button
            type="button"
            onClick={() => setDim((d) => !d)}
            className={cx('inline-flex h-8.5 items-center gap-1.5 rounded-md border px-2.5 text-sm', dim ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line-strong text-muted')}
            aria-pressed={dim}
            title="Show interviewer turns in a lighter colour"
          >
            <Users size={14} /> <span className="hidden sm:inline">Dim interviewer</span>
          </button>
          {focusCode && (
            <button type="button" onClick={() => setFocusCode(null)} className="inline-flex h-8.5 items-center gap-1.5 rounded-md bg-sunken px-2.5 text-sm">
              <Swatch color={codes.get(focusCode)?.color ?? '#888'} />
              <span className="max-w-40 truncate">{codes.get(focusCode)?.name}</span>
              <X size={13} />
            </button>
          )}
          {source.media && (
            <button
              type="button"
              onClick={() => setFollow((f) => !f)}
              className={cx('inline-flex h-8.5 items-center gap-1.5 rounded-md border px-2.5 text-sm', follow ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line-strong text-muted')}
              aria-pressed={follow}
              title="Scroll the transcript with the recording"
            >
              <Waves size={14} /> <span className="hidden sm:inline">Follow audio</span>
            </button>
          )}
          <div className="ml-auto flex w-36 items-center gap-2" title="Read progress">
            <Progress value={readFrac} label="Read" />
            <span className="text-xs tabular-nums text-muted">{pct(readFrac)}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-surface">
          <Transcript
            handle={transcript}
            source={source}
            codings={codings}
            codes={codes}
            focusCodeId={focusCode}
            active={active}
            flash={flash}
            dimInterviewer={dim}
            find={find}
            onSelect={onSelect}
            onClickCoding={onClickCoding}
            onMarkRead={onMarkRead}
            nowOffset={nowOffset}
            onSeekTime={source.media ? onSeekTime : undefined}
          />
        </div>
        {source.media && <AudioBar projectId={project.id} source={source} codings={codings} codes={codes} focusCodeId={focusCode} />}
        <div className="hidden border-t border-line bg-surface px-4 py-1.5 text-xs text-muted md:block">
          Select text to code it. Click a highlight or a margin label to inspect it. <kbd className="font-mono">c</kbd> codes the selected passage, <kbd className="font-mono">esc</kbd> clears{source.media ? <>, <kbd className="font-mono">ctrl+space</kbd> plays</> : null}.
        </div>
      </section>

      {/* Inspector */}
      <aside className={cx(
        'shrink-0 overflow-y-auto border-l border-line bg-surface scroll-thin xl:block xl:w-80 2xl:w-96',
        active ? 'fixed inset-x-0 bottom-0 z-30 max-h-[60vh] rounded-t-xl border-t shadow-2xl xl:static xl:max-h-none xl:rounded-none xl:border-t-0 xl:shadow-none' : 'hidden',
      )}>
        {active ? (
          <SpanInspector
            project={project}
            source={source}
            span={active}
            onClose={() => setActive(null)}
            onCode={() => setPicker({ span: active, rect: new DOMRect(window.innerWidth - 700, 120, 0, 0) })}
          />
        ) : (
          <SourceInspector project={project} source={source} focusCodeId={focusCode} onJump={jump} />
        )}
      </aside>

      {picker && (
        <CodePicker project={project} sourceId={source.id} span={picker.span} rect={picker.rect} onClose={() => setPicker(null)} />
      )}
    </div>
  )
}

function CodeTree({ focusCode, onFocus, activeSpan, sourceId, onClose }: { focusCode: string | null; onFocus: (id: string) => void; activeSpan: Span | null; sourceId: string; onClose: () => void }) {
  const project = useProject()
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const groups = useMemo(() => indexBy(project.groups), [project.groups])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of project.codings) if (c.sourceId === sourceId && c.status === 'accepted') m.set(c.codeId, (m.get(c.codeId) ?? 0) + 1)
    return m
  }, [project.codings, sourceId])
  const ordered = useMemo(() => orderedCodes(project), [project])
  const needle = q.trim().toLowerCase()
  const visible = ordered.filter(({ code }) => !needle || code.name.toLowerCase().includes(needle))

  const sections = new Map<string, typeof visible>()
  for (const item of visible) {
    const g = groupOf(item.code, codes, groups)?.id ?? '_'
    if (!sections.has(g)) sections.set(g, [])
    sections.get(g)!.push(item)
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line p-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${project.codes.length} codes`} className="pl-8" aria-label="Filter codes" />
        </div>
        <IconButton label="Close codebook" className="lg:hidden" onClick={onClose}><X size={16} /></IconButton>
      </div>
      <p className="border-b border-line px-3 py-1.5 text-xs text-muted">
        {activeSpan ? 'Click a code to toggle it on the selected passage.' : 'Click a code to show only its passages.'}
      </p>
      <div className="flex-1 overflow-y-auto py-1 scroll-thin">
        {[...sections].map(([gid, items]) => {
          const g = groups.get(gid)
          const isCollapsed = collapsed.has(gid) && !needle
          return (
            <div key={gid}>
              <button
                type="button"
                onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(gid)) n.delete(gid); else n.add(gid); return n })}
                className="flex w-full items-center gap-1 px-2 pt-2.5 pb-1 text-left text-[11px] font-semibold tracking-wide text-faint uppercase hover:text-muted"
              >
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <span className="truncate">{g?.name ?? 'Ungrouped'}</span>
                {g && g.kind !== 'substantive' && <span className="font-normal normal-case">· {GROUP_KIND_LABEL[g.kind]}</span>}
              </button>
              {!isCollapsed && items.map(({ code, depth }) => {
                const n = counts.get(code.id) ?? 0
                const onSpan = activeSpan && project.codings.some((c) => c.sourceId === sourceId && c.codeId === code.id && c.start === activeSpan.start && c.end === activeSpan.end && c.status === 'accepted')
                return (
                  <button
                    key={code.id}
                    type="button"
                    title={[code.definition, code.include && 'Include: ' + code.include, code.exclude && 'Exclude: ' + code.exclude].filter(Boolean).join('\n\n')}
                    onClick={() => {
                      if (activeSpan) toggleCode(sourceId, activeSpan.start, activeSpan.end, code.id)
                      else onFocus(code.id)
                    }}
                    className={cx(
                      'flex w-full items-center gap-2 py-1 pr-3 text-left text-[13px] hover:bg-sunken',
                      focusCode === code.id && 'bg-accent-soft text-accent',
                      onSpan && 'font-semibold',
                    )}
                    style={{ paddingLeft: 12 + depth * 14 }}
                  >
                    <Swatch color={code.color} />
                    <span className="min-w-0 flex-1 truncate">{code.name}</span>
                    {onSpan && <span className="text-accent">✓</span>}
                    {n > 0 && <span className="text-xs tabular-nums text-faint">{n}</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )
}
