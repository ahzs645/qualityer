import type { Code, CodeGroup, Project } from './types'
import { buildClaims, type Claim } from './claims'
import { groupOf, indexBy } from './model'

// How each case talks about each domain: how many claims, how they were graded
// and what stance they took. Counts describe the coding, not prevalence.

export interface MixPart { code: Code; n: number }
export interface ProfileCell {
  caseId: string
  groupId: string
  claims: Claim[]
  /** One entry per choice group (evidence grade, stance), in codebook order. */
  mixes: { group: CodeGroup; parts: MixPart[]; total: number }[]
  /** Share of the cell's claims that came from an AI pass and have not been checked by the current reviewer. */
  unchecked: number
}

export interface Profile {
  rows: CodeGroup[]
  choice: CodeGroup[]
  cells: Map<string, ProfileCell>
  totals: Map<string, ProfileCell>
}

export const cellKey = (caseId: string, groupId: string) => `${caseId}|${groupId}`

export function buildProfile(project: Project): Profile {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const gOf = (codeId: string) => groupOf(codes.get(codeId), codes, groups)
  const rows = project.groups.filter((g) => g.kind === 'substantive')
  const choice = project.groups.filter((g) => g.kind === 'evidence' || g.kind === 'stance')
  const bySource = new Map<string, Claim[]>()
  for (const c of buildClaims(project)) {
    const accepted = c.codings.filter((x) => x.status === 'accepted')
    if (!accepted.length) continue
    const claim = { ...c, codings: accepted }
    if (!bySource.has(c.sourceId)) bySource.set(c.sourceId, [])
    bySource.get(c.sourceId)!.push(claim)
  }
  const make = (caseId: string, groupId: string, claims: Claim[]): ProfileCell => ({
    caseId, groupId, claims,
    mixes: choice.map((group) => {
      const parts = project.codes.filter((c) => c.groupId === group.id).map((code) => ({ code, n: claims.filter((cl) => cl.codings.some((x) => x.codeId === code.id)).length }))
      return { group, parts, total: parts.reduce((n, p) => n + p.n, 0) }
    }),
    unchecked: claims.length ? claims.filter((c) => c.state === 'unchecked').length / claims.length : 0,
  })
  const cells = new Map<string, ProfileCell>()
  const totals = new Map<string, ProfileCell>()
  for (const k of project.cases) {
    const claims = k.sourceIds.flatMap((id) => bySource.get(id) ?? [])
    const substantive = claims.filter((cl) => cl.codings.some((x) => gOf(x.codeId)?.kind === 'substantive'))
    totals.set(k.id, make(k.id, '', substantive))
    for (const g of rows) cells.set(cellKey(k.id, g.id), make(k.id, g.id, claims.filter((cl) => cl.codings.some((x) => gOf(x.codeId)?.id === g.id))))
  }
  return { rows, choice, cells, totals }
}
