import type { Candidate, Code, CodeGroup, Coding, CoverageStatus, Memo, Project, Source } from './types'
import { PALETTE, editSource, findCorrections, now, uid } from './model'
import { snapshot, store, update } from './store'

const patch = <T extends { id: string }>(items: T[], id: string, change: Partial<T>) =>
  items.map((i) => (i.id === id ? { ...i, ...change } : i))

// Codings ------------------------------------------------------------------

export function applyCodes(sourceId: string, start: number, end: number, codeIds: string[]) {
  update(codeIds.length > 1 ? `apply ${codeIds.length} codes` : 'apply code', (p) => {
    const existing = new Set(
      p.codings.filter((c) => c.sourceId === sourceId && c.start === start && c.end === end && c.coder === p.coder && c.status === 'accepted').map((c) => c.codeId),
    )
    const add: Coding[] = codeIds.filter((id) => !existing.has(id)).map((codeId) => ({
      id: uid(), sourceId, codeId, start, end, coder: p.coder, memo: '', important: false, status: 'accepted', createdAt: now(),
    }))
    if (!add.length) return p
    const sources = p.sources.map((s) => (s.id === sourceId && (s.status === 'new' || s.status === 'reading') ? { ...s, status: 'coding' as const } : s))
    return { ...p, sources, codings: [...p.codings, ...add] }
  })
}

/** Toggles a code on an exact span for the current coder. */
export function toggleCode(sourceId: string, start: number, end: number, codeId: string) {
  const p = store.state.project
  const hit = p?.codings.find((c) => c.sourceId === sourceId && c.start === start && c.end === end && c.codeId === codeId && c.coder === p.coder && c.status === 'accepted')
  if (hit) removeCoding(hit.id)
  else applyCodes(sourceId, start, end, [codeId])
}

export function removeCoding(id: string) {
  update('remove coding', (p) => ({
    ...p,
    codings: p.codings.filter((c) => c.id !== id),
    extractions: p.extractions.filter((e) => e.codingId !== id),
  }))
}

export function updateCoding(id: string, change: Partial<Coding>, label = 'edit coding') {
  update(label, (p) => ({ ...p, codings: patch(p.codings, id, change) }))
}

/** Moves every coding on a span to a new span (e.g. snapping to a sentence). */
export function resizeSpan(sourceId: string, from: { start: number; end: number }, to: { start: number; end: number }) {
  update('resize span', (p) => ({
    ...p,
    codings: p.codings.map((c) => (c.sourceId === sourceId && c.start === from.start && c.end === from.end ? { ...c, ...to } : c)),
  }))
}

/** Marks every coding on a span as checked against the recording (or clears it). */
export function setSpanVerified(sourceId: string, span: { start: number; end: number }, verified: boolean) {
  const at = verified ? now() : null
  update(verified ? 'mark verified against audio' : 'clear audio verification', (p) => ({
    ...p,
    codings: p.codings.map((c) => (c.sourceId === sourceId && c.start === span.start && c.end === span.end ? { ...c, verifiedAt: at } : c)),
  }))
}

const accepted = (c: Coding, reviewer: string): Coding =>
  c.origin ? { ...c, status: 'accepted', reviewedBy: reviewer } : { ...c, status: 'accepted', coder: reviewer, reviewedBy: reviewer }

export function acceptSuggestion(id: string) {
  update('accept suggestion', (p) => ({ ...p, codings: p.codings.map((c) => (c.id === id ? accepted(c, p.coder) : c)) }))
}

export function acceptSuggestions(ids: string[]) {
  const set = new Set(ids)
  update(`accept ${ids.length} suggestions`, (p) => ({
    ...p, codings: p.codings.map((c) => (set.has(c.id) ? accepted(c, p.coder) : c)),
  }))
}

/** Accepts a suggestion under a different code (the reviewer's correction). */
export function acceptAsCode(id: string, codeId: string) {
  update('accept with a different code', (p) => ({
    ...p, codings: p.codings.map((c) => (c.id === id ? { ...accepted(c, p.coder), codeId, memo: [c.memo, `Code changed in review from the suggested one.`].filter(Boolean).join('\n') } : c)),
  }))
}

