import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  createColumnHelper, createSortedRowModel, rowSortingFeature, sortFn_alphanumeric, tableFeatures, useTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, Download, Plus, Trash2, Upload } from 'lucide-react'
import type { Code, GroupKind, Rule, RuleKind } from '../lib/types'
import { useProject, update } from '../lib/store'
import { GROUP_KIND_LABEL, describeRule, excerpt, groupOf, indexBy, orderedCodes, suggestedRules, uid, download, slug } from '../lib/model'
import { addCode, addGroup, mergeCode, removeCode, removeGroup, setProject, updateCode, updateGroup } from '../lib/actions'
import { codebookCSV, codebookQDC, mergeCodebookCSV } from '../lib/codebook-io'
import { Badge, Button, Dialog, Field, IconButton, Input, PageHeader, Panel, Select, Swatch, Tabs, Textarea, cx } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/codebook')({ component: Codebook })

interface Row {
  code: Code
  depth: number
  path: string
  group: string
  uses: number
  sources: number
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})
const helper = createColumnHelper<typeof features, Row>()
const columns = helper.columns([
  helper.accessor('path', { header: 'Code', sortFn: 'alphanumeric' }),
  helper.accessor('group', { header: 'Group', sortFn: 'alphanumeric' }),
  helper.accessor((r) => r.code.definition, { id: 'definition', header: 'Definition', enableSorting: false }),
  helper.accessor('uses', { header: 'Uses' }),
  helper.accessor('sources', { header: 'Sources' }),
])

