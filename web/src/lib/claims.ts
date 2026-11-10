import type { Code, CodeGroup, Coding, Project, ReviewEvent } from './types'
import { comparisonRuns, groupOf, indexBy, restrictionAt } from './model'

// A claim is everything coded on one exact passage: usually a substantive code
// plus an evidence grade and a stance. Reviewing AI work claim by claim keeps
// those together, which is how the codebook rules read them.

/**
 * - pending: at least one suggestion on the passage still needs a decision
 * - unchecked: AI codings were accepted, but not by the person now reviewing
 * - checked: the current reviewer has confirmed every AI coding on it
 * - human: coded by people only
 */
export type ClaimState = 'pending' | 'unchecked' | 'checked' | 'human'

export interface Claim {
  key: string
  sourceId: string
  start: number
  end: number
  codings: Coding[]
  state: ClaimState
  ai: boolean
  /** Lowest model confidence among the AI codings, when given. */
  confidence: number | null
  /** Rule problems the passage would have if everything on it were accepted. */
  issues: string[]
  restricted: boolean
}

export const claimKey = (sourceId: string, start: number, end: number) => `${sourceId}:${start}:${end}`

export const CLAIM_STATE_LABEL: Record<ClaimState, string> = {
  pending: 'Needs a decision',
  unchecked: 'Accepted, not checked by you',
  checked: 'Checked by you',
  human: 'Coded by a person',
}

function lookups(project: Project) {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  return { codes, groups, groupIdOf: (codeId: string) => groupOf(codes.get(codeId), codes, groups)?.id }
}

/** Rule problems for one passage, counting suggestions as if they were accepted. */
export function claimIssues(project: Project, codings: Coding[], groupIdOf = lookups(project).groupIdOf): string[] {
  const groups = indexBy(project.groups)
  const out: string[] = []
  const extracted = new Set(project.extractions.map((e) => e.codingId))
  const codes = indexBy(project.codes)
  for (const rule of project.rules) {
    if (!rule.enabled) continue
    const trig = new Set(rule.triggerGroupIds)
    if (rule.kind === 'requires-extraction') {
      for (const c of codings) {
        if (trig.has(groupIdOf(c.codeId) ?? '') && !extracted.has(c.id)) out.push(`${codes.get(c.codeId)?.name.trim().split(/\s{2,}/)[0] ?? 'Flag'} needs an extraction row`)
      }
      continue
    }
    if (!rule.targetGroupId || !codings.some((c) => trig.has(groupIdOf(c.codeId) ?? ''))) continue
    const n = new Set(codings.filter((c) => groupIdOf(c.codeId) === rule.targetGroupId).map((c) => c.codeId)).size
    const name = groups.get(rule.targetGroupId)?.name ?? 'target'
    if (rule.kind === 'exactly-one' ? n !== 1 : n > 1) out.push(n === 0 ? `Missing ${name}` : `${n} ${name} codes`)
  }
  return out
}

function stateOf(codings: Coding[], reviewer: string): ClaimState {
  if (codings.some((c) => c.status === 'suggested')) return 'pending'
  const ai = codings.filter((c) => c.origin)
  if (!ai.length) return 'human'
  return ai.every((c) => c.reviewedBy === reviewer) ? 'checked' : 'unchecked'
}

/**
 * Groups codings into claims, in transcript order. Unreviewed suggestions from
 * comparison-only passes are left out unless `includeComparison` is set.
 */
export function buildClaims(project: Project, opts: { sourceId?: string; includeComparison?: boolean } = {}): Claim[] {
  const skip = opts.includeComparison ? new Set<string>() : comparisonRuns(project)
  const { groupIdOf } = lookups(project)
  const bySpan = new Map<string, Coding[]>()
  for (const c of project.codings) {
    if (opts.sourceId && c.sourceId !== opts.sourceId) continue
    if (c.status === 'suggested' && c.origin && skip.has(c.origin.runId)) continue
    const k = claimKey(c.sourceId, c.start, c.end)
    const list = bySpan.get(k)
    if (list) list.push(c)
    else bySpan.set(k, [c])
  }
  const order = new Map(project.sources.map((s, i) => [s.id, i]))
  const out: Claim[] = []
  for (const [key, codings] of bySpan) {
    const first = codings[0]
    const conf = codings.filter((c) => c.origin && c.confidence != null).map((c) => c.confidence!)
    out.push({
      key, sourceId: first.sourceId, start: first.start, end: first.end, codings,
      state: stateOf(codings, project.coder),
      ai: codings.some((c) => c.origin),
      confidence: conf.length ? Math.min(...conf) : null,
      issues: claimIssues(project, codings, groupIdOf),
      restricted: !!restrictionAt(project, first.sourceId, first.start, first.end),
    })
  }
  return out.sort((a, b) => (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0) || a.start - b.start || a.end - b.end)
}

