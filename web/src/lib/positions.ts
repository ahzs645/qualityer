import type { Code, Project } from './types'
import { buildClaims, type Claim } from './claims'

// Where each participant stands on each theme, and what kind of evidence they
// gave. The unit is the participant: a person raised a theme or did not.
// Passage counts are kept for tooltips only, because how many passages a
// person has on a theme says more about how long they talked than how many
// people hold a view. Claims still awaiting a decision are left out.

export type Verdict = 'agreement' | 'partial' | 'dissonance' | 'single' | 'descriptive' | 'silence'

export const VERDICT_LABEL: Record<Verdict, string> = {
  agreement: 'Agreement',
  partial: 'Partial agreement',
  dissonance: 'Dissonance',
  single: 'One voice',
  descriptive: 'Described, no position',
  silence: 'Silence',
}

export const VERDICT_HELP: Record<Verdict, string> = {
  agreement: 'Everyone who took a position leaned the same way.',
  partial: 'Some leaned one way; others only described.',
  dissonance: 'Some leaned supportive and some sceptical or opposed.',
  single: 'Only one person took a position, so there is nothing to compare.',
  descriptive: 'People described this theme without taking a position.',
  silence: 'Nobody raised this theme in a checked or accepted claim.',
}

export interface Person { id: string; label: string; sourceIds: string[] }

export interface PersonOnTheme {
  person: Person
  claims: Claim[]
  /** Stance of each claim that has one, as an index into the stance codes (0 = most supportive). */
  stances: number[]
  median: number | null
  min: number | null
  max: number | null
  /** Evidence grade of each claim, as an index into the evidence codes (0 = strongest), -1 when ungraded. */
  grades: number[]
  /** Claims drafted by AI and accepted but not yet checked by the current reviewer. */
  unchecked: number
  /** 'not-asked' when every guide question linked to the theme was marked not asked for this person. */
  absent: 'not-raised' | 'not-asked' | null
}

export interface ThemeRow {
  id: string
  title: string
  codeIds: string[]
  people: PersonOnTheme[]
  raised: number
  verdict: Verdict
  /** People with at least one claim graded with one of the two strongest evidence grades. */
  strong: number
}

export interface Positions {
  people: Person[]
  rows: ThemeRow[]
  stanceCodes: Code[]
  evidenceCodes: Code[]
  /** Whether any guide question is linked to codes, so "not asked" can be told apart from "not raised". */
  guideLinked: boolean
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** People are cases when the study has them, otherwise sources. */
export function peopleOf(project: Project): Person[] {
  if (project.cases.length) return project.cases.map((k) => ({ id: k.id, label: k.name, sourceIds: k.sourceIds }))
  return project.sources.map((s) => ({ id: s.id, label: s.name.split(' — ')[0], sourceIds: [s.id] }))
}

/**
 * Farmer et al.'s convergence categories, suggested from stance. The middle of
 * the scale counts as describing rather than taking a side; S1–S2 lean
 * supportive and S4–S5 lean sceptical. A person's position is their median.
 */
export function verdictOf(medians: (number | null)[], scale: number): Verdict {
  const raised = medians.filter((m): m is number => m !== null)
  if (!raised.length) return 'silence'
  const mid = (scale - 1) / 2
  const sides = raised.map((m) => (m < mid ? -1 : m > mid ? 1 : 0))
  const taking = sides.filter((s) => s !== 0)
  if (!taking.length) return 'descriptive'
  if (taking.length === 1) return 'single'
  if (taking.includes(-1) && taking.includes(1)) return 'dissonance'
  return taking.length === raised.length ? 'agreement' : 'partial'
}

export function buildPositions(project: Project): Positions {
  const stanceGroup = project.groups.find((g) => g.kind === 'stance')
  const evidenceGroup = project.groups.find((g) => g.kind === 'evidence')
  const stanceCodes = stanceGroup ? project.codes.filter((c) => c.groupId === stanceGroup.id) : []
  const evidenceCodes = evidenceGroup ? project.codes.filter((c) => c.groupId === evidenceGroup.id) : []
  const stanceAt = new Map(stanceCodes.map((c, i) => [c.id, i]))
  const gradeAt = new Map(evidenceCodes.map((c, i) => [c.id, i]))

  // Accepted codings only; a claim with nothing accepted is still pending and left out.
  const claims = buildClaims(project).flatMap((c) => {
    const accepted = c.codings.filter((x) => x.status === 'accepted')
    return accepted.length ? [{ ...c, codings: accepted }] : []
  })
  const bySource = new Map<string, Claim[]>()
  for (const c of claims) bySource.set(c.sourceId, [...(bySource.get(c.sourceId) ?? []), c])

  const themes = project.themes.length
    ? project.themes.map((t) => ({ id: t.id, title: t.title, codeIds: t.codeIds }))
    : project.groups.filter((g) => g.kind === 'substantive').map((g) => ({ id: g.id, title: g.name, codeIds: project.codes.filter((c) => c.groupId === g.id).map((c) => c.id) }))

  const guideLinked = project.guide.some((q) => q.codeIds.length)
  const people = peopleOf(project)

  const rows = themes.map((t) => {
    const inTheme = new Set(t.codeIds)
    const questions = project.guide.filter((q) => q.codeIds.some((id) => inTheme.has(id))).map((q) => q.id)
    const onTheme: PersonOnTheme[] = people.map((person) => {
      const mine = person.sourceIds.flatMap((id) => bySource.get(id) ?? []).filter((c) => c.codings.some((x) => inTheme.has(x.codeId)))
      const stances = mine.flatMap((c) => c.codings.filter((x) => stanceAt.has(x.codeId)).map((x) => stanceAt.get(x.codeId)!))
      const grades = mine.map((c) => {
        const g = c.codings.map((x) => gradeAt.get(x.codeId)).filter((i): i is number => i !== undefined)
        return g.length ? Math.min(...g) : -1
      })
      let absent: PersonOnTheme['absent'] = null
      if (!mine.length) {
        const marks = project.coverage.filter((m) => person.sourceIds.includes(m.sourceId) && questions.includes(m.questionId))
        absent = marks.length && marks.every((m) => m.status === 'not-asked') ? 'not-asked' : 'not-raised'
      }
      return {
        person, claims: mine, stances,
        median: median(stances), min: stances.length ? Math.min(...stances) : null, max: stances.length ? Math.max(...stances) : null,
        grades, unchecked: mine.filter((c) => c.state === 'unchecked').length, absent,
      }
    })
    const strongCut = Math.min(2, evidenceCodes.length)
    return {
      ...t, people: onTheme,
      raised: onTheme.filter((p) => p.claims.length).length,
      verdict: verdictOf(onTheme.map((p) => (p.claims.length ? p.median ?? (stanceCodes.length - 1) / 2 : null)), stanceCodes.length || 5),
      strong: onTheme.filter((p) => p.grades.some((g) => g >= 0 && g < strongCut)).length,
    }
  })
  return { people, rows, stanceCodes, evidenceCodes, guideLinked }
}
