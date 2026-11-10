import type { AiRun, Code, CodeGroup, Coding, Project, Source } from '../types'
import { excerpt, formatTime, groupOf, indexBy, now, segmentsOf, speakerOf, timeAt, uid } from '../model'
import { choiceGroups } from '../claims'
import { codeKeys, hash } from './pipeline'

// The grade pass. Finding claims and grading them are different jobs, and a
// model asked to do both drifts on the second. This pass takes claims that
// already exist and asks only for the single-choice groups (evidence grade,
// stance), giving the model what a person would use: who the respondent is,
// the group's decision rule, and contrasting examples from a person's coding.

export interface GradeOptions {
  sourceId: string
  /** `held-out` grades claims a person already graded, after the teaching share, to test the prompt. `ungraded` grades claims that lack a grade. */
  mode: 'held-out' | 'ungraded'
  /** Whose grades count as the standard. */
  reference: string
  /** In held-out mode, the share of the person's claims (from the start) that examples may come from. */
  teachShare: number
  examplesPerCode: number
  batchSize: number
}

export const DEFAULT_GRADE: Omit<GradeOptions, 'sourceId' | 'reference'> = { mode: 'held-out', teachShare: 0.5, examplesPerCode: 3, batchSize: 25 }

export interface GradeClaim { key: string; sourceId: string; start: number; end: number; codeIds: string[] }
export interface GradeExample { codeId: string; text: string; contrast: string | null }

const spanKey = (c: { sourceId: string; start: number; end: number }) => `${c.sourceId}:${c.start}:${c.end}`

/** Which claims to grade and which of the reference coder's claims may be used to teach. */
export function gradeTargets(project: Project, opts: GradeOptions) {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const gOf = (c: Coding) => groupOf(codes.get(c.codeId), codes, groups)
  const choice = choiceGroups(project)
  const choiceIds = choice.map((c) => c.group.id)
  const bySpan = new Map<string, Coding[]>()
  for (const c of project.codings) {
    if (c.status !== 'accepted') continue
    const k = spanKey(c)
    if (!bySpan.has(k)) bySpan.set(k, [])
    bySpan.get(k)!.push(c)
  }
  const substantive = (list: Coding[]) => list.filter((c) => gOf(c)?.kind === 'substantive')
  // Claims the reference coder both coded and graded in every single-choice group.
  const graded: { claim: GradeClaim; grades: Map<string, string> }[] = []
  const open: GradeClaim[] = []
  for (const list of bySpan.values()) {
    const first = list[0]
    const sub = substantive(list)
    if (!sub.length) continue
    const claim: GradeClaim = { key: '', sourceId: first.sourceId, start: first.start, end: first.end, codeIds: [...new Set(sub.map((c) => c.codeId))] }
    const own = list.filter((c) => !c.origin && c.coder === opts.reference)
    const grades = new Map(choiceIds.map((gid) => [gid, own.find((c) => gOf(c)?.id === gid)?.codeId]).filter((x): x is [string, string] => !!x[1]))
    if (substantive(own).length && grades.size === choiceIds.length) graded.push({ claim, grades })
    if (first.sourceId === opts.sourceId && choiceIds.some((gid) => !list.some((c) => gOf(c)?.id === gid))) open.push(claim)
  }
  const order = (a: GradeClaim, b: GradeClaim) => a.start - b.start || a.end - b.end
  graded.sort((a, b) => (a.claim.sourceId === b.claim.sourceId ? order(a.claim, b.claim) : a.claim.sourceId < b.claim.sourceId ? -1 : 1))
  let teach = graded
  let targets = open.sort(order)
  if (opts.mode === 'held-out') {
    const here = graded.filter((g) => g.claim.sourceId === opts.sourceId)
    const cut = Math.round(here.length * Math.max(0, Math.min(1, opts.teachShare)))
    // Teaching material: the first share of this source, plus anything the person graded elsewhere.
    teach = [...graded.filter((g) => g.claim.sourceId !== opts.sourceId), ...here.slice(0, cut)]
    targets = here.slice(cut).map((g) => g.claim)
  }
  targets = targets.map((c, i) => ({ ...c, key: 'K' + String(i + 1).padStart(3, '0') }))
  return { targets, teach, choice }
}

/**
 * Examples for each grade, taken from the teaching claims. Passages where an
 * earlier AI pass chose a different value come first: they sit on the boundary
 * the model gets wrong, and say so.
 */
