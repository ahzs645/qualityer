import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { AiRun, Coding, Project, Source } from '../types'
import { indexBy, now, segmentsOf, uid } from '../model'
import { flush, snapshot, store, update } from '../store'
import {
  DEFAULT_OPTIONS, SUGGESTION_JSON_SCHEMA, SuggestionSchema, codeKeys, examplesFrom, hash, selectCodes,
  systemPrompt, userMessage, verifyWindow, windowsFor, type PipelineOptions, type RawSuggestion, type Window,
} from './pipeline'
import { GRADE_JSON_SCHEMA, prepareGrades, verifyGrades, type GradeOptions, type GradePack, type RawGrade } from './grade'

// Settings stay in this browser (localStorage), never in project exports.

export type Provider = 'anthropic' | 'openai' | 'agent'
export interface AiSettings {
  provider: Provider
  apiKey: string
  model: string
  baseUrl: string
  effort: 'low' | 'medium' | 'high'
}

const KEY = 'rw-ai-settings'
export const DEFAULT_SETTINGS: AiSettings = { provider: 'agent', apiKey: '', model: 'claude-opus-5-5', baseUrl: 'http://localhost:11434/v1', effort: 'medium' }

export function getAiSettings(): AiSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULT_SETTINGS }
}
export function saveAiSettings(s: AiSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

// Models that accept server-side refusal fallbacks.
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-[12]|fable-5)$/

async function callAnthropic(s: AiSettings, system: string, user: string, signal: AbortSignal): Promise<RawSuggestion[]> {
  const client = new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true, maxRetries: 3 })
  const withFallback = FALLBACK_MODELS.test(s.model)
  const msg = await client.beta.messages.parse({
    model: s.model,
    max_tokens: 16000,
    ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort: s.effort, format: betaZodOutputFormat(SuggestionSchema) },
  }, { signal })
  if (msg.stop_reason === 'refusal') throw new Error('The model declined this window.')
  if (msg.stop_reason === 'max_tokens') throw new Error('The response was cut off (max tokens).')
  if (!msg.parsed_output) throw new Error('The response did not match the expected format.')
  return msg.parsed_output.suggestions
}

/** A local or self-hosted model behind an OpenAI-compatible endpoint (e.g. Ollama, LM Studio). */
async function callOpenAICompatible(s: AiSettings, system: string, user: string, signal: AbortSignal): Promise<RawSuggestion[]> {
  const res = await fetch(s.baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', ...(s.apiKey ? { authorization: `Bearer ${s.apiKey}` } : {}) },
    body: JSON.stringify({
      model: s.model,
      temperature: 0,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name: 'suggestions', strict: true, schema: SUGGESTION_JSON_SCHEMA } },
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  const text: string = body.choices?.[0]?.message?.content ?? ''
  const parsed = SuggestionSchema.safeParse(JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()))
  if (!parsed.success) throw new Error('The response did not match the expected format.')
  return parsed.data.suggestions
}

export interface RunScope {
  sourceIds: string[]
  groupIds: string[]
  options: PipelineOptions
}

function prepare(project: Project, scope: RunScope, provider: Provider, model: string, effort: string) {
  const codes = selectCodes(project, scope.groupIds)
  const { toKey, toId } = codeKeys(codes)
  const system = systemPrompt(project, codes, toKey, examplesFrom(project, codes, scope.sourceIds))
  const sources = project.sources.filter((s) => scope.sourceIds.includes(s.id))
  const windows = sources.flatMap((s) => windowsFor(s, scope.options))
  const run: AiRun = {
    id: uid(), startedAt: now(), finishedAt: null, provider, model,
    promptHash: hash(system), codebookHash: hash(JSON.stringify(codes.map((c) => [c.name, c.definition, c.include, c.exclude]))),
    sourceIds: scope.sourceIds, codeIds: codes.map((c) => c.id), windows: windows.length, completed: 0, failed: [],
    suggestions: 0, repaired: 0, rejected: [], notes: '', codeKeys: Object.fromEntries(toId),
    options: { ...scope.options, effort },
    turnsHash: turnsHash(sources),
  }
  return { codes, system, windows, run, toId }
}

/** Turn ids (T0001…) and windows are positional: joining, splitting or reassigning a turn changes them. */
export function turnsHash(sources: Source[]) {
  return hash(sources.map((s) => `${s.id}:${segmentsOf(s).map((g) => g.speaker).join('|')}`).join('\n'))
}

