import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ChevronDown, EyeOff, Plus, Trash2 } from 'lucide-react'
import type { NameEntry, NameKind, Project, Source } from '../../lib/types'
import { useProject } from '../../lib/store'
import { excerpt, indexBy } from '../../lib/model'
import { MASK_BY_DEFAULT, findNames, maskNames, nameCandidates, nameCounts, nextReplacement, type NameCandidate } from '../../lib/names'
import { addName, addNameVariant, dismissName, removeName, setAnonymise, updateName } from '../../lib/actions'
import { Badge, Button, Empty, IconButton, Input, Panel, Select, cx } from '../../components/ui'

const KINDS: { value: NameKind; label: string }[] = [
  { value: 'person', label: 'Person' },
  { value: 'organisation', label: 'Organisation' },
  { value: 'place', label: 'Place' },
  { value: 'other', label: 'Other' },
]

const short = (s: Source) => s.attributes['Respondent ID']?.trim() || s.name.split(' — ')[0]

/** Review → Names: who and what the interviews name, across the study, and how each is masked in exports. */
export function Names() {
  const project = useProject()
  const counts = useMemo(() => nameCounts(project), [project.names, project.sources])
  const masked = project.names.filter((e) => e.mask)

  return (
    <div className="space-y-5">
      <AnonymisePanel project={project} masked={masked.length} />
      <Register project={project} counts={counts} />
      <Candidates project={project} />
    </div>
  )
}

function AnonymisePanel({ project, masked }: { project: Project; masked: number }) {
  // A before/after line from the first coded passage that mentions a masked name.
  const sample = useMemo(() => {
    const entries = project.names.filter((e) => e.mask)
    if (!entries.length) return null
    const sources = indexBy(project.sources)
    for (const c of project.codings) {
      const s = sources.get(c.sourceId)
      if (!s || c.status !== 'accepted') continue
      const text = excerpt(s.text, c.start, c.end)
      if (findNames(text, entries).length) return { before: text, after: maskNames(text, entries) }
    }
    return null
  }, [project.names, project.codings, project.sources])

  return (
    <Panel title="Anonymise" bodyClass="p-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={project.anonymise} onChange={(e) => setAnonymise(e.target.checked)} />
        <span>
          <span className="font-medium">Replace masked names in reports and exports</span>
          <span className="mt-0.5 block text-sm text-muted">
            {masked} {masked === 1 ? 'name is' : 'names are'} masked. Applies to the report (HTML and Markdown), the claims table, the decision log, and the Retrieve and Framework CSV files: quotes, source and case names, summaries and memos. The app and the whole-study file keep the real names.
          </span>
        </span>
        {project.anonymise && <Badge tone="good">On</Badge>}
      </label>
      {sample && (
        <div className="mt-3 grid gap-2 rounded-md bg-sunken p-3 text-sm sm:grid-cols-2">
          <div><div className="mb-1 text-xs font-medium text-muted">In the app</div><p className="line-clamp-4 font-serif">{sample.before}</p></div>
          <div><div className="mb-1 text-xs font-medium text-muted">In exports</div><p className="line-clamp-4 font-serif">{sample.after}</p></div>
        </div>
      )}
    </Panel>
  )
}

