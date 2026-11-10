import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { NotebookPen, Plus, Trash2 } from 'lucide-react'
import type { Memo } from '../lib/types'
import { useProject } from '../lib/store'
import { excerpt, indexBy } from '../lib/model'
import { addMemo, removeMemo, updateMemo } from '../lib/actions'
import { Badge, Button, Empty, IconButton, Input, PageHeader, Select, Swatch, Textarea, cx } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/memos')({ component: Memos })

function Memos() {
  const project = useProject()
  const [kind, setKind] = useState<'all' | Memo['kind']>('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(project.memos[0]?.id ?? null)
  const codes = indexBy(project.codes)
  const sources = indexBy(project.sources)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return project.memos
      .filter((m) => kind === 'all' || m.kind === kind)
      .filter((m) => !needle || (m.title + ' ' + m.body).toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [project.memos, kind, q])
  const memo = project.memos.find((m) => m.id === openId)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Memos & journal"
        actions={
          <>
            <Button icon={<Plus size={15} />} onClick={() => setOpenId(addMemo({ kind: 'journal', title: 'Journal entry' }))}>Journal entry</Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpenId(addMemo({ title: 'New memo' }))}>Memo</Button>
          </>
        }
      />
      {project.memos.length === 0 ? (
        <Empty icon={<NotebookPen size={28} />} title="No memos yet">Write a memo here, or attach one to a passage from the Code view.</Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-[20rem_1fr]">
          <aside className="space-y-2">
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memos" aria-label="Search memos" />
              <Select value={kind} onChange={(e) => setKind(e.target.value as 'all')} aria-label="Kind">
                <option value="all">All</option>
                <option value="memo">Memos</option>
                <option value="journal">Journal</option>
              </Select>
            </div>
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto scroll-thin">
              {list.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setOpenId(m.id)} className={cx('w-full rounded-md px-3 py-2 text-left hover:bg-sunken', openId === m.id && 'bg-accent-soft')}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title || 'Untitled'}</span>
                      {m.kind === 'journal' && <Badge>journal</Badge>}
                    </div>
                    <div className="line-clamp-2 text-xs text-muted">{m.body || 'Empty'}</div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          {memo ? (
            <article className="rounded-lg border border-line bg-surface p-5">
              <div className="flex items-center gap-2">
                <Input key={memo.id + 't'} defaultValue={memo.title} onBlur={(e) => e.target.value !== memo.title && updateMemo(memo.id, { title: e.target.value })} className="border-transparent px-0 text-lg font-semibold hover:border-line-strong focus:px-2.5" aria-label="Title" />
                <Select value={memo.kind} onChange={(e) => updateMemo(memo.id, { kind: e.target.value as Memo['kind'] })} className="h-8" aria-label="Kind">
                  <option value="memo">Memo</option>
                  <option value="journal">Journal</option>
                </Select>
                <IconButton label="Delete memo" onClick={() => { if (confirm('Delete this memo? You can undo this.')) { removeMemo(memo.id); setOpenId(null) } }}><Trash2 size={15} /></IconButton>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{memo.author || 'Unknown'} · {new Date(memo.updatedAt).toLocaleString()}</span>
                <Select value={memo.codeId ?? ''} onChange={(e) => updateMemo(memo.id, { codeId: e.target.value || null })} className="h-7 text-xs" aria-label="About code">
                  <option value="">Not about a code</option>
                  {project.codes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                {memo.codeId && <Swatch color={codes.get(memo.codeId)?.color ?? '#888'} />}
              </div>
              {memo.sourceId && sources.get(memo.sourceId) && (
                <Link
                  to="/p/$projectId/code"
                  params={{ projectId: project.id }}
                  search={{ source: memo.sourceId, at: memo.start ?? undefined, end: memo.end ?? undefined }}
                  className="mt-3 block rounded-md border-l-2 border-accent bg-sunken px-3 py-2 font-serif text-sm hover:bg-accent-soft"
                >
                  {memo.start != null ? excerpt(sources.get(memo.sourceId)!.text, memo.start, memo.end ?? memo.start).slice(0, 400) : sources.get(memo.sourceId)!.name}
                  <span className="mt-0.5 block font-sans text-xs text-muted">{sources.get(memo.sourceId)!.name}</span>
                </Link>
              )}
              <Textarea
                key={memo.id}
                className="mt-4 min-h-[50vh] border-transparent px-0 font-serif text-[15.5px] leading-relaxed hover:border-line focus:px-2.5"
                defaultValue={memo.body}
                onBlur={(e) => e.target.value !== memo.body && updateMemo(memo.id, { body: e.target.value })}
                placeholder="Write…"
                aria-label="Memo text"
              />
            </article>
          ) : <Empty title="Choose a memo" />}
        </div>
      )}
    </div>
  )
}