function Codebook() {
  const project = useProject()
  const [tab, setTab] = useState<'codes' | 'rules'>('codes')
  const [editing, setEditing] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  const data = useMemo<Row[]>(() => {
    const codes = indexBy(project.codes)
    const groups = indexBy(project.groups)
    const uses = new Map<string, number>()
    const srcs = new Map<string, Set<string>>()
    for (const c of project.codings) {
      if (c.status !== 'accepted') continue
      uses.set(c.codeId, (uses.get(c.codeId) ?? 0) + 1)
      if (!srcs.has(c.codeId)) srcs.set(c.codeId, new Set())
      srcs.get(c.codeId)!.add(c.sourceId)
    }
    const needle = filter.trim().toLowerCase()
    return orderedCodes(project)
      .filter(({ code }) => !needle || code.name.toLowerCase().includes(needle) || code.definition.toLowerCase().includes(needle))
      .map(({ code, depth }, i) => ({
        code, depth, path: String(i).padStart(5, '0') + code.name,
        group: groupOf(code, codes, groups)?.name ?? '',
        uses: uses.get(code.id) ?? 0, sources: srcs.get(code.id)?.size ?? 0,
      }))
  }, [project, filter])

  const table = useTable({ features, columns, data })
  const editCode = project.codes.find((c) => c.id === editing)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Codebook"
        actions={
          <>
            <Button icon={<Upload size={15} />} onClick={() => csvRef.current?.click()}>Import CSV</Button>
            <Button icon={<Download size={15} />} onClick={() => download(`${slug(project.name)}-codebook.csv`, codebookCSV(project), 'text/csv')}>CSV</Button>
            <Button icon={<Download size={15} />} onClick={() => download(`${slug(project.name)}.qdc`, codebookQDC(project), 'application/xml')} title="REFI-QDA codebook for NVivo, ATLAS.ti, MAXQDA, QualCoder">REFI-QDA</Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing(addCode({ name: 'New code' }))}>New code</Button>
          </>
        }
      />
      <input ref={csvRef} type="file" accept=".csv" hidden onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        try {
          const text = await f.text()
          let result = { added: 0, updated: 0 }
          update('import codebook', (p) => { const r = mergeCodebookCSV(p, text); result = r; return r.project })
          setMsg(`Imported: ${result.added} new codes, ${result.updated} updated.`)
        } catch (err) { setMsg(err instanceof Error ? err.message : String(err)) }
        e.target.value = ''
      }} />
      {msg && <p className="mb-4 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">{msg}</p>}

      <Tabs value={tab} onChange={setTab} items={[
        { value: 'codes', label: <>Codes <Badge>{project.codes.length}</Badge></> },
        { value: 'rules', label: <>Groups & rules <Badge>{project.rules.filter((r) => r.enabled).length}</Badge></> },
      ]} />

      {tab === 'codes' ? (
        <div className="mt-4">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter codes or definitions" className="mb-3 max-w-sm" aria-label="Filter codes" />
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-line text-left text-xs text-muted">
                    {hg.headers.map((h) => {
                      const sorted = h.column.getIsSorted()
                      return (
                        <th key={h.id} className={cx('px-3 py-2 font-medium', (h.id === 'uses' || h.id === 'sources') && 'w-20 text-right')}>
                          {h.column.getCanSort() ? (
                            <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-ink">
                              <table.FlexRender header={h} />
                              {sorted === 'asc' ? <ArrowUp size={12} /> : sorted === 'desc' ? <ArrowDown size={12} /> : null}
                            </button>
                          ) : <table.FlexRender header={h} />}
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => {
                  const r = row.original
                  return (
                    <tr key={r.code.id} onClick={() => setEditing(r.code.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken/60">
                      <td className="px-3 py-2" style={{ paddingLeft: 12 + r.depth * 16 }}>
                        <span className="flex items-center gap-2"><Swatch color={r.code.color} /><span className="font-medium">{r.code.name}</span></span>
                      </td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{r.group || '—'}</td>
                      <td className="max-w-md px-3 py-2"><span className="line-clamp-2 text-muted">{r.code.definition || <em className="text-faint">No definition</em>}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.uses || <span className="text-faint">0</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.sources || <span className="text-faint">0</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <GroupsAndRules />
      )}

      {editCode && <CodeEditor code={editCode} onClose={() => setEditing(null)} />}
    </div>
  )
}

function CodeEditor({ code, onClose }: { code: Code; onClose: () => void }) {
  const project = useProject()
  const [mergeInto, setMergeInto] = useState('')
  const examples = project.codings.filter((c) => c.codeId === code.id && c.status === 'accepted').slice(0, 6)
  const sources = indexBy(project.sources)
  const set = (k: keyof Code) => (e: { target: { value: string } }) => {
    const v = k === 'parentId' || k === 'groupId' ? e.target.value || null : e.target.value
    if (v !== code[k]) updateCode(code.id, { [k]: v })
  }
  const descendants = new Set<string>([code.id])
  let grew = true
  while (grew) { grew = false; for (const c of project.codes) if (c.parentId && descendants.has(c.parentId) && !descendants.has(c.id)) { descendants.add(c.id); grew = true } }

  return (
    <Dialog open onClose={onClose} title="Edit code" wide footer={
      <>
        <Button variant="danger" icon={<Trash2 size={14} />} className="mr-auto" onClick={() => {
          const n = project.codings.filter((c) => c.codeId === code.id).length
          if (confirm(`Delete “${code.name}”${n ? ` and its ${n} codings` : ''}? You can undo this.`)) { removeCode(code.id); onClose() }
        }}>Delete</Button>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>
    }>
      <div className="grid gap-4 sm:grid-cols-[1fr_15rem]">
        <div className="space-y-3">
          <Field label="Name">{(id) => <Input id={id} defaultValue={code.name} onBlur={set('name')} />}</Field>
          <Field label="Definition">{(id) => <Textarea id={id} rows={3} defaultValue={code.definition} onBlur={set('definition')} />}</Field>
          <Field label="Include when">{(id) => <Textarea id={id} rows={2} defaultValue={code.include} onBlur={set('include')} />}</Field>
          <Field label="Exclude when">{(id) => <Textarea id={id} rows={2} defaultValue={code.exclude} onBlur={set('exclude')} />}</Field>
          <Field label="Anchor example">{(id) => <Textarea id={id} rows={2} defaultValue={code.anchor} onBlur={set('anchor')} className="font-serif" />}</Field>
        </div>
        <div className="space-y-3">
          <Field label="Group">{(id) => (
            <Select id={id} value={code.groupId ?? ''} onChange={set('groupId')} className="w-full">
              <option value="">None (inherit from parent)</option>
              {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          )}</Field>
          <Field label="Parent code">{(id) => (
            <Select id={id} value={code.parentId ?? ''} onChange={set('parentId')} className="w-full">
              <option value="">None</option>
              {project.codes.filter((c) => !descendants.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}</Field>
          <Field label="Colour">{(id) => <input id={id} type="color" value={/^#[0-9a-f]{6}$/i.test(code.color) ? code.color : '#888888'} onChange={set('color')} className="h-8 w-16 rounded border border-line-strong bg-surface" />}</Field>
          <Field label="Merge into…" hint="Moves every coding to the other code, then deletes this one. A snapshot is taken first.">{(id) => (
            <div className="flex gap-1.5">
              <Select id={id} value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="min-w-0 flex-1">
                <option value="">Choose…</option>
                {project.codes.filter((c) => c.id !== code.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Button size="sm" disabled={!mergeInto} onClick={async () => { await mergeCode(code.id, mergeInto); onClose() }}>Merge</Button>
            </div>
          )}</Field>
        </div>
      </div>
      <section className="mt-5">
        <h3 className="mb-2 text-sm font-semibold">Coded examples</h3>
        {examples.length === 0 ? <p className="text-sm text-muted">Not applied yet.</p> : (
          <ul className="space-y-2">
            {examples.map((c) => {
              const s = sources.get(c.sourceId)
              return (
                <li key={c.id}>
                  <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: c.sourceId, at: c.start, end: c.end }} className="block rounded-md border-l-2 bg-sunken px-3 py-2 hover:bg-accent-soft" style={{ borderColor: code.color }}>
                    <span className="line-clamp-3 font-serif text-[15px]">{s ? excerpt(s.text, c.start, c.end) : ''}</span>
                    <span className="mt-1 block text-xs text-muted">{s?.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </Dialog>
  )
}

const RULE_KINDS: { value: RuleKind; label: string }[] = [
  { value: 'exactly-one', label: 'needs exactly one code from' },
  { value: 'at-most-one', label: 'may have at most one code from' },
  { value: 'requires-extraction', label: 'needs an extraction row' },
]

function GroupsAndRules() {
  const project = useProject()
  const groups = indexBy(project.groups)
  const [name, setName] = useState('')
  const [fields, setFields] = useState(project.extractionFields.join(', '))
  const setRule = (id: string, change: Partial<Rule>) =>
    update('edit rule', (p) => ({ ...p, rules: p.rules.map((r) => (r.id === id ? { ...r, ...change } : r)) }))

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-2">
      <Panel title="Groups" bodyClass="p-0">
        <p className="border-b border-line px-4 py-2 text-xs text-muted">
          A group's <em>kind</em> tells the rules what it is for. Evidence grades and stances are usually one-per-claim domains.
        </p>
        <ul className="divide-y divide-line">
          {project.groups.map((g) => (
            <li key={g.id} className="flex items-center gap-2 px-4 py-2">
              <input type="color" value={g.color} onChange={(e) => updateGroup(g.id, { color: e.target.value })} className="h-6 w-7 shrink-0 rounded border border-line" aria-label={`Colour of ${g.name}`} />
              <Input defaultValue={g.name} onBlur={(e) => e.target.value !== g.name && updateGroup(g.id, { name: e.target.value })} className="h-7" aria-label="Group name" />
              <Select value={g.kind} onChange={(e) => updateGroup(g.id, { kind: e.target.value as GroupKind })} className="h-7 w-36 shrink-0 text-xs" aria-label="Kind">
                {Object.entries(GROUP_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <IconButton label={`Delete group ${g.name}`} onClick={() => confirm(`Delete group “${g.name}”? Its codes are kept, ungrouped.`) && removeGroup(g.id)}><Trash2 size={14} /></IconButton>
            </li>
          ))}
        </ul>
        <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { addGroup(name.trim(), 'substantive'); setName('') } }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group name" className="h-8" />
          <Button size="sm" type="submit" icon={<Plus size={13} />}>Add</Button>
        </form>
      </Panel>

      <div className="space-y-5">
        <Panel
          title="Rules"
          bodyClass="p-0"
          actions={
            <Button size="sm" onClick={() => {
              const fresh = suggestedRules(project.groups).filter((s) => !project.rules.some((r) => r.kind === s.kind && r.targetGroupId === s.targetGroupId))
              if (fresh.length) update('add suggested rules', (p) => ({ ...p, rules: [...p.rules, ...fresh] }))
            }}>Suggest from groups</Button>
          }
        >
          {project.rules.length === 0 && <p className="px-4 py-3 text-sm text-muted">No rules. Set group kinds (Evidence grade, Stance, Flag) and use “Suggest from groups”.</p>}
          <ul className="divide-y divide-line">
            {project.rules.map((r) => (
              <li key={r.id} className={cx('space-y-2 px-4 py-3', !r.enabled && 'opacity-60')}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => setRule(r.id, { enabled: e.target.checked })} className="mt-1" aria-label="Rule enabled" />
                  <p className="flex-1 text-sm font-medium">{describeRule(r, groups)}</p>
                  <IconButton label="Delete rule" onClick={() => update('delete rule', (p) => ({ ...p, rules: p.rules.filter((x) => x.id !== r.id) }))}><Trash2 size={14} /></IconButton>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-muted">
                  <span>Each span coded with</span>
                  <Select
                    className="h-7 text-xs"
                    value={r.triggerGroupIds.length > 1 ? '__many' : r.triggerGroupIds[0] ?? ''}
                    onChange={(e) => setRule(r.id, { triggerGroupIds: e.target.value === '__sub' ? project.groups.filter((g) => g.kind === 'substantive').map((g) => g.id) : [e.target.value] })}
                  >
                    {r.triggerGroupIds.length > 1 && <option value="__many">{r.triggerGroupIds.length} groups</option>}
                    <option value="__sub">any substantive group</option>
                    {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                  <Select className="h-7 text-xs" value={r.kind} onChange={(e) => setRule(r.id, { kind: e.target.value as RuleKind })}>
                    {RULE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </Select>
                  {r.kind !== 'requires-extraction' && (
                    <Select className="h-7 text-xs" value={r.targetGroupId ?? ''} onChange={(e) => setRule(r.id, { targetGroupId: e.target.value || null })}>
                      <option value="">Choose group…</option>
                      {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </Select>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-3">
            <Button size="sm" icon={<Plus size={13} />} onClick={() => update('add rule', (p) => ({
              ...p, rules: [...p.rules, { id: uid(), kind: 'exactly-one', triggerGroupIds: p.groups.filter((g) => g.kind === 'substantive').map((g) => g.id), targetGroupId: null, enabled: true }],
            }))}>Add rule</Button>
          </div>
        </Panel>

        <Panel title="Extraction fields">
          <p className="mb-2 text-xs text-muted">Columns recorded for each flag coding (e.g. cost-benefit figures). Comma-separated.</p>
          <div className="flex gap-2">
            <Input value={fields} onChange={(e) => setFields(e.target.value)} />
            <Button size="sm" onClick={() => setProject('edit extraction fields', { extractionFields: fields.split(',').map((f) => f.trim()).filter(Boolean) })}>Save</Button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
