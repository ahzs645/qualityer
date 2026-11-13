import type { AiRun, Coding, GroupKind, Project } from './types'
import { groupOf, indexBy } from './model'

// Passage-level comparison of two codings of the same source, typically a
// person (the reference) and an AI pass. Two codings match when their spans
// overlap and they carry the same code; character-level κ lives in model.ts.

export interface Pair {
  ref: Coding | null
  other: Coding | null
}

export interface GroupComparison {
  groupId: string
  both: number
  refOnly: number
  otherOnly: number
}

export interface Confusion {
  groupId: string
  /** Code ids in codebook order, plus '' for "nothing coded here". */
  codeIds: string[]
  /** counts[refCodeId][otherCodeId] */
  counts: Map<string, Map<string, number>>
  pairs: Pair[]
  agree: number
  compared: number
}

export interface Comparison {
  byKind: Partial<Record<GroupKind, { precision: number | null; recall: number | null; ref: number; other: number }>>
  byGroup: GroupComparison[]
  confusions: Confusion[]
  refOnly: Coding[]
  otherOnly: Coding[]
}

const overlap = (a: Coding, b: Coding) => Math.min(a.end, b.end) - Math.max(a.start, b.start)

/**
 * `ref` and `other` are the two sets of codings on one source. `choiceGroupIds`
 * are groups where each passage takes a single value (evidence grade, stance):
 * those get a confusion matrix, pairing each reference coding with the other
 * coder's best-overlapping coding in the same group.
 */
export function compare(project: Project, ref: Coding[], other: Coding[], choiceGroupIds: string[]): Comparison {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const gOf = (c: Coding) => groupOf(codes.get(c.codeId), codes, groups)
  const sameCodeHit = (c: Coding, pool: Coding[]) => pool.some((o) => o.codeId === c.codeId && overlap(c, o) > 0)

  const kinds = new Map<GroupKind, { refHit: number; ref: number; otherHit: number; other: number }>()
  const perGroup = new Map<string, GroupComparison>()
  const refOnly: Coding[] = []
  const otherOnly: Coding[] = []
  const bump = (c: Coding, side: 'ref' | 'other', hit: boolean) => {
    const g = gOf(c)
    const kind = g?.kind ?? 'other'
    const k = kinds.get(kind) ?? { refHit: 0, ref: 0, otherHit: 0, other: 0 }
    k[side]++
    if (hit) k[side === 'ref' ? 'refHit' : 'otherHit']++
    kinds.set(kind, k)
    const gid = g?.id ?? ''
    const pg = perGroup.get(gid) ?? { groupId: gid, both: 0, refOnly: 0, otherOnly: 0 }
    if (hit) { if (side === 'ref') pg.both++ }
    else pg[side === 'ref' ? 'refOnly' : 'otherOnly']++
    perGroup.set(gid, pg)
  }
  for (const c of ref) { const hit = sameCodeHit(c, other); bump(c, 'ref', hit); if (!hit) refOnly.push(c) }
  for (const c of other) { const hit = sameCodeHit(c, ref); bump(c, 'other', hit); if (!hit) otherOnly.push(c) }

  const byKind: Comparison['byKind'] = {}
  for (const [kind, k] of kinds) {
    byKind[kind] = { precision: k.other ? k.otherHit / k.other : null, recall: k.ref ? k.refHit / k.ref : null, ref: k.ref, other: k.other }
  }

  const confusions: Confusion[] = choiceGroupIds.map((groupId) => {
    const inGroup = (c: Coding) => gOf(c)?.id === groupId
    const r = ref.filter(inGroup)
    const o = other.filter(inGroup)
    const used = new Set<string>()
    const pairs: Pair[] = []
    for (const a of r) {
      let best: Coding | null = null
      let bestLen = 0
      for (const b of o) { const len = overlap(a, b); if (len > bestLen) { best = b; bestLen = len } }
      if (best) used.add(best.id)
      pairs.push({ ref: a, other: best })
    }
    for (const b of o) if (!used.has(b.id) && !r.some((a) => overlap(a, b) > 0)) pairs.push({ ref: null, other: b })
    const counts = new Map<string, Map<string, number>>()
    let agree = 0, compared = 0
    for (const p of pairs) {
      const x = p.ref?.codeId ?? '', y = p.other?.codeId ?? ''
      if (!counts.has(x)) counts.set(x, new Map())
      counts.get(x)!.set(y, (counts.get(x)!.get(y) ?? 0) + 1)
      if (p.ref && p.other) { compared++; if (x === y) agree++ }
    }
    return { groupId, codeIds: [...project.codes.filter((c) => c.groupId === groupId).map((c) => c.id), ''], counts, pairs, agree, compared }
  })

  const order = new Map(project.groups.map((g, i) => [g.id, i]))
  return {
    byKind, confusions, refOnly, otherOnly,
    byGroup: [...perGroup.values()].sort((a, b) => (order.get(a.groupId) ?? 99) - (order.get(b.groupId) ?? 99)),
  }
}

/**
 * A person's coding of a source made before an AI pass ran: the only fair
 * standard for that pass. Codes a reviewer adds while reviewing the pass are
 * not independent of it.
 */
export function humanBaseline(project: Project, sourceId: string, run: AiRun) {
  return project.codings.filter((c) => c.sourceId === sourceId && !c.origin && c.status === 'accepted' && c.createdAt < run.startedAt)
}

/** Passes that can be compared with a person's earlier coding of the same source. */
export function comparablePasses(project: Project) {
  const codes = new Map(project.codes.map((c) => [c.id, c]))
  const groups = new Map(project.groups.map((g) => [g.id, g]))
  const kind = (codeId: string) => {
    let c = codes.get(codeId)
    while (c && !c.groupId && c.parentId) c = codes.get(c.parentId)
    return c?.groupId ? groups.get(c.groupId)?.kind : undefined
  }
  return project.aiRuns.flatMap((r) => r.sourceIds.map((sid) => ({ run: r, sourceId: sid })))
    .filter(({ run, sourceId }) => humanBaseline(project, sourceId, run).some((c) => run.kind === 'grades' || kind(c.codeId) === 'substantive')
      && project.codings.some((c) => c.origin?.runId === run.id && c.sourceId === sourceId))
}
