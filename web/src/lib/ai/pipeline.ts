import { z } from 'zod'
import type { AiRun, Code, Coding, Project, Source } from '../types'
import { formatTime, groupOf, indexBy, now, orderedCodes, segmentsOf, snapToWords, speakerOf, uid } from '../model'

// Deductive AI coding, built so a researcher stays in charge:
//   1. Transcripts are split into windows of speaker turns with stable IDs.
//      Only "target" turns may be coded; neighbouring turns are read-only context.
//   2. The prompt is built around the codebook (definition / include / exclude /
//      anchor), the research question and the codebook rules.
//   3. The model returns {code, turn, verbatim quote, rationale, criterion, confidence}.
//   4. Every quote is checked against the transcript in the browser. Exact matches
//      become suggestions, near matches are repaired and flagged, the rest are
//      rejected and logged in the run manifest. Nothing is applied until reviewed.

export interface Turn {
  id: string
  index: number
  start: number
  end: number
  speaker: string
  role: string
  time: number | null
}

export interface Window {
  id: string
  sourceId: string
  targets: Turn[]
  context: Turn[]
}

export interface PipelineOptions {
  windowSize: number
  contextTurns: number
  respondentOnly: boolean
}

export const DEFAULT_OPTIONS: PipelineOptions = { windowSize: 24, contextTurns: 3, respondentOnly: true }

/** Speaker turns with stable IDs, skipping "[mm:ss]  Speaker" header lines. */
export function turnsOf(source: Source): Turn[] {
  return segmentsOf(source).map((g, i) => {
    let start = g.start
    const nl = source.text.indexOf('\n', start)
    if (nl > -1 && nl < g.end && /^\[[\d:.]+\]\s+.{1,60}$/.test(source.text.slice(start, nl).trim())) start = nl + 1
    const sp = g.speaker ? speakerOf(source, g.speaker) : undefined
    return {
      id: 'T' + String(i + 1).padStart(4, '0'), index: i, start, end: g.end,
      speaker: sp?.name || g.speaker || 'Unlabelled', role: sp?.role ?? 'unknown', time: g.time,
    }
  }).filter((t) => t.end > t.start && source.text.slice(t.start, t.end).trim())
}

export function windowsFor(source: Source, opts: PipelineOptions): Window[] {
  const turns = turnsOf(source)
  const codable = (t: Turn) => !opts.respondentOnly || t.role !== 'interviewer'
  const out: Window[] = []
  for (let i = 0; i < turns.length; i += opts.windowSize) {
    const block = turns.slice(i, i + opts.windowSize)
    const targets = block.filter(codable)
    if (!targets.length) continue
    const before = turns.slice(Math.max(0, i - opts.contextTurns), i)
    const after = turns.slice(i + opts.windowSize, i + opts.windowSize + opts.contextTurns)
    out.push({ id: `${source.id}:${i / opts.windowSize}`, sourceId: source.id, targets, context: [...before, ...block.filter((t) => !codable(t)), ...after] })
  }
  return out
}

