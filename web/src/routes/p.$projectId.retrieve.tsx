import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Download, Star, X } from 'lucide-react'
import type { Coding } from '../lib/types'
import { useProject } from '../lib/store'
import { coders, download, formatTime, indexBy, orderedCodes, quotable, segmentsOf, slug, speakerOf, timeAt, toCSV } from '../lib/model'
import { forExport } from '../lib/names'
import { Badge, Button, Empty, Input, PageHeader, Select, Swatch, cx } from '../components/ui'

interface Search { codes?: string; sources?: string; mode?: 'any' | 'all'; attr?: string; coder?: string; key?: boolean; q?: string }

export const Route = createFileRoute('/p/$projectId/retrieve')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    codes: typeof s.codes === 'string' ? s.codes : undefined,
    sources: typeof s.sources === 'string' ? s.sources : undefined,
    mode: s.mode === 'all' ? 'all' : undefined,
    attr: typeof s.attr === 'string' ? s.attr : undefined,
    coder: typeof s.coder === 'string' ? s.coder : undefined,
    key: s.key === true ? true : undefined,
    q: typeof s.q === 'string' ? s.q : undefined,
  }),
  component: Retrieve,
})

const list = (v?: string) => (v ? v.split(',').filter(Boolean) : [])

interface Hit { sourceId: string; start: number; end: number; codings: Coding[] }

