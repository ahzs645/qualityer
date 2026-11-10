import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { Bot, Download, FileUp, Play, ShieldAlert, Square } from 'lucide-react'
import type { AiRun } from '../lib/types'
import { useProject } from '../lib/store'
import { agreement, download, slug } from '../lib/model'
import { DEFAULT_OPTIONS, selectCodes, windowsFor, type PipelineOptions } from '../lib/ai/pipeline'
import {
  exportAgentPack, exportGradePack, getAiSettings, importAgentResponses, importGradeResponses, runPass, saveAiSettings,
  type AiSettings, type Progress, type Provider,
} from '../lib/ai/run'
import { discardRun } from '../lib/review'
import { DEFAULT_GRADE, gradeExamples, gradeTargets, type GradeOptions } from '../lib/ai/grade'
import { Badge, Button, Field, Input, PageHeader, Panel, Progress as Bar, Select, cx } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/assist')({ component: Assist })

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
  { value: 'agent', label: 'Agent hand-off', hint: 'Download the exact prompts, have an agent or another tool answer them, then import the answers. No key needed in this browser.' },
  { value: 'anthropic', label: 'Claude API', hint: 'Calls the Claude API from this browser with your key. The key is kept in this browser only.' },
  { value: 'openai', label: 'Local model', hint: 'Any OpenAI-compatible endpoint, such as Ollama or LM Studio on this computer, so transcripts never leave it.' },
]

