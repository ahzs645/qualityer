import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import type { Code, Project } from '../../lib/types'
import { GROUP_KIND_LABEL, groupOf, indexBy, orderedCodes } from '../../lib/model'
import { addCode, toggleCode } from '../../lib/actions'
import { Kbd, Swatch, cx } from '../../components/ui'
import { CodeCard } from './CodeCard'

interface Props {
  project: Project
  sourceId: string
  span: { start: number; end: number }
  rect: DOMRect
  onClose: () => void
}

/**
 * Popover for coding a selected span. Codes toggle on the span and the popover
 * stays open, so a claim can get its substantive code, evidence grade and
 * stance in one pass. Rule hints show what the span still needs.
 */
export function CodePicker({ project, sourceId, span, rect, onClose }: Props) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const groups = useMemo(() => indexBy(project.groups), [project.groups])
  const onSpan = new Set(
    project.codings.filter((c) => c.sourceId === sourceId && c.start === span.start && c.end === span.end && c.coder === project.coder && c.status === 'accepted').map((c) => c.codeId),
  )
  const all = useMemo(() => orderedCodes(project), [project])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all.filter(({ code }) => code.name.toLowerCase().includes(needle) || code.definition.toLowerCase().includes(needle))
  }, [all, q])

  // What the span still needs, per active rule.
  const hints = useMemo(() => {
    const out: { label: string; ok: boolean }[] = []
    const groupIds = new Set([...onSpan].map((id) => groupOf(codes.get(id), codes, groups)?.id))
    for (const r of project.rules) {
      if (!r.enabled || r.kind === 'requires-extraction' || !r.targetGroupId) continue
      if (!r.triggerGroupIds.some((g) => groupIds.has(g))) continue
      const n = [...onSpan].filter((id) => groupOf(codes.get(id), codes, groups)?.id === r.targetGroupId).length
      const name = groups.get(r.targetGroupId)?.name ?? 'Group'
      out.push({ label: r.kind === 'exactly-one' ? `${name}: exactly one` : `${name}: at most one`, ok: r.kind === 'exactly-one' ? n === 1 : n <= 1 })
    }
    return out
  }, [onSpan, project.rules, codes, groups])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setCursor(0) }, [q])

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const w = box.offsetWidth
    const h = box.offsetHeight
    let left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8)
    let top = rect.bottom + 8
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 8)
    if (window.innerWidth < 640) { left = 8; top = Math.max(8, window.innerHeight - h - 8) }
    setPos({ left, top })
  }, [rect])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown) }
  }, [onClose])

  const current: Code | undefined = list[cursor]?.code
  const toggle = (id: string) => toggleCode(sourceId, span.start, span.end, id)

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(list.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (current) { toggle(current.id); setQ('') }
      else if (q.trim()) { const id = addCode({ name: q.trim() }); toggle(id); setQ('') }
    }
  }

  let lastGroup: string | null | undefined
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Apply codes"
      className="fixed z-50 flex w-[min(40rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
      style={pos}
      onKeyDown={onKey}
    >
      <div className="flex w-full flex-col sm:w-80 sm:shrink-0 sm:border-r sm:border-line">
        <div className="border-b border-line p-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find or create a code…"
            className="h-8 w-full rounded-md bg-sunken px-2.5 text-sm outline-none placeholder:text-faint"
            aria-label="Find a code"
          />
          {hints.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {hints.map((h) => (
                <span key={h.label} className={cx('rounded px-1.5 py-px text-[11px] font-medium', h.ok ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn')}>
                  {h.ok ? '✓ ' : ''}{h.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <ul className="max-h-72 overflow-y-auto py-1 scroll-thin" role="listbox" aria-label="Codes">
          {list.map(({ code, depth }, i) => {
            const g = groupOf(code, codes, groups)
            const header = g?.id !== lastGroup
            lastGroup = g?.id
            const on = onSpan.has(code.id)
            return (
              <li key={code.id}>
                {header && !q && (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
                    {g ? g.name : 'Ungrouped'}{g && g.kind !== 'substantive' ? ` · ${GROUP_KIND_LABEL[g.kind]}` : ''}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => toggle(code.id)}
                  className={cx('flex w-full items-center gap-2 py-1.5 pr-3 text-left text-sm', i === cursor && 'bg-sunken')}
                  style={{ paddingLeft: 12 + depth * 14 }}
                >
                  <span className={cx('grid size-4 shrink-0 place-items-center rounded border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}>
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <Swatch color={code.color} />
                  <span className="truncate">{code.name}</span>
                </button>
              </li>
            )
          })}
          {list.length === 0 && q.trim() && (
            <li>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-sunken" onClick={() => { const id = addCode({ name: q.trim() }); toggle(id); setQ('') }}>
                <Plus size={14} /> Create “{q.trim()}” and apply
              </button>
            </li>
          )}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-[11px] text-muted">
          <span><Kbd>↑↓</Kbd> move</span><span><Kbd>↵</Kbd> toggle</span><span><Kbd>esc</Kbd> done</span>
        </div>
      </div>
      <div className="hidden min-w-0 flex-1 overflow-y-auto p-3 scroll-thin sm:block" style={{ maxHeight: '26rem' }}>
        {current ? <CodeCard code={current} /> : <p className="text-sm text-muted">Hover a code to see its definition.</p>}
      </div>
    </div>
  )
}