/** Groups in which a passage carries a single choice (targets of exactly-one / at-most-one rules), in codebook order. */
export function choiceGroups(project: Project): { group: CodeGroup; codes: Code[]; required: boolean }[] {
  const targets = new Map<string, boolean>()
  for (const r of project.rules) {
    if (!r.enabled || !r.targetGroupId || r.kind === 'requires-extraction') continue
    targets.set(r.targetGroupId, (targets.get(r.targetGroupId) ?? false) || r.kind === 'exactly-one')
  }
  return project.groups.filter((g) => targets.has(g.id)).map((group) => ({
    group, required: targets.get(group.id)!, codes: project.codes.filter((c) => c.groupId === group.id),
  }))
}

/** Short label for a code: its number ("03.2.4", "E2") when the name starts with one. */
export function codeKey(name: string) {
  const m = /^\s*([A-Z]{0,3}\.?\d+(?:\.\d+)*|[A-Z]\d+)\s{1,}/.exec(name)
  return m ? m[1] : name.trim().slice(0, 14)
}

const WORD = /\S/
/** Moves one edge of a passage by a word, staying inside `[lo, hi]`. */
export function stepEdge(text: string, pos: number, edge: 'start' | 'end', dir: -1 | 1, lo: number, hi: number) {
  let p = pos
  if (edge === 'start') {
    if (dir < 0) { while (p > lo && !WORD.test(text[p - 1])) p--; while (p > lo && WORD.test(text[p - 1])) p-- }
    else { while (p < hi && WORD.test(text[p])) p++; while (p < hi && !WORD.test(text[p])) p++ }
  } else if (dir > 0) { while (p < hi && !WORD.test(text[p])) p++; while (p < hi && WORD.test(text[p])) p++ }
  else { while (p > lo && WORD.test(text[p - 1])) p--; while (p > lo && !WORD.test(text[p - 1])) p-- }
  return p
}

export function confidenceBand(v: number | null | undefined): 'high' | 'medium' | 'low' | null {
  if (v == null) return null
  return v >= 0.9 ? 'high' : v >= 0.6 ? 'medium' : 'low'
}

// ---------------------------------------------------------------------------
// What the reviewer did with the AI's work

export interface DecisionSummary {
  total: number
  kept: number
  recoded: number
  rejected: number
  added: number
  byBand: Record<'high' | 'medium' | 'low' | 'none', { kept: number; recoded: number; rejected: number }>
  /** Recodes within one group: "from → to" counts. */
  changes: { fromId: string; toId: string; n: number }[]
}

/** The last decision recorded for each AI coding, so a claim revisited twice counts once. */
export function finalDecisions(log: ReviewEvent[], sourceId?: string) {
  const last = new Map<string, ReviewEvent>()
  const original = new Map<string, string | null>()
  for (const e of log) {
    if (!e.ai || !e.codingId || (sourceId && e.sourceId !== sourceId)) continue
    if (!['accept', 'confirm', 'recode', 'reject'].includes(e.action)) continue
    if (!original.has(e.codingId)) original.set(e.codingId, e.codeId)
    last.set(e.codingId, e)
  }
  // A coding recoded and later confirmed stays a recode, measured from the code the AI first proposed.
  return [...last].map(([id, e]) => {
    const first = original.get(id) ?? e.codeId
    const final = e.action === 'recode' ? e.toCodeId ?? null : e.action === 'reject' ? null : e.codeId
    const outcome: 'kept' | 'recoded' | 'rejected' = e.action === 'reject' ? 'rejected' : final !== first ? 'recoded' : 'kept'
    return { codingId: id, event: e, suggestedCodeId: first, finalCodeId: final, outcome }
  })
}

export function summariseDecisions(project: Project, sourceId?: string): DecisionSummary {
  const finals = finalDecisions(project.reviewLog, sourceId)
  const band = () => ({ kept: 0, recoded: 0, rejected: 0 })
  const out: DecisionSummary = {
    total: finals.length, kept: 0, recoded: 0, rejected: 0,
    added: project.reviewLog.filter((e) => e.action === 'add' && (!sourceId || e.sourceId === sourceId)).length,
    byBand: { high: band(), medium: band(), low: band(), none: band() }, changes: [],
  }
  const changes = new Map<string, number>()
  for (const f of finals) {
    out[f.outcome]++
    out.byBand[confidenceBand(f.event.confidence) ?? 'none'][f.outcome]++
    if (f.outcome === 'recoded' && f.suggestedCodeId && f.finalCodeId) {
      const k = `${f.suggestedCodeId}|${f.finalCodeId}`
      changes.set(k, (changes.get(k) ?? 0) + 1)
    }
  }
  out.changes = [...changes].map(([k, n]) => { const [fromId, toId] = k.split('|'); return { fromId, toId, n } }).sort((a, b) => b.n - a.n)
  return out
}
