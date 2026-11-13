import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Download, Pin, Plus, Trash2, X } from 'lucide-react'
import type { Case, Coding, FrameworkCell, Theme } from '../lib/types'
import { update, useProject } from '../lib/store'
import { addMissingCases, removeEmptyCases, renameCase } from '../lib/actions'
import { download, excerpt, formatTime, indexBy, orderedCodes, quotable, slug, timeAt, toCSV, uid } from '../lib/model'
import { forExport } from '../lib/names'
import { Badge, Button, Empty, IconButton, Input, PageHeader, Panel, Select, Swatch, Textarea, cx } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/framework')({ component: Framework })

function Framework() {
  const project = useProject()
  const [sel, setSel] = useState<{ caseId: string; themeId: string } | null>(null)
  const [editThemes, setEditThemes] = useState(false)
  const codes = indexBy(project.codes)

  const evidenceFor = useMemo(() => (kase: Case, theme: Theme) =>
    project.codings.filter((c) => c.status === 'accepted' && kase.sourceIds.includes(c.sourceId) && theme.codeIds.includes(c.codeId)), [project.codings])
  const cellOf = (caseId: string, themeId: string) => project.cells.find((c) => c.caseId === caseId && c.themeId === themeId)
  const setCell = (caseId: string, themeId: string, change: Partial<FrameworkCell>) =>
    update('edit framework cell', (p) => {
      const cur = p.cells.find((c) => c.caseId === caseId && c.themeId === themeId)
      const next = { caseId, themeId, summary: '', pinned: [], ...cur, ...change }
      return { ...p, cells: cur ? p.cells.map((c) => (c === cur ? next : c)) : [...p.cells, next] }
    })

  const exportCSV = () => {
    const sources = indexBy(project.sources)
    const rows = [['Case', ...project.themes.map((t) => t.title)]]
    for (const k of project.cases) {
      rows.push([k.name, ...project.themes.map((t) => {
        const cell = cellOf(k.id, t.id)
        const pinned = (cell?.pinned ?? []).map((id) => project.codings.find((c) => c.id === id)).filter(Boolean)
          .map((c) => `“${quotable(project, sources.get(c!.sourceId), c!.start, c!.end)}”`)
        return [cell?.summary ?? '', ...pinned].filter(Boolean).join('\n')
      })])
    }
    download(`${slug(project.name)}-framework.csv`, '﻿' + forExport(project, toCSV(rows)), 'text/csv')
  }

  const selCase = sel && project.cases.find((c) => c.id === sel.caseId)
  const selTheme = sel && project.themes.find((t) => t.id === sel.themeId)

  const inCase = new Set(project.cases.flatMap((c) => c.sourceIds))
  const caseless = project.cases.length ? project.sources.filter((s) => !inCase.has(s.id)) : []
  const emptyCases = project.cases.filter((c) => !c.sourceIds.some((id) => project.sources.some((s) => s.id === id)))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-6 sm:px-6">
        <PageHeader
          title="Framework matrix"
          actions={
            <>
              {emptyCases.length > 0 && (
                <Button icon={<Trash2 size={15} />} onClick={() => confirm(`Remove ${emptyCases.map((c) => `“${c.name}”`).join(', ')}? ${emptyCases.length === 1 ? 'This case has' : 'These cases have'} no sources left. You can undo this.`) && removeEmptyCases()}>
                  Remove {emptyCases.length === 1 ? 'a case' : `${emptyCases.length} cases`} with no sources
                </Button>
              )}
              {caseless.length > 0 && (
                <Button variant="primary" icon={<Plus size={15} />} onClick={addMissingCases} title={caseless.map((s) => s.name).join('\n')}>
                  Add {caseless.length === 1 ? 'a case' : `${caseless.length} cases`} for new sources
                </Button>
              )}
              <Button onClick={() => setEditThemes((v) => !v)}>{editThemes ? 'Done editing themes' : 'Edit themes'}</Button>
              <Button icon={<Download size={15} />} disabled={!project.themes.length} onClick={exportCSV}>CSV</Button>
            </>
          }
        />
      </div>

      {editThemes && <ThemeEditor />}

      {project.cases.length === 0 ? (
        <div className="px-6"><Panel><Empty title="No cases" action={<Button onClick={() => update('create cases', (p) => ({ ...p, cases: p.sources.map((s) => ({ id: uid(), name: s.name, sourceIds: [s.id], attributes: { ...s.attributes } })) }))}>One case per source</Button>}>Cases are the rows: usually one per respondent.</Empty></Panel></div>
      ) : project.themes.length === 0 ? (
        <div className="px-6"><Panel><Empty title="No themes yet" action={<Button variant="primary" onClick={() => setEditThemes(true)}>Add a theme</Button>}>Themes are the columns. Give each one the codes that feed it.</Empty></Panel></div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-0 border-t border-line">
          <div className="min-w-0 flex-1 overflow-auto scroll-thin">
            <table className="border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 w-48 min-w-48 border-r border-b border-line bg-surface px-4 py-2 text-left text-xs font-medium text-muted">Case</th>
                  {project.themes.map((t) => (
                    <th key={t.id} className="w-64 min-w-64 border-b border-line bg-surface px-3 py-2 text-left align-top">
                      <div className="text-sm font-semibold">{t.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1">{t.codeIds.slice(0, 5).map((id) => <Swatch key={id} color={codes.get(id)?.color ?? '#888'} />)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {project.cases.map((k) => (
                  <tr key={k.id}>
                    <th className="sticky left-0 z-10 border-r border-b border-line bg-surface px-4 py-3 text-left align-top">
                      <input
                        key={k.name}
                        defaultValue={k.name}
                        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== k.name && renameCase(k.id, e.target.value.trim())}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        aria-label={`Case name: ${k.name}`}
                        className="-mx-1 w-full rounded bg-transparent px-1 font-medium hover:bg-sunken focus:bg-sunken"
                      />
                      {!k.sourceIds.some((id) => project.sources.some((s) => s.id === id)) && <div className="mt-0.5 text-xs font-normal text-bad">No sources</div>}
                      <div className="mt-0.5 text-xs font-normal text-muted">{Object.entries(k.attributes).slice(0, 2).map(([a, v]) => `${a}: ${v}`).join(' · ')}</div>
                    </th>
                    {project.themes.map((t) => {
                      const cell = cellOf(k.id, t.id)
                      const ev = evidenceFor(k, t)
                      const active = sel?.caseId === k.id && sel?.themeId === t.id
                      return (
                        <td key={t.id} className="border-b border-line p-0 align-top">
                          <button
                            type="button"
                            onClick={() => setSel({ caseId: k.id, themeId: t.id })}
                            className={cx('block h-full min-h-24 w-full px-3 py-2.5 text-left hover:bg-sunken/60', active && 'bg-accent-soft ring-2 ring-accent ring-inset')}
                          >
                            {cell?.summary ? <p className="line-clamp-4 text-[13px]">{cell.summary}</p> : <p className="text-[13px] text-faint italic">{ev.length ? 'Not summarised' : 'No evidence'}</p>}
                            <div className="mt-1.5 flex gap-1.5 text-[11px] text-muted">
                              {ev.length > 0 && <span>{ev.length} passages</span>}
                              {(cell?.pinned.length ?? 0) > 0 && <span className="text-accent">{cell!.pinned.length} pinned</span>}
                            </div>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selCase && selTheme && (
            <aside className="fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col overflow-hidden rounded-t-xl border-t border-line bg-surface shadow-2xl lg:static lg:max-h-none lg:w-[28rem] lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none">
              <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <div className="text-xs text-muted">{selCase.name}</div>
                  <div className="font-semibold">{selTheme.title}</div>
                </div>
                <IconButton label="Close cell" onClick={() => setSel(null)}><X size={16} /></IconButton>
              </header>
              <div className="flex-1 space-y-4 overflow-y-auto p-4 scroll-thin">
                <div>
                  <label className="mb-1 block text-[13px] font-medium" htmlFor="cell-summary">Summary</label>
                  <Textarea
                    id="cell-summary"
                    key={`${selCase.id}:${selTheme.id}`}
                    rows={5}
                    defaultValue={cellOf(selCase.id, selTheme.id)?.summary ?? ''}
                    onBlur={(e) => e.target.value !== (cellOf(selCase.id, selTheme.id)?.summary ?? '') && setCell(selCase.id, selTheme.id, { summary: e.target.value })}
                    placeholder="Summarise what this respondent says about the theme, staying close to their words."
                  />
                </div>
                <CellEvidence kase={selCase} theme={selTheme} evidence={evidenceFor(selCase, selTheme)} pinned={cellOf(selCase.id, selTheme.id)?.pinned ?? []}
                  onPin={(id) => {
                    const cur = cellOf(selCase.id, selTheme.id)?.pinned ?? []
                    setCell(selCase.id, selTheme.id, { pinned: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
                  }} />
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function CellEvidence({ kase, theme, evidence, pinned, onPin }: { kase: Case; theme: Theme; evidence: Coding[]; pinned: string[]; onPin: (id: string) => void }) {
  const project = useProject()
  const sources = indexBy(project.sources)
  const codes = indexBy(project.codes)
  const list = evidence
  // One entry per span, pinned first.
  const spans = new Map<string, typeof list>()
  for (const c of list) {
    const k = `${c.sourceId}:${c.start}:${c.end}`
    if (!spans.has(k)) spans.set(k, [])
    spans.get(k)!.push(c)
  }
  const entries = [...spans.values()].sort((a, b) => Number(b.some((c) => pinned.includes(c.id))) - Number(a.some((c) => pinned.includes(c.id))) || a[0].start - b[0].start)
  return (
    <div>
      <div className="mb-2 text-[13px] font-medium">Evidence <span className="font-normal text-muted">· {entries.length} passages from {kase.sourceIds.length} source{kase.sourceIds.length === 1 ? '' : 's'}</span></div>
      {entries.length === 0 ? <p className="text-sm text-muted">No passages in this case use the theme's codes{theme.codeIds.length ? '' : ' — the theme has no codes yet'}.</p> : (
        <ul className="space-y-2">
          {entries.map((group) => {
            const c = group[0]
            const src = sources.get(c.sourceId)
            const isPinned = group.some((g) => pinned.includes(g.id))
            return (
              <li key={c.id} className={cx('rounded-md border px-3 py-2', isPinned ? 'border-accent bg-accent-soft/50' : 'border-line')}>
                <p className="font-serif text-[14.5px] leading-relaxed">{src ? excerpt(src.text, c.start, c.end) : ''}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {group.map((g) => <Badge key={g.id}><Swatch color={codes.get(g.codeId)?.color ?? '#888'} />{codes.get(g.codeId)?.name}</Badge>)}
                  <span className="text-xs text-faint">{src && timeAt(src, c.start) != null ? formatTime(timeAt(src, c.start)) : ''}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: c.sourceId, at: c.start, end: c.end }} className="text-xs text-accent hover:underline">Context</Link>
                    <IconButton label={isPinned ? 'Unpin' : 'Pin as key evidence'} onClick={() => onPin(c.id)}><Pin size={14} className={isPinned ? 'fill-accent text-accent' : ''} /></IconButton>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ThemeEditor() {
  const project = useProject()
  const [title, setTitle] = useState('')
  const codes = indexBy(project.codes)
  const all = orderedCodes(project)
  const set = (id: string, change: Partial<Theme>) => update('edit theme', (p) => ({ ...p, themes: p.themes.map((t) => (t.id === id ? { ...t, ...change } : t)) }))
  return (
    <div className="mx-4 mb-4 rounded-lg border border-line bg-surface p-4 sm:mx-6">
      <ul className="space-y-3">
        {project.themes.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2">
            <Input defaultValue={t.title} onBlur={(e) => e.target.value !== t.title && set(t.id, { title: e.target.value })} className="w-72 font-medium" aria-label="Theme title" />
            {t.codeIds.map((id) => (
              <Badge key={id}><Swatch color={codes.get(id)?.color ?? '#888'} />{codes.get(id)?.name}
                <button type="button" aria-label="Remove code" onClick={() => set(t.id, { codeIds: t.codeIds.filter((x) => x !== id) })}><X size={11} /></button>
              </Badge>
            ))}
            <Select value="" onChange={(e) => e.target.value && set(t.id, { codeIds: [...t.codeIds, e.target.value] })} className="h-7 text-xs" aria-label="Add code to theme">
              <option value="">+ code</option>
              {all.filter(({ code }) => !t.codeIds.includes(code.id)).map(({ code, depth }) => <option key={code.id} value={code.id}>{'  '.repeat(depth)}{code.name}</option>)}
            </Select>
            <IconButton label="Delete theme" onClick={() => update('delete theme', (p) => ({ ...p, themes: p.themes.filter((x) => x.id !== t.id), cells: p.cells.filter((c) => c.themeId !== t.id) }))}><Trash2 size={14} /></IconButton>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { update('add theme', (p) => ({ ...p, themes: [...p.themes, { id: uid(), title: title.trim(), codeIds: [], interpretation: '' }] })); setTitle('') } }}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New theme" className="w-72" />
        <Button type="submit" icon={<Plus size={14} />}>Add theme</Button>
      </form>
    </div>
  )
}