/** Unique per pass, so passes can be compared with humans (and each other) separately. */
const coderName = (run: AiRun, model = run.model) => `AI · ${model} #${run.id.slice(0, 4)}`

export interface Progress { done: number; total: number; suggestions: number; failed: number; message?: string }

/** Runs a pass with a model API. Suggestions are added as `suggested` codings when the pass ends or is stopped. */
export async function runPass(scope: RunScope, settings: AiSettings, onProgress: (p: Progress) => void, signal: AbortSignal) {
  const project = store.state.project
  if (!project) throw new Error('No project open')
  const { system, windows, run, toId } = prepare(project, scope, settings.provider, settings.model, settings.effort)
  const sources = indexBy(project.sources)
  const call = settings.provider === 'anthropic' ? callAnthropic : callOpenAICompatible
  const found: Coding[] = []
  let next = 0
  const report = (message?: string) => onProgress({ done: run.completed + run.failed.length, total: windows.length, suggestions: found.length, failed: run.failed.length, message })
  report()
  const worker = async () => {
    while (next < windows.length && !signal.aborted) {
      const w = windows[next++]
      const source = sources.get(w.sourceId)!
      try {
        const raw = await call(settings, system, userMessage(source, w), signal)
        const v = verifyWindow(project, source, w, raw, toId, { id: run.id, coder: coderName(run) })
        found.push(...v.codings)
        run.rejected.push(...v.rejected)
        run.repaired += v.repaired
        run.completed++
        report()
      } catch (e) {
        if (signal.aborted) break
        run.failed.push(w.id)
        report(e instanceof Error ? e.message : String(e))
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  run.finishedAt = now()
  run.suggestions = found.length
  if (signal.aborted) run.notes = 'Stopped before all windows finished.'
  update(`AI pass (${found.length} suggestions)`, (p) => ({ ...p, codings: [...p.codings, ...found], aiRuns: [run, ...p.aiRuns] }))
  return run
}

// Agent hand-off ---------------------------------------------------------------
// For coding with an agent (or any model) outside the app: export the exact
// prompts, have the agent answer each window, then import its answers. The same
// verification runs on import.

export interface AgentPack {
  format: 'research-weave-ai-pack'
  version: 1
  runId: string
  instructions: string
  system: string
  response_schema: typeof SUGGESTION_JSON_SCHEMA
  codes: Record<string, string>
  windows: { id: string; source: string; user: string }[]
}

export interface AgentResponses {
  format?: 'research-weave-ai-responses'
  runId: string
  model?: string
  responses: { window_id: string; suggestions: RawSuggestion[] }[]
}

export async function exportAgentPack(scope: RunScope, effort = 'medium'): Promise<AgentPack> {
  const project = store.state.project
  if (!project) throw new Error('No project open')
  const { system, windows, run, codes } = prepare(project, scope, 'agent', 'agent', effort)
  update('prepare AI hand-off', (p) => ({ ...p, aiRuns: [{ ...run, notes: 'Waiting for agent responses.' }, ...p.aiRuns] }))
  // The run holds the code-key map needed to read the answers: save it now, not on the next autosave.
  await flush()
  const sources = indexBy(project.sources)
  return {
    format: 'research-weave-ai-pack', version: 1, runId: run.id,
    instructions: 'For each window, act on `system` as your instructions and `user` as the input, and return {"suggestions": [...]} matching response_schema. Collect all answers as {"format":"research-weave-ai-responses","runId":<runId>,"model":<your model>,"responses":[{"window_id":<id>,"suggestions":[...]}]}. Quotes must be copied verbatim from the target turn.',
    system, response_schema: SUGGESTION_JSON_SCHEMA,
    codes: Object.fromEntries(codes.map((c, i) => ['C' + String(i + 1).padStart(3, '0'), c.name])),
    windows: windows.map((w: Window) => ({ id: w.id, source: sources.get(w.sourceId)!.name, user: userMessage(sources.get(w.sourceId)!, w) })),
  }
}

export async function importAgentResponses(data: AgentResponses) {
  const project = store.state.project
  if (!project) throw new Error('No project open')
  const run = project.aiRuns.find((r) => r.id === data.runId)
  if (!run) throw new Error('These responses belong to a hand-off that is not in this project.')
  if (run.turnsHash) {
    const now = turnsHash(run.sourceIds.map((id) => project.sources.find((s) => s.id === id)).filter((s): s is Source => !!s))
    if (now !== run.turnsHash) throw new Error('Turns in these transcripts were joined, split or given to another speaker after this prompt pack was downloaded, so turn ids in the answers no longer point to the same text. Download a new prompt pack and have it answered again.')
  }
  const toId = new Map(Object.entries(run.codeKeys))
  const sources = indexBy(project.sources)
  const byId = new Map<string, Window>()
  for (const sid of run.sourceIds) {
    const s = sources.get(sid)
    if (s) for (const w of windowsFor(s, run.options)) byId.set(w.id, w)
  }
  const found: Coding[] = []
  const next: AiRun = { ...run, model: data.model || run.model, rejected: [...run.rejected], failed: [] }
  const coder = coderName(next)
  for (const r of data.responses ?? []) {
    const w = byId.get(r.window_id)
    if (!w) { next.failed.push(r.window_id); continue }
    const parsed = SuggestionSchema.safeParse({ suggestions: r.suggestions })
    if (!parsed.success) { next.failed.push(r.window_id); continue }
    const v = verifyWindow(project, sources.get(w.sourceId)!, w, parsed.data.suggestions, toId, { id: run.id, coder })
    found.push(...v.codings)
    next.rejected.push(...v.rejected)
    next.repaired += v.repaired
    next.completed++
  }
  // Answers can be imported more than once (a late window, a retry): count each window once.
  next.completed = Math.min(run.windows, next.completed)
  next.suggestions += found.length
  next.finishedAt = now()
  next.notes = `${data.responses?.length ?? 0} of ${run.windows} windows answered.`
  await snapshot('Before importing AI suggestions')
  update(`import ${found.length} AI suggestions`, (p) => ({
    ...p, codings: [...p.codings, ...found], aiRuns: p.aiRuns.map((x) => (x.id === run.id ? next : x)),
  }))
  return next
}

export function estimateWindows(project: Project, scope: RunScope) {
  return project.sources.filter((s) => scope.sourceIds.includes(s.id)).reduce((n, s) => n + windowsFor(s, scope.options ?? DEFAULT_OPTIONS).length, 0)
}

// ---------------------------------------------------------------------------
// Grade pass: the same hand-off, for grading claims that already exist.

export interface GradeResponses {
  format?: 'research-weave-grade-responses'
  runId: string
  model?: string
  responses: { window_id: string; grades: RawGrade[] }[]
}

export async function exportGradePack(opts: GradeOptions): Promise<GradePack> {
  const project = store.state.project
  if (!project) throw new Error('No project open')
  const { run, system, windows, targets } = prepareGrades(project, opts)
  if (!targets.length) throw new Error(opts.mode === 'held-out' ? 'This source has no claims graded by that person beyond the teaching share.' : 'Every coded claim in this source already has its grades.')
  update('prepare grade pass', (p) => ({ ...p, aiRuns: [{ ...run, notes: 'Waiting for agent responses.' }, ...p.aiRuns] }))
  await flush()
  return {
    format: 'research-weave-grade-pack', version: 1, runId: run.id,
    instructions: 'For each window, act on `system` as your instructions and `user` as the input, and return {"grades": [...]} matching response_schema. Collect all answers as {"format":"research-weave-grade-responses","runId":<runId>,"model":<your model>,"responses":[{"window_id":<id>,"grades":[...]}]}.',
    system, response_schema: GRADE_JSON_SCHEMA, windows,
  }
}

export async function importGradeResponses(data: GradeResponses) {
  const project = store.state.project
  if (!project) throw new Error('No project open')
  const run = project.aiRuns.find((r) => r.id === data.runId)
  if (!run || run.kind !== 'grades') throw new Error('These grades belong to a grade pass that is not in this project.')
  const next: AiRun = { ...run, model: data.model || run.model, rejected: [...run.rejected], failed: [] }
  const coder = coderName(next)
  const found: Coding[] = []
  let working = project
  for (const r of data.responses ?? []) {
    if (!Array.isArray(r.grades)) { next.failed.push(r.window_id); continue }
    const v = verifyGrades(working, run, r.grades, coder)
    found.push(...v.codings)
    working = { ...working, codings: [...working.codings, ...v.codings] }
    next.rejected.push(...v.rejected)
    next.completed++
  }
  next.completed = Math.min(run.windows, next.completed)
  next.suggestions += found.length
  next.finishedAt = now()
  next.notes = `${data.responses?.length ?? 0} of ${run.windows} batches answered.`
  await snapshot('Before importing AI grades')
  update(`import ${found.length} AI grades`, (p) => ({ ...p, codings: [...p.codings, ...found], aiRuns: p.aiRuns.map((x) => (x.id === run.id ? next : x)) }))
  return next
}