/** Short, stable code keys for the prompt (C001…), so the model never sees internal IDs. */
export function codeKeys(codes: Code[]) {
  const toKey = new Map<string, string>()
  const toId = new Map<string, string>()
  codes.forEach((c, i) => { const k = 'C' + String(i + 1).padStart(3, '0'); toKey.set(c.id, k); toId.set(k, c.id) })
  return { toKey, toId }
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function systemPrompt(project: Project, codes: Code[], keys: Map<string, string>, examples: Map<string, string>) {
  const groups = indexBy(project.groups)
  const all = indexBy(project.codes)
  const cards = codes.map((c) => {
    const g = groupOf(c, all, groups)
    const parts = [
      `<code id="${keys.get(c.id)}" name="${xml(c.name)}"${g ? ` group="${xml(g.name)}"` : ''}>`,
      c.definition && `  <definition>${xml(c.definition)}</definition>`,
      c.include && `  <include id="inc">${xml(c.include)}</include>`,
      c.exclude && `  <exclude id="exc">${xml(c.exclude)}</exclude>`,
      (examples.get(c.id) || c.anchor) && `  <example>${xml(examples.get(c.id) || c.anchor)}</example>`,
      '</code>',
    ]
    return parts.filter(Boolean).join('\n')
  }).join('\n')

  const rules = project.rules.filter((r) => r.enabled).map((r) => {
    const trig = r.triggerGroupIds.map((g) => groups.get(g)?.name).filter(Boolean).join(' / ')
    const target = r.targetGroupId ? groups.get(r.targetGroupId)?.name : ''
    if (r.kind === 'exactly-one') return `- Every passage you code with a ${trig} code must also get exactly one ${target} code, on the same quote.`
    if (r.kind === 'at-most-one') return `- A passage coded with a ${trig} code may get at most one ${target} code, on the same quote, and only when the speaker expresses a position.`
    return `- ${trig} codes mark figures for a separate extraction table; apply them only when the quote contains the quantity or estimate itself.`
  }).join('\n')

  const guide = project.guide.length
    ? `<interview_guide>\n${project.guide.map((q) => `${q.key} ${q.title}: ${q.prompt}`).join('\n')}\n</interview_guide>\n`
    : ''

  return `You are a careful qualitative researcher applying an existing codebook to interview transcripts (deductive coding). Precision matters more than coverage: leave a passage uncoded rather than stretch a code to fit it.

<study>
Research question: ${project.question || '(not recorded)'}
Method: ${project.method || '(not recorded)'}
</study>
${guide}
<codebook>
${cards}
</codebook>

How to code:
- Code only turns inside <target_turns>. Turns in <context_turns> are there to help you understand them; never quote them.
- Each suggestion quotes one claim: usually one sentence or clause, copied character-for-character from a single turn, including fillers like "um" and repeated words. Do not tidy, paraphrase, join or shorten the quote with ellipses.
- A quote may receive several codes; return one suggestion per code, with the identical quote.
- Use only the code ids listed above. Follow each code's include and exclude criteria and name the one you relied on in "criterion" (for example "include", "exclude does not apply", or the definition).
- Do not code interviewer questions, logistics, greetings or acknowledgements.
- confidence: "high" when the criteria clearly apply, "medium" when they apply on a reasonable reading, "low" when it is borderline.
${rules ? `Codebook rules:\n${rules}\n` : ''}- If nothing in the target turns fits the codebook, return an empty list.`
}

export function userMessage(source: Source, w: Window) {
  const fmt = (t: Turn) => `<turn id="${t.id}" speaker="${xml(t.speaker)}"${t.role !== 'unknown' ? ` role="${t.role}"` : ''}${t.time != null ? ` time="${formatTime(t.time)}"` : ''}>${xml(source.text.slice(t.start, t.end).trim())}</turn>`
  const before = w.context.filter((t) => t.index < w.targets[0].index)
  const others = w.context.filter((t) => t.index >= w.targets[0].index)
  return `Source: ${xml(source.name)}

<context_turns>
${before.map(fmt).join('\n')}
${others.map(fmt).join('\n')}
</context_turns>

<target_turns>
${w.targets.map(fmt).join('\n')}
</target_turns>

Code the target turns.`
}

export const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    code_id: z.string(),
    turn_id: z.string(),
    quote: z.string(),
    rationale: z.string(),
    criterion: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
})
export type RawSuggestion = z.infer<typeof SuggestionSchema>['suggestions'][number]