function Retrieve() {
  const project = useProject()
  const s = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const set = (change: Partial<Search>) => navigate({ search: (prev: Search) => ({ ...prev, ...change }), replace: true })
  const codeIds = list(s.codes)
  const sourceIds = list(s.sources)
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const sources = useMemo(() => indexBy(project.sources), [project.sources])
  const [q, setQ] = useState(s.q ?? '')

  const attrOptions = useMemo(() => {
    const out = new Set<string>()
    for (const src of project.sources) for (const [k, v] of Object.entries(src.attributes)) if (v) out.add(`${k}=${v}`)
    return [...out].sort()
  }, [project.sources])

  const hits = useMemo<Hit[]>(() => {
    const [ak, av] = s.attr ? [s.attr.slice(0, s.attr.indexOf('=')), s.attr.slice(s.attr.indexOf('=') + 1)] : []
    const okSource = (id: string) => {
      if (sourceIds.length && !sourceIds.includes(id)) return false
      if (ak != null && (sources.get(id)?.attributes[ak] ?? '') !== av) return false
      return true
    }
    const pool = project.codings.filter((c) => c.status === 'accepted' && okSource(c.sourceId) && (!s.coder || c.coder === s.coder))
    const bySpan = new Map<string, Hit>()
    for (const c of pool) {
      const k = `${c.sourceId}:${c.start}:${c.end}`
      if (!bySpan.has(k)) bySpan.set(k, { sourceId: c.sourceId, start: c.start, end: c.end, codings: [] })
      bySpan.get(k)!.codings.push(c)
    }
    let out = [...bySpan.values()]
    if (codeIds.length) {
      out = out.filter((h) => {
        const has = (id: string) => h.codings.some((c) => c.codeId === id) ||
          // "all" also matches when another code overlaps the span.
          (s.mode === 'all' && pool.some((c) => c.codeId === id && c.sourceId === h.sourceId && c.start < h.end && c.end > h.start))
        return s.mode === 'all' ? codeIds.every(has) : codeIds.some((id) => h.codings.some((c) => c.codeId === id))
      })
    }
    if (s.key) out = out.filter((h) => h.codings.some((c) => c.important))
    const needle = (s.q ?? '').trim().toLowerCase()
    if (needle) out = out.filter((h) => sources.get(h.sourceId)?.text.slice(h.start, h.end).toLowerCase().includes(needle))
    const order = new Map(project.sources.map((x, i) => [x.id, i]))
    return out.sort((a, b) => (order.get(a.sourceId)! - order.get(b.sourceId)!) || a.start - b.start)
  }, [project.codings, project.sources, sources, s.attr, s.coder, s.key, s.q, s.mode, codeIds.join(), sourceIds.join()])

  const exportCSV = () => {
    const rows = [['Source', 'Speaker', 'Time', 'Codes', 'Coder', 'Key passage', 'Text', 'Start', 'End']]
    for (const h of hits) {
      const src = sources.get(h.sourceId)!
      const seg = segmentsOf(src).find((g) => g.start <= h.start && g.end >= h.start)
      rows.push([
        src.name, seg ? speakerOf(src, seg.speaker)?.name || seg.speaker : '', formatTime(timeAt(src, h.start)),
        h.codings.map((c) => codes.get(c.codeId)?.name).join('; '), [...new Set(h.codings.map((c) => c.coder))].join('; '),
        h.codings.some((c) => c.important) ? 'yes' : '', quotable(project, src, h.start, h.end), String(h.start), String(h.end),
      ])
    }
    download(`${slug(project.name)}-excerpts.csv`, '﻿' + forExport(project, toCSV(rows)), 'text/csv')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Retrieve"
        actions={<Button icon={<Download size={15} />} disabled={!hits.length} onClick={exportCSV}>Export {hits.length} as CSV</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-[13px] font-medium">
              Codes
              {codeIds.length > 1 && (
                <Select value={s.mode ?? 'any'} onChange={(e) => set({ mode: e.target.value === 'all' ? 'all' : undefined })} className="h-7 text-xs">
                  <option value="any">match any</option>
                  <option value="all">co-occur (all)</option>
                </Select>
              )}
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {codeIds.map((id) => (
                <Badge key={id}><Swatch color={codes.get(id)?.color ?? '#888'} />{codes.get(id)?.name}
                  <button type="button" aria-label="Remove" onClick={() => set({ codes: codeIds.filter((x) => x !== id).join(',') || undefined })}><X size={11} /></button>
                </Badge>
              ))}
            </div>
            <Select value="" onChange={(e) => e.target.value && set({ codes: [...codeIds, e.target.value].join(',') })} className="w-full" aria-label="Add a code">
              <option value="">Add a code…</option>
              {orderedCodes(project).filter(({ code }) => !codeIds.includes(code.id)).map(({ code, depth }) => <option key={code.id} value={code.id}>{'  '.repeat(depth)}{code.name}</option>)}
            </Select>
          </div>
          <div>
            <div className="mb-1 text-[13px] font-medium">Sources</div>
            <div className="space-y-1">
              {project.sources.map((src) => (
                <label key={src.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={sourceIds.includes(src.id)} onChange={(e) => set({ sources: (e.target.checked ? [...sourceIds, src.id] : sourceIds.filter((x) => x !== src.id)).join(',') || undefined })} />
                  <span className="truncate">{src.name}</span>
                </label>
              ))}
            </div>
          </div>
          {attrOptions.length > 0 && (
            <div>
              <div className="mb-1 text-[13px] font-medium">Source attribute</div>
              <Select value={s.attr ?? ''} onChange={(e) => set({ attr: e.target.value || undefined })} className="w-full">
                <option value="">Any</option>
                {attrOptions.map((o) => <option key={o} value={o}>{o.replace('=', ': ')}</option>)}
              </Select>
            </div>
          )}
          <div>
            <div className="mb-1 text-[13px] font-medium">Coder</div>
            <Select value={s.coder ?? ''} onChange={(e) => set({ coder: e.target.value || undefined })} className="w-full">
              <option value="">Anyone</option>
              {coders(project).map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.key} onChange={(e) => set({ key: e.target.checked || undefined })} /> Key passages only</label>
          <form onSubmit={(e) => { e.preventDefault(); set({ q: q || undefined }) }}>
            <div className="mb-1 text-[13px] font-medium">Text contains</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => set({ q: q || undefined })} placeholder="word or phrase" />
          </form>
        </aside>

        <section>
          <p className="mb-3 text-sm text-muted">{hits.length} {hits.length === 1 ? 'passage' : 'passages'} from {new Set(hits.map((h) => h.sourceId)).size} sources</p>
          {hits.length === 0 ? <Empty title="No passages match" /> : (
            <ol className="space-y-3">
              {hits.slice(0, 400).map((h) => {
                const src = sources.get(h.sourceId)!
                const seg = segmentsOf(src).find((g) => g.start <= h.start && g.end >= h.start)
                const before = src.text.slice(Math.max(seg?.start ?? 0, h.start - 160), h.start)
                const after = src.text.slice(h.end, Math.min(seg?.end ?? src.text.length, h.end + 160))
                return (
                  <li key={`${h.sourceId}:${h.start}:${h.end}`} className="rounded-lg border border-line bg-surface p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="font-medium text-ink">{src.name}</span>
                      {seg?.speaker && <span>{speakerOf(src, seg.speaker)?.name || seg.speaker}</span>}
                      {timeAt(src, h.start) != null && <span className="font-mono">{formatTime(timeAt(src, h.start))}</span>}
                      {h.codings.some((c) => c.important) && <Star size={12} className="fill-warn text-warn" />}
                      <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: h.sourceId, at: h.start, end: h.end }} className="ml-auto text-accent hover:underline">Open in context</Link>
                    </div>
                    <p className="font-serif text-[15.5px] leading-relaxed">
                      <span className="text-faint">{before.length >= 160 ? '…' : ''}{before}</span>
                      <mark className={cx('rounded-sm bg-accent-soft px-0.5 text-ink')}>{src.text.slice(h.start, h.end)}</mark>
                      <span className="text-faint">{after}{after.length >= 160 ? '…' : ''}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[...new Set(h.codings.map((c) => c.codeId))].map((id) => (
                        <Badge key={id}><Swatch color={codes.get(id)?.color ?? '#888'} />{codes.get(id)?.name}</Badge>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {hits.length > 400 && <p className="mt-3 text-sm text-muted">Showing the first 400. Narrow the filters or export the full set.</p>}
        </section>
      </div>
    </div>
  )
}
