import { useMemo, useState } from 'react'
import { AlertTriangle, RotateCcw, Save } from 'lucide-react'
import type { EditTarget } from 'document-kit/recipe'
import type { Project, ReportEdit } from '../../lib/types'
import type { DocumentEdits } from '../../lib/kit/render'
import { setReportEdits } from '../../lib/actions'
import { now } from '../../lib/model'
import { Badge, Button, Input, Select, Textarea, cx } from '../../components/ui'

// Hand edits of a Word/PDF document's wording. Each printed value (a paragraph, a list item, a table cell) can be
// replaced by a person's own words. Edits are kept with the study, for the scope the document covers, and applied
// every time a document is made again, from any recipe that prints the same part. When the generated wording under
// an edit changes (the analysis moved on), the edit is flagged so it can be checked.

const PAGE = 40

/** "#summary 01 Capacity / R01" → "Summary · 01 Capacity / R01"; the stable ids the components give their blocks. */
export function placeLabel(t: EditTarget) {
  const named: Record<string, string> = { summary: 'Summary', short: 'Summary (brief)', lead: 'Lead', 'lead-brief': 'Lead (brief)', card: 'Lead', 'theme summary': 'Theme summary' }
  return t.label.replace(/^#(theme summary|lead-brief|summary|short|lead|card) /, (_, k: string) => `${named[k]} · `)
}

export function EditWording({ project, scopeKey, scopeLabel, edits, building, mark, onMark }: {
  project: Project
  scopeKey: string
  scopeLabel: string
  edits: DocumentEdits | null
  building: boolean
  mark: boolean
  onMark: (on: boolean) => void
}) {
  const saved = project.reportEdits?.[scopeKey] ?? {}
  const [part, setPart] = useState('')
  const [query, setQuery] = useState('')
  const [only, setOnly] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const targets = edits?.targets ?? []
  const parts = useMemo(() => [...new Map(targets.map((t) => [t.part, t.partTitle])).entries()], [targets])
  const stale = new Set(edits?.stale ?? [])
  const q = query.trim().toLowerCase()
  const list = targets.filter((t) =>
    (!part || t.part === part) && (!only || t.edited !== undefined) &&
    (!q || `${placeLabel(t)} ${t.original ?? ''} ${t.edited ?? ''}`.toLowerCase().includes(q)))
  const editedCount = targets.filter((t) => t.edited !== undefined).length

  const save = (t: EditTarget, text: string) => {
    const edit: ReportEdit = { text, original: t.original, by: project.coder, at: now() }
    setReportEdits(scopeKey, { [t.key]: edit }, `edit wording: ${placeLabel(t).slice(0, 40)}`)
  }
  const undo = (key: string) => setReportEdits(scopeKey, { [key]: null }, 'undo a wording edit')
  const accept = (t: EditTarget) => saved[t.key] && setReportEdits(scopeKey, { [t.key]: { ...saved[t.key], original: t.original } }, 'keep a wording edit')

  return (
    <div className="h-[calc(100vh-11rem)] overflow-auto rounded-lg border border-line bg-surface" aria-busy={building}>
      <div className="sticky top-0 z-10 space-y-2 border-b border-line bg-surface p-3">
        <p className="text-xs text-muted">
          Change the wording of the Word and PDF documents for <b className="text-ink">{scopeLabel}</b>. Edits are kept with the study and applied each time a document is made again, from any recipe that prints the same part. They do not change the analysis or the web page report.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Select value={part} onChange={(e) => { setPart(e.target.value); setShown(PAGE) }} className="h-8 text-xs" aria-label="Part">
            <option value="">Every part ({targets.length})</option>
            {parts.map(([id, title]) => <option key={id} value={id}>{title} ({targets.filter((t) => t.part === id).length})</option>)}
          </Select>
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE) }} placeholder="Find wording" className="h-8 w-48 text-xs" aria-label="Find wording" />
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={only} onChange={(e) => { setOnly(e.target.checked); setShown(PAGE) }} />Edited only ({editedCount})</label>
          <label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={mark} onChange={(e) => onMark(e.target.checked)} />Highlight edits in Word and PDF</label>
        </div>
        {building && <p className="text-xs text-muted" role="status">Reading the document…</p>}
        {!!edits?.stale.length && <p className="flex items-center gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn"><AlertTriangle size={13} />{edits.stale.length} edit{edits.stale.length === 1 ? '' : 's'} sit on wording the study has since changed. Check {edits.stale.length === 1 ? 'it' : 'them'} below.</p>}
        {!!edits?.orphans.length && (
          <div className="rounded-md bg-sunken px-2.5 py-1.5 text-xs">
            <p className="font-medium">{edits.orphans.length} edit{edits.orphans.length === 1 ? ' has' : 's have'} no place in this document any more (the part or heading it sat under is gone). Kept until you remove {edits.orphans.length === 1 ? 'it' : 'them'}.</p>
            <ul className="mt-1 space-y-1">{edits.orphans.map((k) => (
              <li key={k} className="flex items-start gap-2"><span className="min-w-0 flex-1 truncate text-muted" title={saved[k]?.text}>{k.split('|').slice(0, 2).join(' › ').replace(/#/g, '')}: “{saved[k]?.text.slice(0, 80)}”</span><button type="button" className="text-accent hover:underline" onClick={() => undo(k)}>Remove</button></li>
            ))}</ul>
          </div>
        )}
      </div>
      <ul className="divide-y divide-line">
        {list.slice(0, shown).map((t) => <Row key={t.key} t={t} stale={stale.has(t.key)} saved={saved[t.key]} onSave={save} onUndo={undo} onAccept={accept} />)}
      </ul>
      {!edits && !building && <p className="p-4 text-sm text-muted">The document has not been read yet.</p>}
      {edits && !list.length && <p className="p-4 text-sm text-muted">Nothing matches.</p>}
      {list.length > shown && <div className="p-3"><Button size="sm" variant="ghost" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}</Button></div>}
    </div>
  )
}

