import type { Code, Coding, Project, Source } from './types'
import { emptyProject } from './model'

/** Fills fields added after a project was saved, so older saves keep opening. */
export function migrate(input: Partial<Project> & { id: string }): Project {
  const p = { ...emptyProject(input.name), ...input } as Project
  p.sources = (p.sources ?? []).map((s: Partial<Source>) => ({
    attributes: {}, speakers: [], segments: null, media: null, status: 'new', readTo: 0, importedFrom: '', ...s,
  }) as Source)
  p.codings = (p.codings ?? []).map((c: Partial<Coding>) => ({
    memo: '', important: false, status: 'accepted', coder: p.coder, ...c,
  }) as Coding)
  p.codes = (p.codes ?? []).map((c: Partial<Code>) => ({
    definition: '', include: '', exclude: '', anchor: '', parentId: null, groupId: null, ...c,
  }) as Code)
  p.names = p.names ?? []
  p.notNames = p.notNames ?? []
  p.anonymise = p.anonymise ?? false
  p.asks = p.asks ?? []
  p.askAnswers = p.askAnswers ?? []
  return p
}