function Register({ project, counts }: { project: Project; counts: Map<string, Map<string, number>> }) {
  const [open, setOpen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<NameKind>('person')
  const [filter, setFilter] = useState('')
  const rows = project.names.filter((e) => !filter || [e.name, ...e.variants, e.replacement].some((v) => v.toLowerCase().includes(filter.toLowerCase())))

  return (
    <Panel title={`Names in this study · ${project.names.length}`} bodyClass="p-0" actions={
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" aria-label="Filter names" className="h-7 w-40 text-xs" />
    }>
      <p className="border-b border-line px-4 py-2 text-xs text-muted">
        Each name with every spelling the transcripts use (short forms, misheard forms), its stand-in, and how often each interview mentions it. A count across several interviews shows who and what the study keeps coming back to.
      </p>
      {project.names.length === 0 ? (
        <Empty title="No names yet">Add suggestions below, or type a name.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Other spellings</th>
                <th className="px-2 py-2 font-medium">Kind</th>
                <th className="px-2 py-2 font-medium">Stand-in</th>
                <th className="px-2 py-2 font-medium" title="Replace in exports">Mask</th>
                {project.sources.map((s) => <th key={s.id} className="px-1.5 py-2 text-right font-medium" title={s.name}>{short(s)}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const per = counts.get(e.id) ?? new Map()
                const total = [...per.values()].reduce((a, b) => a + b, 0)
                return (
                  <NameRow key={e.id} project={project} entry={e} per={per} total={total} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <form className="flex flex-wrap gap-2 border-t border-line p-3" onSubmit={(e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n) return
        addName({ name: n, variants: [], kind, replacement: nextReplacement(project, kind), mask: MASK_BY_DEFAULT[kind], caseSensitive: true, note: '' })
        setName('')
      }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a name, e.g. Jane Doe" aria-label="New name" className="h-8 w-56" />
        <Select value={kind} onChange={(e) => setKind(e.target.value as NameKind)} aria-label="Kind of the new name" className="h-8">
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
        <Button size="sm" type="submit" icon={<Plus size={13} />}>Add</Button>
      </form>
    </Panel>
  )
}

function NameRow({ project, entry: e, per, total, open, onToggle }: { project: Project; entry: NameEntry; per: Map<string, number>; total: number; open: boolean; onToggle: () => void }) {
  const hits = useMemo(() => (open ? project.sources.flatMap((s) => findNames(s.text, [e]).map((h) => ({ s, h }))) : []), [open, project.sources, e])
  return (
    <>
      <tr className="border-b border-line align-top">
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1">
            <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`Mentions of ${e.name}`} className="rounded p-0.5 text-faint hover:bg-sunken hover:text-ink">
              <ChevronDown size={14} className={cx('transition-transform', !open && '-rotate-90')} />
            </button>
            <Input key={e.name} className="h-7 min-w-36" defaultValue={e.name} aria-label={`Name: ${e.name}`} onBlur={(ev) => ev.target.value.trim() && ev.target.value.trim() !== e.name && updateName(e.id, { name: ev.target.value.trim() })} />
          </div>
        </td>
        <td className="px-2 py-1.5">
          <Input key={e.variants.join('|')} className="h-7 min-w-44" defaultValue={e.variants.join(', ')} placeholder="e.g. Jo, Dr. Ames" aria-label={`Other spellings of ${e.name}`}
            onBlur={(ev) => { const v = ev.target.value.split(',').map((x) => x.trim()).filter(Boolean); if (v.join('|') !== e.variants.join('|')) updateName(e.id, { variants: v }) }} />
        </td>
        <td className="px-2 py-1.5">
          <Select value={e.kind} onChange={(ev) => updateName(e.id, { kind: ev.target.value as NameKind })} className="h-7 text-xs" aria-label={`Kind of ${e.name}`}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </td>
        <td className="px-2 py-1.5">
          <Input key={e.replacement} className="h-7 w-36" defaultValue={e.replacement} aria-label={`Stand-in for ${e.name}`} onBlur={(ev) => ev.target.value !== e.replacement && updateName(e.id, { replacement: ev.target.value })} />
        </td>
        <td className="px-2 py-1.5 text-center">
          <input type="checkbox" className="mt-1.5" checked={e.mask} onChange={(ev) => updateName(e.id, { mask: ev.target.checked })} aria-label={`Mask ${e.name} in exports`} />
        </td>
        {project.sources.map((s) => {
          const n = per.get(s.id) ?? 0
          return <td key={s.id} className={cx('px-1.5 py-1.5 pt-2.5 text-right tabular-nums', n ? 'text-ink' : 'text-faint')}>{n || '·'}</td>
        })}
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <span className="w-8 text-right text-xs tabular-nums text-muted">{total}</span>
            <IconButton label={`Remove ${e.name}`} onClick={() => removeName(e.id)}><Trash2 size={14} /></IconButton>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-sunken/40">
          <td colSpan={6 + project.sources.length} className="px-4 py-2">
            <label className="mb-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={e.caseSensitive} onChange={(ev) => updateName(e.id, { caseSensitive: ev.target.checked })} />
              Match capitals exactly (so a surname that is also a word, like Moss, is found only when capitalised)
            </label>
            {hits.length === 0 ? <p className="text-sm text-muted">No mentions in the transcripts.</p> : (
              <ul className="max-h-72 space-y-1 overflow-y-auto scroll-thin text-[13px]">
                {hits.slice(0, 100).map(({ s, h }) => (
                  <li key={`${s.id}:${h.start}`} className="flex gap-2">
                    <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: s.id, at: h.start, end: h.end }} className="w-10 shrink-0 text-xs text-accent hover:underline">{short(s)}</Link>
                    <span className="min-w-0 font-serif text-muted">…{s.text.slice(Math.max(0, h.start - 70), h.start)}<mark className="rounded bg-accent-soft px-0.5 text-ink">{h.text}</mark>{s.text.slice(h.end, h.end + 70)}…</span>
                  </li>
                ))}
              </ul>
            )}
            {hits.length > 100 && <p className="mt-1 text-xs text-muted">Showing 100 of {hits.length}.</p>}
          </td>
        </tr>
      )}
    </>
  )
}

function Candidates({ project }: { project: Project }) {
  const [kind, setKind] = useState<NameKind | ''>('')
  const [shown, setShown] = useState(40)
  const all = useMemo(() => nameCandidates(project), [project.sources, project.names, project.notNames])
  const list = all.filter((c) => !kind || c.kind === kind)
  const sources = indexBy(project.sources)

  return (
    <Panel title={`Suggested names · ${all.length}`} bodyClass="p-0" actions={
      <Select value={kind} onChange={(e) => setKind(e.target.value as NameKind | '')} aria-label="Kind of suggestion" className="h-7 text-xs">
        <option value="">All kinds</option>
        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </Select>
    }>
      <p className="border-b border-line px-4 py-2 text-xs text-muted">
        Speakers, names in source titles, and capitalised words that are not just starting a sentence. Machine transcripts misspell names: add a misheard form as another spelling of the right name, so it is found and masked too.
      </p>
      {list.length === 0 ? <Empty icon={<EyeOff size={26} />} title="Nothing more to suggest">Type a name above to add one the scan missed.</Empty> : (
        <ul className="divide-y divide-line">
          {list.slice(0, shown).map((c) => <CandidateRow key={c.text} project={project} c={c} source={c.sample ? sources.get(c.sample.sourceId) : undefined} />)}
        </ul>
      )}
      {list.length > shown && <div className="border-t border-line p-2 text-center"><Button size="sm" variant="ghost" onClick={() => setShown((n) => n + 40)}>Show more ({list.length - shown})</Button></div>}
    </Panel>
  )
}

function CandidateRow({ project, c, source }: { project: Project; c: NameCandidate; source: Source | undefined }) {
  const [k, setK] = useState<NameKind>(c.kind)
  const add = () => addName({ name: c.text, variants: [], kind: k, replacement: c.replacement || nextReplacement(project, k), mask: MASK_BY_DEFAULT[k], caseSensitive: true, note: c.reason })
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium">{c.text}</span>
          <span className="text-xs text-muted">{c.reason}</span>
          <span className="text-xs tabular-nums text-muted">
            {project.sources.filter((s) => c.counts.get(s.id)).map((s) => `${short(s)} ${c.counts.get(s.id)}`).join(' · ')}
          </span>
        </div>
        {source && c.sample && (
          <p className="mt-0.5 line-clamp-1 font-serif text-[12px] text-muted">
            …{source.text.slice(Math.max(0, c.sample.start - 60), c.sample.start)}<mark className="rounded bg-accent-soft px-0.5 text-ink">{source.text.slice(c.sample.start, c.sample.end)}</mark>{source.text.slice(c.sample.end, c.sample.end + 60)}…
          </p>
        )}
      </div>
      <Select value={k} onChange={(e) => setK(e.target.value as NameKind)} aria-label={`Kind of ${c.text}`} className="h-7 text-xs">
        {KINDS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
      </Select>
      <Button size="sm" onClick={add} aria-label={`Add ${c.text}`}>Add{c.replacement ? ` as ${c.replacement}` : ''}</Button>
      {project.names.length > 0 && (
        <Select value="" onChange={(e) => e.target.value && addNameVariant(e.target.value, c.text)} aria-label={`Add ${c.text} as a spelling of`} className="h-7 max-w-44 text-xs">
          <option value="">{c.partOf ? `Spelling of ${project.names.find((e) => e.id === c.partOf)?.name}?` : 'Spelling of…'}</option>
          {project.names.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      )}
      <Button size="sm" variant="ghost" onClick={() => dismissName(c.text)} aria-label={`${c.text} is not a name`}>Not a name</Button>
    </li>
  )
}
