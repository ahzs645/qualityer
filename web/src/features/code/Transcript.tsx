import { memo, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { BookmarkCheck } from 'lucide-react'
import type { Code, Coding, Segment, Source } from '../../lib/types'
import { formatTime, segmentsOf, speakerOf } from '../../lib/model'
import { cx } from '../../components/ui'

export interface TranscriptHandle {
  scrollToOffset: (offset: number) => void
}

interface Props {
  source: Source
  codings: Coding[]
  codes: Map<string, Code>
  focusCodeId: string | null
  active: { start: number; end: number } | null
  flash: { start: number; end: number } | null
  dimInterviewer: boolean
  find: string
  onSelect: (span: { start: number; end: number; rect: DOMRect } | null) => void
  onClickCoding: (span: { start: number; end: number }, rect: DOMRect) => void
  onMarkRead: (offset: number) => void
  handle: Ref<TranscriptHandle>
}

/** Reads the absolute source offset of a DOM selection boundary. */
function offsetOf(node: Node, offset: number): number | null {
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest<HTMLElement>('[data-o]')
  if (el) {
    const base = Number(el.dataset.o)
    if (node.nodeType === Node.TEXT_NODE) return base + offset
    return offset === 0 ? base : base + (el.textContent?.length ?? 0)
  }
  // Boundary sits on a turn container: use its first or last fragment.
  const turn = (node as Element).closest?.('[data-turn]')
  if (!turn) return null
  const frags = turn.querySelectorAll<HTMLElement>('[data-o]')
  if (!frags.length) return null
  const child = (node as Element).childNodes[offset]
  if (child && child instanceof Element) {
    const f = child.querySelector<HTMLElement>('[data-o]') ?? (child.matches('[data-o]') ? (child as HTMLElement) : null)
    if (f) return Number(f.dataset.o)
  }
  const last = frags[frags.length - 1]
  return Number(last.dataset.o) + (last.textContent?.length ?? 0)
}

export function Transcript(props: Props) {
  const { source, codings, handle, onSelect, flash } = props
  const segments = segmentsOf(source)
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => 56 + Math.ceil((segments[i].end - segments[i].start) / 85) * 29,
    overscan: 6,
  })

  useImperativeHandle(handle, () => ({
    scrollToOffset(offset: number) {
      let idx = segments.findIndex((s) => s.end >= offset)
      if (idx < 0) idx = segments.length - 1
      virtualizer.scrollToIndex(idx, { align: 'center' })
    },
  }), [segments, virtualizer])

  // Codings sorted once per change, then sliced per visible turn.
  const sorted = useMemo(() => [...codings].sort((a, b) => a.start - b.start), [codings])

  useEffect(() => {
    const onUp = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      if (!scrollRef.current?.contains(range.commonAncestorContainer)) return
      const a = offsetOf(range.startContainer, range.startOffset)
      const b = offsetOf(range.endContainer, range.endOffset)
      if (a == null || b == null || a === b) return
      onSelect({ start: Math.min(a, b), end: Math.max(a, b), rect: range.getBoundingClientRect() })
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    // Keyboard selection (shift+arrows) ends with keyup.
    const onKey = (e: KeyboardEvent) => { if (e.shiftKey) onUp() }
    document.addEventListener('keyup', onKey)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
      document.removeEventListener('keyup', onKey)
    }
  }, [onSelect])

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto scroll-thin" data-testid="transcript">
      <div className="relative mx-auto max-w-[46rem]" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const seg = segments[v.index]
          const turnCodings = sorted.filter((c) => c.start < seg.end && c.end > seg.start)
          return (
            <div
              key={v.key}
              data-index={v.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${v.start}px)` }}
            >
              <Turn
                {...props}
                seg={seg}
                turnCodings={turnCodings}
                isRead={source.readTo >= seg.end}
                flashHere={!!flash && flash.start < seg.end && flash.end > seg.start}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface TurnProps extends Props {
  seg: Segment
  turnCodings: Coding[]
  isRead: boolean
  flashHere: boolean
}

const Turn = memo(function Turn({ source, seg, turnCodings, codes, focusCodeId, active, dimInterviewer, find, isRead, flashHere, onClickCoding, onMarkRead }: TurnProps) {
  const speaker = seg.speaker ? speakerOf(source, seg.speaker) : undefined
  const role = speaker?.role ?? (seg.speaker ? 'unknown' : null)
  const dim = dimInterviewer && role === 'interviewer'
  const fragments = useMemo(() => buildFragments(source.text, seg, turnCodings, active, find), [source.text, seg, turnCodings, active, find])

  // Margin chips: one per distinct span starting in this turn.
  const margin = useMemo(() => {
    const spans = new Map<string, { start: number; end: number; codeIds: string[] }>()
    for (const c of turnCodings) {
      if (c.start < seg.start) continue
      const k = `${c.start}:${c.end}`
      const s = spans.get(k) ?? { start: c.start, end: c.end, codeIds: [] }
      s.codeIds.push(c.codeId)
      spans.set(k, s)
    }
    return [...spans.values()]
  }, [turnCodings, seg.start])

  const label = speaker?.name || seg.speaker
  return (
    <article
      data-turn
      className={cx('group relative grid grid-cols-[1fr] gap-x-4 border-l-2 px-5 py-3 sm:grid-cols-[1fr_9.5rem]', isRead ? 'border-accent/35' : 'border-transparent', flashHere && 'flash')}
    >
      <div className="min-w-0">
        {(label || seg.time != null) && (
          <div className="mb-0.5 flex items-center gap-2 text-xs select-none">
            {label && (
              <span className={cx('font-semibold', role === 'interviewer' ? 'text-muted' : 'text-ink')}>{label}</span>
            )}
            {role && role !== 'unknown' && role !== 'respondent' && role !== label?.toLowerCase() && <span className="text-faint">{role}</span>}
            {seg.time != null && <span className="font-mono text-faint">{formatTime(seg.time)}</span>}
            <button
              type="button"
              onClick={() => onMarkRead(seg.end)}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-faint opacity-0 hover:bg-sunken hover:text-ink group-hover:opacity-100 focus:opacity-100"
              title="Mark everything up to here as read"
            >
              <BookmarkCheck size={13} /> Read to here
            </button>
          </div>
        )}
        <p className={cx(
          'whitespace-pre-wrap break-words',
          !seg.speaker && seg.time == null && seg.start === 0 ? 'font-sans text-sm text-muted' : 'transcript',
          dim && 'text-muted',
        )}>
          {fragments.map((f) => {
            const style: React.CSSProperties = {}
            const ids = f.codeIds
            const visible = focusCodeId ? ids.filter((i) => i === focusCodeId) : ids
            if (visible.length) {
              const color = codes.get(visible[0])?.color ?? '#888'
              style.backgroundColor = `color-mix(in oklab, ${color} ${f.important ? 30 : 18}%, transparent)`
              if (visible.length > 1) {
                const second = codes.get(visible[1])?.color ?? color
                style.boxShadow = `inset 0 -2px 0 ${second}`
              }
            }
            if (f.active) style.backgroundColor = 'color-mix(in oklab, var(--accent) 28%, transparent)'
            if (f.match) style.outline = '1px solid var(--warn)'
            return (
              <span
                key={f.start}
                data-o={f.start}
                style={style}
                className={cx(visible.length > 0 && 'coded', f.uncertain && 'uncertain')}
                title={f.uncertain ? 'Low ASR confidence — check the audio' : undefined}
                onClick={visible.length ? (e) => {
                  if (!window.getSelection()?.isCollapsed) return
                  const c = turnCodings.find((x) => visible.includes(x.codeId) && x.start <= f.start && x.end >= f.end)
                  if (c) onClickCoding({ start: c.start, end: c.end }, (e.target as HTMLElement).getBoundingClientRect())
                } : undefined}
              >
                {f.text}
              </span>
            )
          })}
        </p>
      </div>
      <div className="mt-5 hidden flex-col gap-1 sm:flex">
        {margin.map((m) => (
          <button
            type="button"
            key={`${m.start}:${m.end}`}
            onClick={(e) => onClickCoding(m, e.currentTarget.getBoundingClientRect())}
            className={cx(
              'flex flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-sunken',
              active && active.start === m.start && active.end === m.end && 'bg-accent-soft',
            )}
            title={m.codeIds.map((id) => codes.get(id)?.name).join('\n')}
          >
            {m.codeIds.slice(0, 6).map((id) => (
              <span key={id} className="max-w-full truncate rounded-sm px-1 text-[11px] leading-4" style={{ background: `color-mix(in oklab, ${codes.get(id)?.color ?? '#888'} 20%, transparent)`, opacity: focusCodeId && focusCodeId !== id ? 0.35 : 1 }}>
                {shortName(codes.get(id)?.name ?? '?')}
              </span>
            ))}
            {m.codeIds.length > 6 && <span className="text-[11px] text-muted">+{m.codeIds.length - 6}</span>}
          </button>
        ))}
      </div>
    </article>
  )
})

/** "03.8 Carrying capacity…" → "03.8"; plain names are truncated. */
function shortName(name: string) {
  const m = /^([A-Z]{0,3}\.?\d+(?:\.\d+)*[a-z]?)\s/.exec(name)
  return m ? m[1] : name.length > 16 ? name.slice(0, 15) + '…' : name
}

interface Fragment {
  start: number
  end: number
  text: string
  codeIds: string[]
  important: boolean
  active: boolean
  uncertain: boolean
  match: boolean
}

function buildFragments(text: string, seg: Segment, codings: Coding[], active: { start: number; end: number } | null, find: string): Fragment[] {
  // Skip the header line ("[00:05]  Speaker 1") of parsed transcripts.
  let start = seg.start
  const firstNl = text.indexOf('\n', start)
  if (/^\[[\d:.]+\]\s+.{1,60}$/.test(text.slice(start, firstNl < 0 ? seg.end : firstNl).trim()) && firstNl > -1 && firstNl < seg.end) start = firstNl + 1
  const end = seg.end
  const cuts = new Set<number>([start, end])
  const add = (a: number, b: number) => {
    if (b <= start || a >= end) return
    cuts.add(Math.max(a, start))
    cuts.add(Math.min(b, end))
  }
  for (const c of codings) add(c.start, c.end)
  if (active) add(active.start, active.end)
  for (const [a, b] of seg.uncertain ?? []) add(a, b)
  const matches: [number, number][] = []
  if (find.trim().length > 1) {
    const hay = text.slice(start, end).toLowerCase()
    const needle = find.trim().toLowerCase()
    let i = hay.indexOf(needle)
    while (i >= 0) { matches.push([start + i, start + i + needle.length]); add(start + i, start + i + needle.length); i = hay.indexOf(needle, i + needle.length) }
  }
  const points = [...cuts].sort((a, b) => a - b)
  const out: Fragment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (b <= a) continue
    const over = codings.filter((c) => c.start <= a && c.end >= b)
    out.push({
      start: a, end: b, text: text.slice(a, b),
      codeIds: [...new Set(over.map((c) => c.codeId))],
      important: over.some((c) => c.important),
      active: !!active && active.start <= a && active.end >= b,
      uncertain: (seg.uncertain ?? []).some(([x, y]) => x <= a && y >= b),
      match: matches.some(([x, y]) => x <= a && y >= b),
    })
  }
  return out
}
