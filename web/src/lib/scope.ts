import type { Project } from './types'
import { peopleOf, type Person } from './positions'

// Who an export covers: every interview together, or one participant. A
// one-participant export is the study narrowed to that person's interviews, so
// every report, chart and table built from a project works on it unchanged.

export type Scope = { kind: 'all' } | { kind: 'person'; personId: string }

export const ALL: Scope = { kind: 'all' }

export const personOf = (project: Project, scope: Scope): Person | null =>
  scope.kind === 'person' ? peopleOf(project).find((p) => p.id === scope.personId) ?? null : null

/**
 * The study narrowed to one participant's interviews. Cross-interview writing
 * (theme interpretations, memos not tied to their interview) is left out: it
 * describes the other participants too, and a one-participant export may be
 * shared with that participant for checking.
 */
export function scopeProject(project: Project, scope: Scope): Project {
  const person = personOf(project, scope)
  if (!person) return project
  const ids = new Set(person.sourceIds)
  const keep = <T extends { sourceId: string }>(xs: T[]) => xs.filter((x) => ids.has(x.sourceId))
  const codings = keep(project.codings)
  const codingIds = new Set(codings.map((c) => c.id))
  const cases = project.cases
    .filter((k) => k.sourceIds.some((id) => ids.has(id)))
    .map((k) => ({ ...k, sourceIds: k.sourceIds.filter((id) => ids.has(id)) }))
  const caseIds = new Set(cases.map((k) => k.id))
  return {
    ...project,
    name: `${project.name} — ${person.label}`,
    sources: project.sources.filter((s) => ids.has(s.id)),
    codings,
    coverage: keep(project.coverage),
    memos: project.memos.filter((m) => m.sourceId != null && ids.has(m.sourceId)),
    cases,
    themes: project.themes.map((t) => ({ ...t, interpretation: '' })),
    cells: project.cells.filter((c) => caseIds.has(c.caseId)),
    extractions: project.extractions.filter((e) => codingIds.has(e.codingId)),
    candidates: project.candidates.filter((c) => c.sourceId == null || ids.has(c.sourceId)),
    aiRuns: project.aiRuns
      .filter((r) => r.sourceIds.some((id) => ids.has(id)))
      .map((r) => ({ ...r, sourceIds: r.sourceIds.filter((id) => ids.has(id)) })),
    reviewLog: keep(project.reviewLog),
    restricted: keep(project.restricted),
    wordingChecks: keep(project.wordingChecks),
    askAnswers: keep(project.askAnswers),
  }
}

/** A short, file-safe label for a scope: "all-interviews" or the participant's label. */
export function scopeSlug(project: Project, scope: Scope) {
  const p = personOf(project, scope)
  return p ? p.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'participant' : 'all-interviews'
}

/** The key a scope's hand edits are kept under: "all", or "person:<id>". */
export const scopeKey = (scope: Scope) => (scope.kind === 'person' ? `person:${scope.personId}` : 'all')