/** JSON Schema of the response, for providers and agents without Zod. */
export const SUGGESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code_id', 'turn_id', 'quote', 'rationale', 'criterion', 'confidence'],
        properties: {
          code_id: { type: 'string', description: 'Code id from the codebook, e.g. C014' },
          turn_id: { type: 'string', description: 'Target turn id, e.g. T0042' },
          quote: { type: 'string', description: 'Verbatim substring of that turn: the minimal span that carries the claim' },
          rationale: { type: 'string', description: 'One or two sentences on why the code applies' },
          criterion: { type: 'string', description: 'Which criterion was relied on, e.g. include' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
} as const

// ---------------------------------------------------------------------------
// Quote verification

/** Lower-cases, straightens quotes, collapses whitespace; keeps a map back to original offsets. */
function normalize(text: string) {
  let out = ''
  const map: number[] = []
  let space = false
  for (let i = 0; i < text.length; i++) {
    let ch = text[i]
    if (/\s/.test(ch)) { if (!space && out) { out += ' '; map.push(i) } space = true; continue }
    space = false
    ch = ch.replace(/[‘’`´]/, "'").replace(/[“”]/, '"').replace(/[–—]/, '-').toLowerCase()
    out += ch
    map.push(i)
  }
  return { out, map }
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  const v = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = v[0]
    v[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = v[j]
      v[j] = Math.min(v[j] + 1, v[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return v[b.length]
}

export type Match = { start: number; end: number; match: 'exact' | 'repaired' } | { reason: string }

export function locateQuote(text: string, turn: { start: number; end: number }, quote: string): Match {
  const body = text.slice(turn.start, turn.end)
  const q = normalize(quote.replace(/^[\s"'“”‘’.…-]+|[\s"'“”‘’…]+$/g, '')).out
  if (q.length < 3) return { reason: 'Quote too short' }
  const n = normalize(body)
  const at = n.out.indexOf(q)
  if (at >= 0) {
    const [s, e] = snapToWords(text, turn.start + n.map[at], turn.start + n.map[at + q.length - 1] + 1)
    return { start: s, end: e, match: 'exact' }
  }
  if (/\.\.\.|…/.test(quote)) return { reason: 'Quote was shortened with an ellipsis' }
  // Near match: slide a window of similar length over word boundaries.
  const starts = [0, ...[...n.out.matchAll(/ /g)].map((m) => (m.index ?? 0) + 1)]
  let best = { score: 0, a: 0, b: 0 }
  for (const a of starts) {
    for (const len of [q.length, Math.round(q.length * 0.9), Math.round(q.length * 1.1)]) {
      const cand = n.out.slice(a, a + len)
      if (cand.length < q.length * 0.8) continue
      const score = 1 - levenshtein(cand, q) / Math.max(cand.length, q.length)
      if (score > best.score) best = { score, a, b: a + cand.length }
    }
    if (best.score > 0.98) break
  }
  if (best.score >= 0.88) {
    const [s, e] = snapToWords(text, turn.start + n.map[best.a], turn.start + n.map[Math.min(best.b, n.map.length) - 1] + 1)
    return { start: s, end: e, match: 'repaired' }
  }
  return { reason: `Quote not found in ${'turn'} (best match ${Math.round(best.score * 100)}%)` }
}

const CONFIDENCE = { high: 0.9, medium: 0.6, low: 0.3 } as const

/** Turns raw model output for one window into suggested codings plus rejection records. */
export function verifyWindow(project: Project, source: Source, w: Window, raw: RawSuggestion[], toId: Map<string, string>, run: { id: string; coder: string }) {
  const turns = new Map(w.targets.map((t) => [t.id, t]))
  const codings: Coding[] = []
  const rejected: AiRun['rejected'] = []
  let repaired = 0
  const seen = new Set<string>()
  for (const s of raw) {
    const codeId = toId.get(s.code_id.trim().toUpperCase())
    const turn = turns.get(s.turn_id.trim().toUpperCase())
    if (!codeId) { rejected.push({ windowId: w.id, quote: s.quote, codeId: s.code_id, reason: 'Unknown code id' }); continue }
    if (!turn) { rejected.push({ windowId: w.id, quote: s.quote, codeId, reason: `Turn ${s.turn_id} is not a target turn` }); continue }
    const m = locateQuote(source.text, turn, s.quote)
    if ('reason' in m) { rejected.push({ windowId: w.id, quote: s.quote, codeId, reason: m.reason }); continue }
    const key = `${codeId}:${m.start}:${m.end}`
    if (seen.has(key)) continue
    seen.add(key)
    // Skip only what this pass already produced (a re-import). A suggestion that agrees with a
    // person's coding, or with an earlier pass, is kept: dropping it would understate agreement.
    if (project.codings.some((c) => c.sourceId === source.id && c.codeId === codeId && c.start === m.start && c.end === m.end && (c.origin ? c.origin.runId === run.id : c.coder === run.coder))) continue
    if (m.match === 'repaired') repaired++
    codings.push({
      id: uid(), sourceId: source.id, codeId, start: m.start, end: m.end, coder: run.coder, memo: '',
      important: false, status: 'suggested', createdAt: now(), confidence: CONFIDENCE[s.confidence],
      rationale: `${s.rationale}${s.criterion ? ` [${s.criterion}]` : ''}`, origin: { runId: run.id, match: m.match },
    })
  }
  return { codings, rejected, repaired }
}

/**
 * One coded example per code from accepted human codings, to anchor the prompt
 * (one-shot). Examples never come from the sources being coded, so a pass on an
 * already-coded interview stays a fair calibration test.
 */
export function examplesFrom(project: Project, codes: Code[], excludeSourceIds: string[] = []) {
  const sources = indexBy(project.sources)
  const out = new Map<string, string>()
  for (const c of codes) {
    const hit = project.codings.find((k) => k.codeId === c.id && k.status === 'accepted' && !k.origin && k.end - k.start < 400 && !excludeSourceIds.includes(k.sourceId))
    const s = hit && sources.get(hit.sourceId)
    if (s && hit) out.set(c.id, s.text.slice(hit.start, hit.end).replace(/\s+/g, ' ').trim())
  }
  return out
}

export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function selectCodes(project: Project, groupIds: string[]) {
  const all = indexBy(project.codes)
  const groups = indexBy(project.groups)
  return orderedCodes(project).map((x) => x.code).filter((c) => !groupIds.length || groupIds.includes(groupOf(c, all, groups)?.id ?? ''))
}
