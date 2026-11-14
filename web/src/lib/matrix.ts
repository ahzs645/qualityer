import type { Project } from './types'
import { buildClaims, type Claim } from './claims'
import { orderedCodes } from './model'
import { peopleOf, type Person } from './positions'

// Codes (or code groups) by participants: who raised what. Modelled on
// MAXQDA's Code Matrix Browser and NVivo's matrix coding / crosstab queries,
// but the first question it answers is "how many people", because with a
// handful of interviews passage counts mostly measure how long someone talked.

export type MatrixLevel = 'group' | 'code'

export interface MatrixRow {
  id: string
  name: string
  color: string
  depth: number
  /** The code and every code under it (a group row covers the group's codes). */
  codeIds: string[]
}

export interface MatrixCell {
  claims: Claim[]
  /** This row's claims as a share of all the person's coded claims, so a talkative person does not dominate. */
  share: number
}

export interface Matrix {
  rows: MatrixRow[]
  people: Person[]
  cells: Map<string, MatrixCell>
  /** Each person's coded claims (at least one accepted coding in the rows' groups). */
  totals: Map<string, number>
  /** People who raised each row. */
  reach: Map<string, number>
}

export const mkey = (rowId: string, personId: string) => `${rowId}|${personId}`

export function buildMatrix(project: Project, level: MatrixLevel, groupId = ''): Matrix {
  const kinds = new Map(project.groups.map((g) => [g.id, g.kind]))
  // By default the substantive codes; evidence and stance sit on every claim and would fill every cell.
  const inScope = (gid: string | null) => (groupId ? gid === groupId : kinds.get(gid ?? '') === 'substantive')
  let rows: MatrixRow[]
  if (level === 'group') {
    rows = project.groups.filter((g) => inScope(g.id)).map((g) => ({ id: g.id, name: g.name, color: g.color, depth: 0, codeIds: project.codes.filter((c) => c.groupId === g.id).map((c) => c.id) }))
  } else {
    const ordered = orderedCodes(project).filter(({ code }) => inScope(code.groupId))
    const kids = new Map<string, string[]>()
    for (const { code } of ordered) if (code.parentId) kids.set(code.parentId, [...(kids.get(code.parentId) ?? []), code.id])
    const under = (id: string): string[] => [id, ...(kids.get(id) ?? []).flatMap(under)]
    rows = ordered.map(({ code, depth }) => ({ id: code.id, name: code.name, color: code.color, depth, codeIds: under(code.id) }))
  }
  const scope = new Set(rows.flatMap((r) => r.codeIds))
  const claims = buildClaims(project).flatMap((c) => {
    const accepted = c.codings.filter((x) => x.status === 'accepted')
    return accepted.length ? [{ ...c, codings: accepted }] : []
  })
  const people = peopleOf(project)
  const cells = new Map<string, MatrixCell>()
  const totals = new Map<string, number>()
  const reach = new Map<string, number>()
  for (const person of people) {
    const mine = claims.filter((c) => person.sourceIds.includes(c.sourceId) && c.codings.some((x) => scope.has(x.codeId)))
    totals.set(person.id, mine.length)
    for (const row of rows) {
      const ids = new Set(row.codeIds)
      const hit = mine.filter((c) => c.codings.some((x) => ids.has(x.codeId)))
      cells.set(mkey(row.id, person.id), { claims: hit, share: mine.length ? hit.length / mine.length : 0 })
      if (hit.length) reach.set(row.id, (reach.get(row.id) ?? 0) + 1)
    }
  }
  return { rows, people, cells, totals, reach }
}

/**
 * Orders rows so that codes raised by the same people sit together: rows are
 * sorted by how many people raised them, then by the pattern of who did
 * (read as a binary number in participant order), then by codebook order.
 */
export function patternOrder(m: Matrix): MatrixRow[] {
  const pattern = (r: MatrixRow) => m.people.reduce((n, p, i) => n + ((m.cells.get(mkey(r.id, p.id))?.claims.length ?? 0) > 0 ? 2 ** (m.people.length - 1 - i) : 0), 0)
  const at = new Map(m.rows.map((r, i) => [r.id, i]))
  return [...m.rows].sort((a, b) => (m.reach.get(b.id) ?? 0) - (m.reach.get(a.id) ?? 0) || pattern(b) - pattern(a) || at.get(a.id)! - at.get(b.id)!)
}