function Assist() {
  const project = useProject()
  const [settings, setSettings] = useState<AiSettings>(getAiSettings)
  const set = (change: Partial<AiSettings>) => setSettings((s) => { const n = { ...s, ...change }; saveAiSettings(n); return n })
  const [sourceIds, setSourceIds] = useState<string[]>(() => project.sources.filter((s) => s.status !== 'done').map((s) => s.id))
  const [groupIds, setGroupIds] = useState<string[]>(() => project.groups.filter((g) => g.kind !== 'process' && g.kind !== 'other').map((g) => g.id))
  const [opts, setOpts] = useState<PipelineOptions>(DEFAULT_OPTIONS)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scope = { sourceIds, groupIds, options: opts }
  const windows = useMemo(() => project.sources.filter((s) => sourceIds.includes(s.id)).reduce((n, s) => n + windowsFor(s, opts).length, 0), [project.sources, sourceIds, opts])
  const codes = useMemo(() => selectCodes(project, groupIds).length, [project, groupIds])
  const running = !!abort.current && !!progress && progress.done < progress.total

  async function start() {
    setMsg(null)
    abort.current = new AbortController()
    try {
      const run = await runPass(scope, settings, setProgress, abort.current.signal)
      setMsg({ tone: 'good', text: `Finished: ${run.suggestions} suggestions from ${run.completed} windows${run.failed.length ? `, ${run.failed.length} failed` : ''}. ${run.rejected.length} quotes were rejected because they didn't match the transcript.` })
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : String(e) })
    } finally {
      abort.current = null
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        title="AI assist"
        actions={<Link to="/p/$projectId/review" params={{ projectId: project.id }} search={{ tab: 'suggestions' }}><Button>Review suggestions</Button></Link>}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-5">
          <Panel title="1 · What to code">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[13px] font-medium">Sources</div>
                <div className="max-h-48 space-y-1 overflow-y-auto scroll-thin">
                  {project.sources.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={sourceIds.includes(s.id)} onChange={(e) => setSourceIds((x) => (e.target.checked ? [...x, s.id] : x.filter((i) => i !== s.id)))} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-faint">{s.status}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[13px] font-medium">Code groups</div>
                <div className="max-h-48 space-y-1 overflow-y-auto scroll-thin">
                  {project.groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={groupIds.includes(g.id)} onChange={(e) => setGroupIds((x) => (e.target.checked ? [...x, g.id] : x.filter((i) => i !== g.id)))} />
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      <span className="text-xs text-faint">{project.codes.filter((c) => c.groupId === g.id).length}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <Field label="Turns per request">{(id) => (
                <Select id={id} value={opts.windowSize} onChange={(e) => setOpts({ ...opts, windowSize: Number(e.target.value) })} className="w-full">
                  {[8, 16, 24, 40].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              )}</Field>
              <Field label="Context turns">{(id) => (
                <Select id={id} value={opts.contextTurns} onChange={(e) => setOpts({ ...opts, contextTurns: Number(e.target.value) })} className="w-full">
                  {[0, 2, 3, 6].map((n) => <option key={n} value={n}>{n} before and after</option>)}
                </Select>
              )}</Field>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={opts.respondentOnly} onChange={(e) => setOpts({ ...opts, respondentOnly: e.target.checked })} />
                Skip interviewer turns
              </label>
            </div>
            <p className="mt-3 text-xs text-muted">{windows} requests · {codes} codes in the prompt. Set speaker roles in the Code view first so interviewer turns can be skipped.</p>
          </Panel>

          <Panel title="2 · Run">
            {settings.provider === 'agent' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Download a prompt pack, give it to an agent (or run it through any tool that returns JSON), then import the answers here. The same quote checks apply on import.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={<Download size={15} />} disabled={!windows || !codes} onClick={async () => {
                    const pack = await exportAgentPack(scope, settings.effort)
                    download(`${slug(project.name)}-ai-pack-${pack.runId.slice(0, 8)}.json`, JSON.stringify(pack, null, 1), 'application/json')
                    setMsg({ tone: 'good', text: `Prompt pack with ${pack.windows.length} windows downloaded. Import the answers when they are ready.` })
                  }}>Download prompt pack</Button>
                  <Button icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()}>Import answers</Button>
                </div>
                <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  try {
                    const data = JSON.parse(await f.text())
                    if (data?.format === 'research-weave-grade-responses' || data?.responses?.[0]?.grades) {
                      const run = await importGradeResponses(data)
                      setMsg({ tone: 'good', text: `Imported ${run.suggestions} grades on ${Object.keys(run.claims ?? {}).length} claims. ${run.rejected.length} were rejected.` })
                      return
                    }
                    const run = await importAgentResponses(data)
                    setMsg({ tone: 'good', text: `Imported ${run.suggestions} suggestions (${run.repaired} with repaired quotes). ${run.rejected.length} quotes were rejected.` })
                  } catch (err) { setMsg({ tone: 'bad', text: err instanceof Error ? err.message : String(err) }) }
                }} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {running ? (
                    <Button variant="danger" icon={<Square size={14} />} onClick={() => abort.current?.abort()}>Stop</Button>
                  ) : (
                    <Button variant="primary" icon={<Play size={14} />} disabled={!windows || !codes || (settings.provider === 'anthropic' && !settings.apiKey)} onClick={start}>
                      Run {windows} requests
                    </Button>
                  )}
                  {settings.provider === 'anthropic' && !settings.apiKey && <span className="text-xs text-warn">Add an API key first.</span>}
                </div>
                {progress && (
                  <div className="space-y-1">
                    <Bar value={progress.total ? progress.done / progress.total : 0} label="AI pass progress" />
                    <p className="text-xs text-muted">{progress.done}/{progress.total} windows · {progress.suggestions} suggestions{progress.failed ? ` · ${progress.failed} failed` : ''}{progress.message ? ` · ${progress.message}` : ''}</p>
                  </div>
                )}
              </div>
            )}
            {msg && <p className={cx('mt-3 rounded-md px-3 py-2 text-sm', msg.tone === 'good' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>{msg.text}</p>}
          </Panel>

          <GradePass onMessage={setMsg} />

          <Runs runs={project.aiRuns} />
          <Calibration />
        </div>

        <div className="space-y-5">
          <Panel title="Connection">
            <div className="grid gap-0.5 rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="Provider">
              {PROVIDERS.map((p) => (
                <button key={p.value} type="button" role="radio" aria-checked={settings.provider === p.value} onClick={() => set({ provider: p.value, model: p.value === 'anthropic' ? (settings.model.startsWith('claude') ? settings.model : 'claude-opus-5-5') : p.value === 'openai' && settings.model.startsWith('claude') ? 'llama3.1' : settings.model })}
                  className={cx('rounded px-3 py-1.5 text-left text-sm', settings.provider === p.value ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-ink')}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{PROVIDERS.find((p) => p.value === settings.provider)?.hint}</p>
            <div className="mt-4 space-y-3">
              {settings.provider === 'anthropic' && (
                <>
                  <Field label="API key">{(id) => <Input id={id} type="password" autoComplete="off" value={settings.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder="sk-ant-…" />}</Field>
                  <Field label="Model">{(id) => (
                    <Select id={id} value={settings.model} onChange={(e) => set({ model: e.target.value })} className="w-full">
                      <option value="claude-opus-5-5">Claude Opus 5.5</option>
                      <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
                      <option value="claude-haiku-5-5">Claude Haiku 5.5</option>
                    </Select>
                  )}</Field>
                </>
              )}
              {settings.provider === 'openai' && (
                <>
                  <Field label="Endpoint">{(id) => <Input id={id} value={settings.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} />}</Field>
                  <Field label="Model">{(id) => <Input id={id} value={settings.model} onChange={(e) => set({ model: e.target.value })} />}</Field>
                  <Field label="Key (optional)">{(id) => <Input id={id} type="password" value={settings.apiKey} onChange={(e) => set({ apiKey: e.target.value })} />}</Field>
                </>
              )}
              {settings.provider !== 'openai' && (
                <Field label="Effort" hint="Higher effort reasons more carefully and costs more.">{(id) => (
                  <Select id={id} value={settings.effort} onChange={(e) => set({ effort: e.target.value as AiSettings['effort'] })} className="w-full">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </Select>
                )}</Field>
              )}
            </div>
          </Panel>
          <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
            <ShieldAlert size={18} className="shrink-0" />
            <p>Interview text in scope is sent to the chosen provider. Check that your ethics approval and consent allow it, or use a local model.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Grades claims that already exist: evidence grade and stance only, with the
 * respondent's attributes, each group's decision rule and examples from a
 * person's coding. In held-out mode it is a test of the prompt, not new coding.
 */
function GradePass({ onMessage }: { onMessage: (m: { tone: 'good' | 'bad'; text: string }) => void }) {
  const project = useProject()
  const people = useMemo(() => [...new Set(project.codings.filter((c) => !c.origin && c.status === 'accepted').map((c) => c.coder))], [project.codings])
  const [sourceId, setSourceId] = useState(project.sources[0]?.id ?? '')
  const [mode, setMode] = useState<GradeOptions['mode']>('held-out')
  const [reference, setReference] = useState('')
  const [teachShare, setTeachShare] = useState(DEFAULT_GRADE.teachShare)
  const [examplesPerCode, setExamples] = useState(DEFAULT_GRADE.examplesPerCode)
  const who = people.includes(reference) ? reference : people[0] ?? ''
  const opts: GradeOptions = { ...DEFAULT_GRADE, sourceId, mode, reference: who, teachShare, examplesPerCode }
  const plan = useMemo(() => {
    if (!sourceId || !who) return null
    const { targets, teach, choice } = gradeTargets(project, opts)
    return { targets: targets.length, examples: gradeExamples(project, teach, choice, examplesPerCode).length, groups: choice.map((c) => c.group.name) }
  }, [project, sourceId, mode, who, teachShare, examplesPerCode])
  if (!people.length) return null
  return (
    <Panel title="Grade pass · evidence and stance on existing claims">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Source to grade">{(id) => <Select id={id} value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full">{project.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        <Field label="What to grade">{(id) => (
          <Select id={id} value={mode} onChange={(e) => setMode(e.target.value as GradeOptions['mode'])} className="w-full">
            <option value="held-out">Held-out test: claims a person has graded</option>
            <option value="ungraded">Claims that have no grade yet</option>
          </Select>
        )}</Field>
        <Field label="Whose grades are the standard">{(id) => <Select id={id} value={who} onChange={(e) => setReference(e.target.value)} className="w-full">{people.map((n) => <option key={n}>{n}</option>)}</Select>}</Field>
        <div className="grid grid-cols-2 gap-3">
          {mode === 'held-out' && (
            <Field label="Teach from the first">{(id) => <Select id={id} value={teachShare} onChange={(e) => setTeachShare(Number(e.target.value))} className="w-full">{[0.3, 0.5, 0.7].map((v) => <option key={v} value={v}>{Math.round(v * 100)}% of claims</option>)}</Select>}</Field>
          )}
          <Field label="Examples per value">{(id) => <Select id={id} value={examplesPerCode} onChange={(e) => setExamples(Number(e.target.value))} className="w-full">{[0, 2, 3, 5].map((v) => <option key={v} value={v}>{v}</option>)}</Select>}</Field>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">{plan ? `${plan.targets} claims to grade for ${plan.groups.join(' and ') || 'no single-choice groups'} · ${plan.examples} examples from ${who}'s coding in the prompt.` : 'Choose a source.'}</p>
      <div className="mt-3">
        <Button icon={<Download size={15} />} disabled={!plan?.targets || !plan.groups.length} onClick={async () => {
          try {
            const pack = await exportGradePack(opts)
            download(`${slug(project.name)}-grade-pack-${pack.runId.slice(0, 8)}.json`, JSON.stringify(pack, null, 1), 'application/json')
            onMessage({ tone: 'good', text: `Grade pack with ${pack.windows.length} batches downloaded. Import the answers with “Import answers” when they are ready.` })
          } catch (e) { onMessage({ tone: 'bad', text: e instanceof Error ? e.message : String(e) }) }
        }}>Download grade pack</Button>
      </div>
    </Panel>
  )
}

function Runs({ runs }: { runs: AiRun[] }) {
  const project = useProject()
  const [open, setOpen] = useState<string | null>(null)
  if (!runs.length) return null
  return (
    <Panel title="Passes" bodyClass="p-0">
      <ul className="divide-y divide-line">
        {runs.map((r) => {
          const pending = project.codings.filter((c) => c.origin?.runId === r.id && c.status === 'suggested').length
          const accepted = project.codings.filter((c) => c.origin?.runId === r.id && c.status === 'accepted').length
          return (
            <li key={r.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Bot size={15} className="text-accent" />
                <span className="font-medium">{r.model}</span>
                <span className="text-xs text-muted">{new Date(r.startedAt).toLocaleString()}</span>
                <span className="ml-auto flex flex-wrap gap-1">
                  {r.kind === 'grades' && <Badge tone="accent">grade pass</Badge>}
                  {pending + accepted === 0 && !r.finishedAt && <button type="button" className="text-xs text-accent hover:underline" onClick={() => discardRun(r.id)}>Discard</button>}
                  <Badge>{r.completed}/{r.windows} windows</Badge>
                  <Badge tone="accent">{pending} to review</Badge>
                  <Badge tone="good">{accepted} accepted</Badge>
                  {r.repaired > 0 && <Badge tone="warn">{r.repaired} repaired</Badge>}
                  {r.rejected.length > 0 && <Badge tone="bad">{r.rejected.length} rejected</Badge>}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-faint">
                <span>prompt {r.promptHash}</span><span>codebook {r.codebookHash}</span>
                <span>{r.options.windowSize} turns/request · {r.options.respondentOnly ? 'respondent turns' : 'all turns'} · effort {r.options.effort}</span>
                {r.notes && <span>{r.notes}</span>}
                {r.rejected.length > 0 && <button type="button" className="text-accent hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Show'} rejected quotes</button>}
              </div>
              {open === r.id && (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md bg-sunken p-2 text-xs scroll-thin">
                  {r.rejected.map((x, i) => (
                    <li key={i}><span className="text-bad">{x.reason}</span> · <span className="font-serif text-muted">“{x.quote.slice(0, 160)}”</span></li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/** Compares an AI pass with a human coder on the sources both coded — calibration before trusting suggestions. */
function Calibration() {
  const project = useProject()
  const humans = [...new Set(project.codings.filter((c) => !c.origin && c.status === 'accepted').map((c) => c.coder))]
  const ais = [...new Set(project.codings.filter((c) => c.origin).map((c) => c.coder))]
  const [human, setHuman] = useState(humans[0] ?? '')
  const [ai, setAi] = useState(ais[0] ?? '')
  const sourceIds = project.sources
    .filter((s) => project.codings.some((c) => c.sourceId === s.id && c.coder === human) && project.codings.some((c) => c.sourceId === s.id && c.coder === ai))
    .map((s) => s.id)
  const codeIds = [...new Set(project.codings.filter((c) => c.coder === ai).map((c) => project.aiRuns.find((r) => r.id === c.origin?.runId)?.codeIds ?? []).flat())]
  const result = useMemo(() => (human && ai && sourceIds.length ? agreement(project, human, ai, sourceIds, { includeSuggested: true, codeIds: codeIds.length ? codeIds : undefined }) : null), [project, human, ai, sourceIds.join(), codeIds.join()])
  if (!humans.length || !ais.length) return null
  const fmt = (k: number | null) => (k == null ? '—' : k.toFixed(2))
  return (
    <Panel title="Calibration: AI against a human coder">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Select value={human} onChange={(e) => setHuman(e.target.value)} className="h-8">{humans.map((h) => <option key={h}>{h}</option>)}</Select>
        vs
        <Select value={ai} onChange={(e) => setAi(e.target.value)} className="h-8">{ais.map((h) => <option key={h}>{h}</option>)}</Select>
        <span className="text-xs text-muted">{sourceIds.length} shared source{sourceIds.length === 1 ? '' : 's'} · includes unreviewed suggestions</span>
      </div>
      {!result ? <p className="mt-3 text-sm text-muted">Run the AI over a source the human has already coded to compare them.</p> : (
        <>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1.5 font-medium">Group</th><th className="text-right font-medium">Overlap</th><th className="text-right font-medium">κ</th></tr></thead>
            <tbody>
              {result.byGroup.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-1.5">{r.label}</td>
                  <td className="text-right tabular-nums">{Math.round(r.percent * 100)}%</td>
                  <td className={cx('text-right font-medium tabular-nums', r.kappa == null ? '' : r.kappa >= 0.6 ? 'text-good' : r.kappa >= 0.4 ? 'text-warn' : 'text-bad')}>{fmt(r.kappa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Published studies put model-vs-expert κ around 0.4–0.7, below expert-vs-expert. Only lean on suggestions for groups that reach your human-to-human level; review the rest one by one. Per-code detail is under Review → Agreement.</p>
        </>
      )}
    </Panel>
  )
}
