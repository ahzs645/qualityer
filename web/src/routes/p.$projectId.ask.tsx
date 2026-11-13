import { Link, createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Download, FileUp, GitBranch, MessagesSquare, Play, Plus, Square, ThumbsDown, ThumbsUp, Trash2, Minus } from 'lucide-react'
import type { AskAnswer, AskPrompt, Project, Source } from '../lib/types'
import { useProject } from '../lib/store'
import { download, slug, toCSV } from '../lib/model'
import { ASK_TEMPLATES, askPack, lineage, newPrompt, readAskResponses, refineAdvice, type AskResponses } from '../lib/ai/ask'
import { turnsOf } from '../lib/ai/pipeline'
import { askWithModel, getAiSettings, saveAiSettings, type AiSettings, type Provider } from '../lib/ai/run'
import { rateAnswer, removeAsk, saveAsk, saveAskAnswers } from '../lib/actions'
import { forExport } from '../lib/names'
import { Badge, Button, Empty, IconButton, Input, PageHeader, Panel, Select, Textarea, cx } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/ask')({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({ q: typeof s.q === 'string' ? s.q : undefined }),
  component: Ask,
})

const short = (s: Source) => s.attributes['Respondent ID']?.trim() || s.name.split(' — ')[0]

function Ask() {
  const project = useProject()
  const { q } = Route.useSearch()
  const navigate = Route.useNavigate()
  const latest = [...project.asks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const current = project.asks.find((a) => a.id === q) ?? latest
  const select = (id: string) => navigate({ search: { q: id } })
  const roots = project.asks.filter((a) => !a.parentId || !project.asks.some((x) => x.id === a.parentId))

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6">
      <PageHeader title="Ask across interviews" />
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <NewQuestion project={project} onCreated={select} />
          {roots.length > 0 && (
            <Panel title="Questions" bodyClass="p-0">
              <ul className="divide-y divide-line">
                {roots.map((r) => {
                  const versions = lineage(project.asks, r.id)
                  const on = versions.some((v) => v.id === current?.id)
                  return (
                    <li key={r.id} className={cx('px-3 py-2', on && 'bg-accent-soft/50')}>
                      <button type="button" className="block w-full text-left text-sm font-medium hover:text-accent" onClick={() => select(versions[versions.length - 1].id)}>{versions[versions.length - 1].title}</button>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {versions.map((v) => (
                          <button key={v.id} type="button" onClick={() => select(v.id)} className={cx('rounded px-1.5 py-0.5 text-[11px] font-medium', v.id === current?.id ? 'bg-accent text-accent-ink' : 'bg-sunken text-muted hover:text-ink')}>
                            v{v.version} · {project.askAnswers.filter((a) => a.promptId === v.id).length}
                          </button>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}
        </aside>
        <div className="min-w-0 space-y-5">
          {current ? <Question key={current.id} project={project} prompt={current} onSelect={select} /> : (
            <Panel><Empty icon={<MessagesSquare size={28} />} title="Ask every interview the same question">
              Write a question, or start from a template on the left. Each interview is read on its own, the answers come back side by side with verbatim evidence checked against the transcript, and you can refine the question and compare versions.
            </Empty></Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function NewQuestion({ project, onCreated }: { project: Project; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(project.asks.length === 0)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  if (!open) return <Button className="w-full" icon={<Plus size={15} />} onClick={() => setOpen(true)}>New question</Button>
  return (
    <Panel title="New question" bodyClass="space-y-2 p-3">
      <Select value="" onChange={(e) => { const t = ASK_TEMPLATES[Number(e.target.value)]; if (t) { setTitle(t.title); setText(t.text) } }} aria-label="Start from a template" className="h-8 w-full text-xs">
        <option value="">Start from a template…</option>
        {ASK_TEMPLATES.map((t, i) => <option key={t.title} value={i}>{t.title}</option>)}
      </Select>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" aria-label="Question title" className="h-8" />
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="What do you want to know from each interview?" aria-label="Question" className="text-[13px]" />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={!text.trim()} onClick={() => {
          const p = newPrompt({ title: title.trim() || text.trim().slice(0, 60), text: text.trim(), maskNames: project.names.some((n) => n.mask) })
          saveAsk(p); setTitle(''); setText(''); setOpen(false); onCreated(p.id)
        }}>Create</Button>
        {project.asks.length > 0 && <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>}
      </div>
    </Panel>
  )
}

function Question({ project, prompt, onSelect }: { project: Project; prompt: AskPrompt; onSelect: (id: string) => void }) {
  const answers = project.askAnswers.filter((a) => a.promptId === prompt.id)
  const locked = answers.length > 0
  const versions = lineage(project.asks, prompt.id)
  const previous = versions.filter((v) => v.version < prompt.version).pop()
  const [compare, setCompare] = useState(!!previous)
  const [sourceIds, setSourceIds] = useState<string[]>(() => project.sources.map((s) => s.id))
  const advice = useMemo(() => refineAdvice(prompt, project.askAnswers), [prompt, project.askAnswers])
  const [draft, setDraft] = useState<string | null>(null)

  const refine = () => {
    const next = newPrompt({ title: prompt.title, text: prompt.text, version: Math.max(...versions.map((v) => v.version)) + 1, parentId: prompt.id, scope: prompt.scope, maskNames: prompt.maskNames })
    saveAsk(next); onSelect(next.id)
  }
  const exportCSV = () => {
    const rows: string[][] = [['Version', 'Question', 'Interview', 'Not addressed', 'Answer', 'Evidence', 'Rating', 'Reviewer note', 'Model']]
    for (const v of versions) for (const a of project.askAnswers.filter((x) => x.promptId === v.id)) {
      const s = project.sources.find((x) => x.id === a.sourceId)
      rows.push([`v${v.version}`, v.text, s ? s.name : '', a.notAddressed ? 'yes' : '', a.text, a.evidence.map((e) => `${e.turnId}: “${e.quote}”${e.match === 'not-found' ? ' (not found)' : ''}`).join('\n'), a.rating ?? '', a.reviewNote, a.model])
    }
    download(`${slug(project.name)}-ask-${slug(prompt.title)}.csv`, '﻿' + forExport(project, toCSV(rows)), 'text/csv')
  }

  return (
    <>
      <Panel title={<span className="flex items-center gap-2">{prompt.title} <Badge>v{prompt.version}</Badge></span>} actions={
        <div className="flex gap-1.5">
          {answers.length > 0 && <Button size="sm" variant="ghost" icon={<Download size={13} />} onClick={exportCSV}>CSV</Button>}
          <Button size="sm" icon={<GitBranch size={13} />} onClick={refine}>Refine into v{Math.max(...versions.map((v) => v.version)) + 1}</Button>
          <IconButton label="Delete this version and its answers" onClick={() => confirm(`Delete v${prompt.version} of “${prompt.title}” and its ${answers.length} answers?`) && (removeAsk(prompt.id), previous && onSelect(previous.id))}><Trash2 size={14} /></IconButton>
        </div>
      } bodyClass="space-y-3 p-4">
        {locked ? (
          <p className="rounded-md bg-sunken px-3 py-2 text-sm whitespace-pre-wrap">{prompt.text}</p>
        ) : (
          <>
            <Input defaultValue={prompt.title} aria-label="Question title" className="h-8" onBlur={(e) => e.target.value.trim() && e.target.value !== prompt.title && saveAsk({ ...prompt, title: e.target.value.trim() })} />
            <Textarea key={prompt.text} defaultValue={draft ?? prompt.text} rows={5} aria-label="Question" className="text-[13px]" onChange={(e) => setDraft(e.target.value)} onBlur={(e) => e.target.value !== prompt.text && saveAsk({ ...prompt, text: e.target.value })} />
          </>
        )}
        {previous && (
          <Input defaultValue={prompt.note} placeholder={`What changed from v${previous.version}, and why`} aria-label="What changed" className="h-8 text-xs" onBlur={(e) => e.target.value !== prompt.note && saveAsk({ ...prompt, note: e.target.value })} />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" disabled={locked} checked={prompt.maskNames} onChange={(e) => saveAsk({ ...prompt, maskNames: e.target.checked })} /> Mask names before sending</label>
          <label className="flex items-center gap-1.5">Send
            <Select value={prompt.scope} disabled={locked} onChange={(e) => saveAsk({ ...prompt, scope: e.target.value as AskPrompt['scope'] })} className="h-7 text-xs" aria-label="What to send">
              <option value="all">the whole transcript</option>
              <option value="respondent">respondent turns in full, questions shortened</option>
            </Select>
          </label>
          {locked && <span className="text-xs text-muted">This version has answers, so it is fixed. Refine it to change the wording.</span>}
        </div>
        {advice.length > 0 && (
          <div className="rounded-md border border-line p-3">
            <div className="mb-1.5 text-xs font-semibold text-muted uppercase">Prompt check{locked ? ' — for the next version' : ''}</div>
            <ul className="space-y-1.5 text-sm">
              {advice.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
                  <span className="flex-1">{a.text}{a.addition && <span className="text-muted"> Try: “{a.addition}”</span>}</span>
                  {a.addition && !locked && <Button size="sm" variant="ghost" onClick={() => saveAsk({ ...prompt, text: `${prompt.text.trim()} ${a.addition}` })}>Add</Button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <RunPanel project={project} prompt={prompt} sourceIds={sourceIds} setSourceIds={setSourceIds} />

      {(answers.length > 0 || (previous && project.askAnswers.some((a) => a.promptId === previous.id))) && (
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold">Answers · {answers.length} of {project.sources.length} interviews</h2>
            <Ratings answers={answers} />
            {previous && <label className="ml-auto flex items-center gap-1.5 text-sm"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Show v{previous.version} under each answer</label>}
          </div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {project.sources.filter((s) => sourceIds.includes(s.id)).map((s) => (
              <AnswerCard key={s.id} project={project} source={s} answer={answers.find((a) => a.sourceId === s.id)}
                previous={compare && previous ? { version: previous.version, answer: project.askAnswers.find((a) => a.promptId === previous.id && a.sourceId === s.id) } : null} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function Ratings({ answers }: { answers: AskAnswer[] }) {
  const n = (r: AskAnswer['rating']) => answers.filter((a) => a.rating === r).length
  const ev = answers.reduce((k, a) => k + a.evidence.length, 0)
  const found = answers.reduce((k, a) => k + a.evidence.filter((e) => e.match !== 'not-found').length, 0)
  return (
    <span className="flex flex-wrap gap-x-3 text-xs text-muted">
      <span>{found} of {ev} quotes found in the transcript</span>
      <span>rated: {n('good')} good · {n('partly')} partly · {n('off')} off</span>
    </span>
  )
}

function RunPanel({ project, prompt, sourceIds, setSourceIds }: { project: Project; prompt: AskPrompt; sourceIds: string[]; setSourceIds: (ids: string[]) => void }) {
  const [settings, setSettings] = useState<AiSettings>(getAiSettings)
  const set = (c: Partial<AiSettings>) => setSettings((s) => { const n = { ...s, ...c }; saveAiSettings(n); return n })
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const answered = new Set(project.askAnswers.filter((a) => a.promptId === prompt.id).map((a) => a.sourceId))

  async function run(ids: string[]) {
    setMsg(null)
    abort.current = new AbortController()
    try {
      const { answers, failed } = await askWithModel(project, prompt, ids, settings, (d, t) => setProgress(`${d} of ${t} interviews`), abort.current.signal)
      saveAskAnswers(answers)
      setMsg({ tone: failed.length ? 'bad' : 'good', text: `${answers.length} answers stored.${failed.length ? ` Failed: ${failed.join('; ')}` : ''}` })
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : String(e) }) }
    finally { abort.current = null; setProgress(null) }
  }

  return (
    <Panel title="Run" bodyClass="space-y-3 p-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {project.sources.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 text-sm" title={s.name}>
            <input type="checkbox" checked={sourceIds.includes(s.id)} onChange={(e) => setSourceIds(e.target.checked ? [...sourceIds, s.id] : sourceIds.filter((x) => x !== s.id))} />
            {short(s)} {answered.has(s.id) && <Check size={12} className="text-good" aria-label="answered" />}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={settings.provider} onChange={(e) => set({ provider: e.target.value as Provider })} aria-label="How to run" className="h-8 text-sm">
          <option value="agent">Agent hand-off (download, answer elsewhere, import)</option>
          <option value="anthropic">Claude API{settings.apiKey ? '' : ' (add a key under AI assist)'}</option>
          <option value="openai">Local model ({settings.baseUrl})</option>
        </Select>
        {settings.provider === 'agent' ? (
          <>
            <Button variant="primary" icon={<Download size={14} />} disabled={!sourceIds.length} onClick={() => {
              const pack = askPack(project, prompt, sourceIds)
              download(`${slug(project.name)}-ask-${slug(prompt.title)}-v${prompt.version}.json`, JSON.stringify(pack, null, 1), 'application/json')
              setMsg({ tone: 'good', text: `Question pack for ${pack.requests.length} interviews downloaded${prompt.maskNames ? ', with names masked' : ''}. Import the answers when they are ready.` })
            }}>Download question pack</Button>
            <Button icon={<FileUp size={14} />} onClick={() => fileRef.current?.click()}>Import answers</Button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const { answers, failed } = readAskResponses(project, JSON.parse(await f.text()) as AskResponses)
                saveAskAnswers(answers)
                setMsg({ tone: failed.length ? 'bad' : 'good', text: `${answers.length} answers imported.${failed.length ? ` ${failed.length} could not be read.` : ''}` })
              } catch (err) { setMsg({ tone: 'bad', text: err instanceof Error ? err.message : String(err) }) }
            }} />
          </>
        ) : progress ? (
          <Button icon={<Square size={14} />} onClick={() => abort.current?.abort()}>Stop · {progress}</Button>
        ) : (
          <>
            <Button variant="primary" icon={<Play size={14} />} disabled={!sourceIds.length || (settings.provider === 'anthropic' && !settings.apiKey)} onClick={() => run(sourceIds)}>Ask {sourceIds.length} interviews</Button>
            {sourceIds.length > 1 && <Button disabled={settings.provider === 'anthropic' && !settings.apiKey} onClick={() => run(sourceIds.slice(0, 1))}>Try on {short(project.sources.find((s) => s.id === sourceIds[0])!)} first</Button>}
          </>
        )}
      </div>
      {msg && <p className={cx('rounded-md px-3 py-2 text-sm', msg.tone === 'good' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>{msg.text}</p>}
    </Panel>
  )
}

function AnswerCard({ project, source, answer, previous }: { project: Project; source: Source; answer: AskAnswer | undefined; previous: { version: number; answer: AskAnswer | undefined } | null }) {
  const turnAt = useMemo(() => new Map(turnsOf(source).map((t) => [t.id, t])), [source])
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="font-semibold">{short(source)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted" title={source.name}>{source.name.split(' — ').slice(1).join(' — ')}</span>
        {answer?.notAddressed && <Badge tone="warn">not addressed</Badge>}
      </header>
      {!answer ? <p className="p-4 text-sm text-faint italic">No answer yet.</p> : (
        <div className="flex-1 space-y-3 p-4">
          <Prose text={answer.text} source={source} turnAt={turnAt} projectId={project.id} />
          {answer.evidence.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer text-xs font-medium text-muted">Evidence · {answer.evidence.length} {answer.evidence.some((e) => e.match === 'not-found') && <span className="text-bad">({answer.evidence.filter((e) => e.match === 'not-found').length} not found)</span>}</summary>
              <ul className="mt-1.5 space-y-1.5">
                {answer.evidence.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    {e.start != null ? (
                      <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: source.id, at: e.start, end: e.end }} className="w-12 shrink-0 font-mono text-[11px] text-accent hover:underline">{e.turnId}</Link>
                    ) : <span className="w-12 shrink-0 font-mono text-[11px] text-bad" title="Not found in the transcript">{e.turnId}</span>}
                    <span className={cx('font-serif', e.match === 'not-found' && 'text-bad line-through decoration-1')}>“{e.quote}”</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <footer className="flex flex-wrap items-center gap-1 border-t border-line pt-2">
            {([['good', <ThumbsUp key="g" size={13} />, 'Good'], ['partly', <Minus key="p" size={13} />, 'Partly'], ['off', <ThumbsDown key="o" size={13} />, 'Off']] as const).map(([r, icon, label]) => (
              <button key={r} type="button" aria-pressed={answer.rating === r} onClick={() => rateAnswer(answer.id, { rating: answer.rating === r ? null : r })}
                className={cx('inline-flex items-center gap-1 rounded px-2 py-1 text-xs', answer.rating === r ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-sunken')}>{icon}{label}</button>
            ))}
            <span className="ml-auto text-[11px] text-faint">{answer.model}</span>
            <Input key={answer.reviewNote} defaultValue={answer.reviewNote} placeholder="Why? (used when refining)" aria-label={`Note on the ${short(source)} answer`} className="mt-1 h-7 basis-full text-xs" onBlur={(e) => e.target.value !== answer.reviewNote && rateAnswer(answer.id, { reviewNote: e.target.value })} />
          </footer>
        </div>
      )}
      {previous && (
        <div className="border-t border-dashed border-line-strong bg-sunken/50 px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold text-muted uppercase">v{previous.version}</div>
          {previous.answer ? <div className="text-[13px] text-muted"><Prose text={previous.answer.text} source={source} turnAt={turnAt} projectId={project.id} /></div> : <p className="text-xs text-faint italic">No answer.</p>}
        </div>
      )}
    </article>
  )
}

/** Minimal rendering of an answer: paragraphs, bullet lists, **bold**, and [T0042] turn links. */
function Prose({ text, source, turnAt, projectId }: { text: string; source: Source; turnAt: Map<string, { start: number; end: number }>; projectId: string }) {
  const inline = (s: string, key: number): ReactNode[] => s.split(/(\*\*[^*]+\*\*|\[T\d{4}(?:[,–-]\s*T?\d{4})*\])/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
    const m = /^\[(T\d{4})/.exec(part)
    if (m && turnAt.get(m[1])) {
      const t = turnAt.get(m[1])!
      return <Link key={`${key}-${i}`} to="/p/$projectId/code" params={{ projectId }} search={{ source: source.id, at: t.start, end: t.end }} className="font-mono text-[11px] text-accent hover:underline">{part}</Link>
    }
    return <Fragment key={`${key}-${i}`}>{part}</Fragment>
  })
  // Group lines: runs of bullet lines become lists, other lines paragraphs.
  const isBullet = (l: string) => /^\s*([-*•]|\d+[.)])\s+/.test(l)
  const groups: { list: boolean; lines: string[] }[] = []
  for (const l of text.split('\n')) {
    if (!l.trim()) { groups.push({ list: false, lines: [] }); continue }
    const last = groups[groups.length - 1]
    if (last && last.list === isBullet(l) && last.lines.length && (last.list || false)) last.lines.push(l)
    else groups.push({ list: isBullet(l), lines: [l] })
  }
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      {groups.filter((g) => g.lines.length).map((g, i) => g.list
        ? <ul key={i} className="list-disc space-y-1 pl-5">{g.lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), j)}</li>)}</ul>
        : <p key={i}>{inline(g.lines.join(' '), i)}</p>)}
    </div>
  )
}