export function gradeExamples(project: Project, teach: ReturnType<typeof gradeTargets>['teach'], choice: ReturnType<typeof gradeTargets>['choice'], perCode: number): GradeExample[] {
  const sources = indexBy(project.sources)
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const ai = project.codings.filter((c) => c.origin)
  const out: GradeExample[] = []
  for (const { group, codes: options } of choice) {
    for (const code of options) {
      const pool = teach.filter((t) => t.grades.get(group.id) === code.id && t.claim.end - t.claim.start <= 380).map((t) => {
        const wrong = ai.find((c) => c.sourceId === t.claim.sourceId && c.start < t.claim.end && c.end > t.claim.start && c.codeId !== code.id && groupOf(codes.get(c.codeId), codes, groups)?.id === group.id)
        return { t, contrast: wrong ? codes.get(wrong.codeId)?.name.replace(/\s{2,}/, ' ') ?? null : null }
      })
      pool.sort((a, b) => Number(!!b.contrast) - Number(!!a.contrast) || a.t.claim.start - b.t.claim.start)
      for (const { t, contrast } of pool.slice(0, perCode)) {
        const s = sources.get(t.claim.sourceId)
        if (s) out.push({ codeId: code.id, text: excerpt(s.text, t.claim.start, t.claim.end), contrast })
      }
    }
  }
  return out
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function gradeSystem(project: Project, choice: { group: CodeGroup; codes: Code[] }[], keys: Map<string, string>, examples: GradeExample[]) {
  const blocks = choice.map(({ group, codes }) => {
    const cards = codes.map((c) => [
      `  <code id="${keys.get(c.id)}" name="${xml(c.name.replace(/\s{2,}/, ' '))}">`,
      c.definition && `    <definition>${xml(c.definition)}</definition>`,
      c.include && `    <include>${xml(c.include)}</include>`,
      c.exclude && `    <exclude>${xml(c.exclude)}</exclude>`,
      ...examples.filter((e) => e.codeId === c.id).map((e) => `    <example${e.contrast ? ` not="${xml(e.contrast)}"` : ''}>${xml(e.text)}</example>`),
      '  </code>',
    ].filter(Boolean).join('\n')).join('\n')
    return `<group id="${group.id}" name="${xml(group.name)}">\n${group.description?.trim() ? `  <how_to_choose>${xml(group.description.trim())}</how_to_choose>\n` : ''}${cards}\n</group>`
  }).join('\n')
  return `You are grading claims that a qualitative researcher has already identified and coded in interview transcripts. Do not look for new claims and do not question the codes: for each claim, choose exactly one value in each group below.

<study>
Research question: ${project.question || '(not recorded)'}
Method: ${project.method || '(not recorded)'}
</study>

${blocks}

How to grade:
- Each <claim> gives the passage, the turn around it and the codes already applied. Grade the passage itself; use the context only to understand it.
- <respondent> says who is speaking. Whether a statement is something the respondent owns, saw, was told or is guessing at depends on who they are.
- Where a group has <how_to_choose>, work through it in order and stop at the first step that applies.
- An <example not="X"> is a passage a person graded with this value where an earlier reading chose X instead. Treat it as a ruling on that boundary.
- Return one entry per claim with one code id from each group, a one-sentence reason, and confidence "high", "medium" or "low".`
}

export function gradeUser(project: Project, source: Source, claims: GradeClaim[]) {
  const codes = indexBy(project.codes)
  const attrs = Object.entries(source.attributes).filter(([, v]) => v.trim()).map(([k, v]) => `  ${xml(k)}: ${xml(v)}`).join('\n')
  const segs = segmentsOf(source)
  const items = claims.map((c) => {
    const seg = segs.find((g) => g.start <= c.start && g.end >= c.end) ?? segs.find((g) => g.start <= c.start && g.end > c.start)
    // Context is a window of the transcript, not the turn: machine transcripts often break a speaker's answer into short turns.
    const lo = Math.max(0, c.start - 600), hi = Math.min(source.text.length, c.end + 300)
    const who = seg ? speakerOf(source, seg.speaker) : undefined
    const t = timeAt(source, c.start)
    return `<claim id="${c.key}"${t != null ? ` time="${formatTime(t)}"` : ''}${who ? ` speaker="${xml(who.name)}" role="${who.role}"` : ''} codes="${xml(c.codeIds.map((id) => codes.get(id)?.name.replace(/\s{2,}/, ' ')).filter(Boolean).join('; '))}">
  <before>${xml(source.text.slice(lo, c.start).replace(/\s+/g, ' ').trim())}</before>
  <passage>${xml(source.text.slice(c.start, c.end).replace(/\s+/g, ' ').trim())}</passage>
  <after>${xml(source.text.slice(c.end, hi).replace(/\s+/g, ' ').trim())}</after>
</claim>`
  }).join('\n')
  return `Source: ${xml(source.name)}
<respondent>
${attrs || '  (no attributes recorded)'}
</respondent>

${items}

Grade each claim.`
}

export const GRADE_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['grades'],
  properties: {
    grades: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['claim_id', 'code_ids', 'reason', 'confidence'],
        properties: {
          claim_id: { type: 'string', description: 'Claim id, e.g. K014' },
          code_ids: { type: 'array', items: { type: 'string' }, description: 'One code id from each group' },
          reason: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
} as const

export interface RawGrade { claim_id: string; code_ids: string[]; reason?: string; confidence?: string }

export interface GradePack {
  format: 'research-weave-grade-pack'
  version: 1
  runId: string
  instructions: string
  system: string
  response_schema: typeof GRADE_JSON_SCHEMA
  windows: { id: string; source: string; user: string }[]
}

/** Builds the prompts and the run record for a grade pass. */
export function prepareGrades(project: Project, opts: GradeOptions) {
  const source = project.sources.find((s) => s.id === opts.sourceId)
  if (!source) throw new Error('Choose a source to grade.')
  const { targets, teach, choice } = gradeTargets(project, opts)
  const choiceCodes = choice.flatMap((c) => c.codes)
  const { toKey, toId } = codeKeys(choiceCodes)
  const examples = gradeExamples(project, teach, choice, opts.examplesPerCode)
  const system = gradeSystem(project, choice, toKey, examples)
  const batches: GradeClaim[][] = []
  for (let i = 0; i < targets.length; i += opts.batchSize) batches.push(targets.slice(i, i + opts.batchSize))
  const run: AiRun = {
    id: uid(), startedAt: now(), finishedAt: null, provider: 'agent', model: 'agent',
    promptHash: hash(system), codebookHash: hash(JSON.stringify(choiceCodes.map((c) => [c.name, c.definition, c.include, c.exclude]))),
    sourceIds: [opts.sourceId], codeIds: choiceCodes.map((c) => c.id), windows: batches.length, completed: 0, failed: [],
    suggestions: 0, repaired: 0, rejected: [], notes: '', codeKeys: Object.fromEntries(toId),
    options: { windowSize: opts.batchSize, contextTurns: 0, respondentOnly: true, effort: 'medium' },
    kind: 'grades', comparisonOnly: opts.mode === 'held-out',
    claims: Object.fromEntries(targets.map((c) => [c.key, [c.start, c.end] as [number, number]])),
    gradeOptions: { mode: opts.mode, reference: opts.reference, teachShare: opts.teachShare, examples: examples.length },
  }
  const windows = batches.map((b, i) => ({ id: `${opts.sourceId}:g${i}`, source: source.name, user: gradeUser(project, source, b) }))
  return { run, system, windows, targets, examples, choice }
}

/** Turns a model's grades into suggested codings on the claims' own passages. */
export function verifyGrades(project: Project, run: AiRun, raw: RawGrade[], coder: string) {
  const toId = new Map(Object.entries(run.codeKeys))
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const sourceId = run.sourceIds[0]
  const conf: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 }
  const codings: Coding[] = []
  const rejected: AiRun['rejected'] = []
  for (const g of raw) {
    const span = run.claims?.[String(g.claim_id).trim().toUpperCase()]
    if (!span) { rejected.push({ windowId: '', quote: String(g.claim_id), codeId: '', reason: 'Unknown claim id' }); continue }
    const seenGroups = new Set<string>()
    for (const key of g.code_ids ?? []) {
      const codeId = toId.get(String(key).trim().toUpperCase())
      const gid = codeId ? groupOf(codes.get(codeId), codes, groups)?.id : undefined
      if (!codeId || !gid) { rejected.push({ windowId: '', quote: String(g.claim_id), codeId: String(key), reason: 'Unknown code id' }); continue }
      if (seenGroups.has(gid)) { rejected.push({ windowId: '', quote: String(g.claim_id), codeId, reason: 'Two values in one group' }); continue }
      seenGroups.add(gid)
      if (project.codings.some((c) => c.origin?.runId === run.id && c.sourceId === sourceId && c.start === span[0] && c.end === span[1] && groupOf(codes.get(c.codeId), codes, groups)?.id === gid)) continue
      codings.push({
        id: uid(), sourceId, codeId, start: span[0], end: span[1], coder, memo: '', important: false, status: 'suggested', createdAt: now(),
        confidence: conf[g.confidence ?? ''] ?? 0.6, rationale: g.reason ?? '', origin: { runId: run.id, match: 'exact' },
      })
    }
  }
  return { codings, rejected }
}