export function rejectSuggestions(ids: string[]) {
  const set = new Set(ids)
  update(`reject ${ids.length} suggestions`, (p) => ({ ...p, codings: p.codings.filter((c) => !set.has(c.id)) }))
}

// Sources --------------------------------------------------------------------

export function addSources(sources: Source[]) {
  update(sources.length > 1 ? `add ${sources.length} sources` : 'add source', (p) => ({
    ...p,
    sources: [...p.sources, ...sources],
    cases: [...p.cases, ...sources.map((s) => ({ id: uid(), name: s.name, sourceIds: [s.id], attributes: { ...s.attributes } }))],
  }))
}

export function updateSource(id: string, change: Partial<Source>, label = 'edit source') {
  update(label, (p) => ({ ...p, sources: patch(p.sources, id, change) }))
}

export function removeSource(id: string) {
  update('remove source', (p) => {
    const gone = new Set(p.codings.filter((c) => c.sourceId === id).map((c) => c.id))
    return {
      ...p,
      sources: p.sources.filter((s) => s.id !== id),
      codings: p.codings.filter((c) => c.sourceId !== id),
      extractions: p.extractions.filter((e) => !gone.has(e.codingId)),
      coverage: p.coverage.filter((c) => c.sourceId !== id),
      memos: p.memos.map((m) => (m.sourceId === id ? { ...m, sourceId: null, start: null, end: null } : m)),
      cases: p.cases.map((c) => ({ ...c, sourceIds: c.sourceIds.filter((s) => s !== id) })),
    }
  })
}

export function markReadTo(sourceId: string, offset: number) {
  update('mark read', (p) => ({
    ...p,
    sources: p.sources.map((s) => (s.id !== sourceId ? s : { ...s, readTo: offset, status: s.status === 'new' ? 'reading' : s.status })),
  }))
}

/** Applies glossary corrections to the given sources, moving all anchors. Snapshots first. */
export async function applyGlossary(sourceIds: string[]) {
  const p = store.state.project
  if (!p) return 0
  const total = sourceIds.reduce((n, id) => n + findCorrections(p.sources.find((s) => s.id === id)?.text ?? '', p.glossary).length, 0)
  if (!total) return 0
  await snapshot(`Before applying ${total} transcript corrections`)
  update(`apply ${total} corrections`, (proj) =>
    sourceIds.reduce((acc, id) => {
      const s = acc.sources.find((x) => x.id === id)
      return s ? editSource(acc, id, findCorrections(s.text, acc.glossary)) : acc
    }, proj),
  )
  return total
}

/** Edits a single passage of transcript text, keeping anchors. */
export function editPassage(sourceId: string, start: number, end: number, text: string) {
  update('edit transcript', (p) => editSource(p, sourceId, [{ start, end, text }]))
}

// Codebook -------------------------------------------------------------------

export function addCode(partial: Partial<Code> & { name: string }): string {
  const id = uid()
  update('add code', (p) => {
    const group = p.groups.find((g) => g.id === partial.groupId)
    return {
      ...p,
      codes: [...p.codes, {
        id, groupId: partial.groupId ?? p.groups[0]?.id ?? null, parentId: null,
        color: group?.color ?? PALETTE[p.codes.length % PALETTE.length],
        definition: '', include: '', exclude: '', anchor: '', ...partial,
      }],
    }
  })
  return id
}

export function updateCode(id: string, change: Partial<Code>) {
  update('edit code', (p) => ({ ...p, codes: patch(p.codes, id, change) }))
}

export function removeCode(id: string) {
  update('delete code', (p) => {
    const gone = new Set(p.codings.filter((c) => c.codeId === id).map((c) => c.id))
    return {
      ...p,
      codes: p.codes.filter((c) => c.id !== id).map((c) => (c.parentId === id ? { ...c, parentId: null } : c)),
      codings: p.codings.filter((c) => c.codeId !== id),
      extractions: p.extractions.filter((e) => !gone.has(e.codingId)),
      themes: p.themes.map((t) => ({ ...t, codeIds: t.codeIds.filter((c) => c !== id) })),
      guide: p.guide.map((q) => ({ ...q, codeIds: q.codeIds.filter((c) => c !== id) })),
    }
  })
}