function Row({ t, stale, saved, onSave, onUndo, onAccept }: {
  t: EditTarget; stale: boolean; saved: ReportEdit | undefined
  onSave: (t: EditTarget, text: string) => void; onUndo: (key: string) => void; onAccept: (t: EditTarget) => void
}) {
  const current = t.edited ?? t.original ?? ''
  const [text, setText] = useState(current)
  const [last, setLast] = useState(current)
  if (current !== last) { setLast(current); setText(current) }
  const changed = text !== current
  const rows = Math.min(8, Math.max(1, Math.ceil(text.length / 90)))
  return (
    <li className={cx('space-y-1.5 px-3 py-2.5', t.edited !== undefined && 'bg-accent-soft/40')}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium">{t.partTitle}</span>
        <span className="text-muted">› {placeLabel(t) || t.kind}</span>
        {t.edited !== undefined && <Badge tone="accent">edited{saved ? ` by ${saved.by}` : ''}</Badge>}
        {stale && <Badge tone="warn">wording changed since</Badge>}
      </div>
      {stale && saved && (
        <div className="rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
          <p>When you edited it, the document said: “{saved.original ?? '(blank)'}”</p>
          <p className="mt-1">It now says: “{t.original ?? '(blank)'}”</p>
          <button type="button" className="mt-1 font-medium underline" onClick={() => onAccept(t)}>Keep my edit</button>
        </div>
      )}
      {t.edited !== undefined && !stale && t.original !== null && <p className="text-xs text-muted">Generated: “{t.original.length > 240 ? `${t.original.slice(0, 240)}…` : t.original}”</p>}
      <Textarea value={text} rows={rows} onChange={(e) => setText(e.target.value)} className="w-full text-sm" aria-label={`Wording: ${t.partTitle} › ${placeLabel(t)}`} />
      <div className="flex gap-1.5">
        {changed && <Button size="sm" variant="primary" icon={<Save size={13} />} onClick={() => onSave(t, text)}>Save edit</Button>}
        {changed && <Button size="sm" variant="ghost" onClick={() => setText(current)}>Cancel</Button>}
        {t.edited !== undefined && !changed && <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => onUndo(t.key)}>Back to generated wording</Button>}
      </div>
    </li>
  )
}