/** Moves every coding of `fromId` onto `intoId`, then deletes `fromId`. */
export async function mergeCode(fromId: string, intoId: string) {
  await snapshot('Before merging codes')
  update('merge codes', (p) => ({
    ...p,
    codings: p.codings.map((c) => (c.codeId === fromId ? { ...c, codeId: intoId } : c)),
    codes: p.codes.filter((c) => c.id !== fromId).map((c) => (c.parentId === fromId ? { ...c, parentId: intoId } : c)),
    themes: p.themes.map((t) => ({ ...t, codeIds: [...new Set(t.codeIds.map((c) => (c === fromId ? intoId : c)))] })),
    guide: p.guide.map((q) => ({ ...q, codeIds: [...new Set(q.codeIds.map((c) => (c === fromId ? intoId : c)))] })),
  }))
}

export function addGroup(name: string, kind: CodeGroup['kind']) {
  update('add group', (p) => ({ ...p, groups: [...p.groups, { id: uid(), name, kind, color: PALETTE[p.groups.length % PALETTE.length] }] }))
}

export function updateGroup(id: string, change: Partial<CodeGroup>) {
  update('edit group', (p) => ({ ...p, groups: patch(p.groups, id, change) }))
}

export function removeGroup(id: string) {
  update('delete group', (p) => ({
    ...p,
    groups: p.groups.filter((g) => g.id !== id),
    codes: p.codes.map((c) => (c.groupId === id ? { ...c, groupId: null } : c)),
    rules: p.rules
      .map((r) => ({ ...r, triggerGroupIds: r.triggerGroupIds.filter((g) => g !== id), targetGroupId: r.targetGroupId === id ? null : r.targetGroupId }))
      .filter((r) => r.triggerGroupIds.length),
  }))
}

// Guide coverage ----------------------------------------------------------------

export function setCoverage(sourceId: string, questionId: string, change: { status?: CoverageStatus; note?: string; start?: number | null; end?: number | null }) {
  update('mark guide coverage', (p) => {
    const cur = p.coverage.find((c) => c.sourceId === sourceId && c.questionId === questionId)
    const next = { sourceId, questionId, status: 'unmarked' as CoverageStatus, note: '', start: null, end: null, ...cur, ...change }
    return {
      ...p,
      coverage: cur ? p.coverage.map((c) => (c === cur ? next : c)) : [...p.coverage, next],
    }
  })
}

// Memos & candidates ----------------------------------------------------------

export function addMemo(m: Partial<Memo>): string {
  const id = uid()
  update('add memo', (p) => ({
    ...p,
    memos: [{ id, title: 'Untitled memo', body: '', kind: 'memo', sourceId: null, codeId: null, start: null, end: null, author: p.coder, updatedAt: now(), ...m }, ...p.memos],
  }))
  return id
}

export function updateMemo(id: string, change: Partial<Memo>) {
  update('edit memo', (p) => ({ ...p, memos: patch(p.memos, id, { ...change, updatedAt: now() }) }))
}

export function removeMemo(id: string) {
  update('delete memo', (p) => ({ ...p, memos: p.memos.filter((m) => m.id !== id) }))
}

export function addCandidate(c: Partial<Candidate> & { name: string }) {
  update('log candidate code', (p) => ({
    ...p,
    candidates: [{ id: uid(), rationale: '', sourceId: null, start: null, end: null, status: 'open', resolution: '', proposedBy: p.coder, createdAt: now(), ...c }, ...p.candidates],
  }))
}

export function updateCandidate(id: string, change: Partial<Candidate>) {
  update('update candidate', (p) => ({ ...p, candidates: patch(p.candidates, id, change) }))
}

// Extraction rows -------------------------------------------------------------

export function setExtraction(codingId: string, values: Record<string, string>) {
  update('edit extraction', (p) => {
    const cur = p.extractions.find((e) => e.codingId === codingId)
    return {
      ...p,
      extractions: cur
        ? p.extractions.map((e) => (e === cur ? { ...e, values } : e))
        : [...p.extractions, { id: uid(), codingId, values }],
    }
  })
}

export function setProject(label: string, change: Partial<Project>) {
  update(label, (p) => ({ ...p, ...change }))
}
