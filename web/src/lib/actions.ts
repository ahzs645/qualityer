import type { Candidate, Code, CodeGroup, Coding, CoverageStatus, Memo, Project, Source, WordingCheck } from './types'
import { applySpeakerTrack, joinSegments, splitSegments, type SpeakerInterval } from './listen'
import { PALETTE, editSource, findCorrections, now, segmentsOf, uid } from './model'
import { snapshot, store, update } from './store'
import { recodeCoding, reviewEvent } from './review'

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
  acceptSuggestions([id], 'accept suggestion')
}

export function acceptSuggestions(ids: string[], label = `accept ${ids.length} suggestions`) {
  const set = new Set(ids)
  update(label, (p) => {
    const hit = p.codings.filter((c) => set.has(c.id) && c.status === 'suggested')
    if (!hit.length) return p
    return {
      ...p,
      codings: p.codings.map((c) => (set.has(c.id) ? accepted(c, p.coder) : c)),
      reviewLog: [...p.reviewLog, ...hit.map((c) => reviewEvent(p, 'accept', c))],
    }
  })
}

/** Accepts a suggestion under a different code (the reviewer's correction). */
export function acceptAsCode(id: string, codeId: string) {
  recodeCoding(id, codeId)
}

export function rejectSuggestions(ids: string[]) {
  const set = new Set(ids)
  update(`reject ${ids.length} suggestions`, (p) => {
    const gone = p.codings.filter((c) => set.has(c.id))
    if (!gone.length) return p
    return {
      ...p,
      codings: p.codings.filter((c) => !set.has(c.id)),
      extractions: p.extractions.filter((e) => !set.has(e.codingId)),
      reviewLog: [...p.reviewLog, ...gone.map((c) => reviewEvent(p, 'reject', c))],
    }
  })
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
      restricted: p.restricted.filter((r) => r.sourceId !== id),
      wordingChecks: p.wordingChecks.filter((w) => w.sourceId !== id),
      memos: p.memos.map((m) => (m.sourceId === id ? { ...m, sourceId: null, start: null, end: null } : m)),
      cases: p.cases.map((c) => ({ ...c, sourceIds: c.sourceIds.filter((s) => s !== id) })),
    }
  })
}

/** Moves a source up or down the list; every screen and the report follow this order. */
export function moveSource(id: string, by: -1 | 1) {
  update('reorder sources', (p) => {
    const i = p.sources.findIndex((s) => s.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= p.sources.length) return p
    const sources = [...p.sources]
    ;[sources[i], sources[j]] = [sources[j], sources[i]]
    return { ...p, sources }
  })
}

/** Orders sources by name, numerically, so "R10" comes after "R9". */
export function sortSourcesByName() {
  update('sort sources by name', (p) => ({ ...p, sources: [...p.sources].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) }))
}

export function markReadTo(sourceId: string, offset: number) {
  update('mark read', (p) => ({
    ...p,
    sources: p.sources.map((s) => (s.id !== sourceId ? s : { ...s, readTo: offset, status: s.status === 'new' ? 'reading' : s.status })),
  }))
}

/** Applies glossary corrections to the given sources, moving all anchors. Snapshots first. */
/**
 * Applies the correction glossary to the given sources. `skip` holds matches a
 * person ruled out in the preview, as "sourceId:offset" keys; they are left as
 * they are.
 */
export async function applyGlossary(sourceIds: string[], skip: ReadonlySet<string> = new Set()) {
  const p = store.state.project
  if (!p) return 0
  const chosen = (id: string, text: string, glossary: typeof p.glossary) => findCorrections(text, glossary).filter((e) => !skip.has(`${id}:${e.start}`))
  const total = sourceIds.reduce((n, id) => n + chosen(id, p.sources.find((s) => s.id === id)?.text ?? '', p.glossary).length, 0)
  if (!total) return 0
  await snapshot(`Before applying ${total} transcript corrections`)
  update(`apply ${total} corrections`, (proj) =>
    sourceIds.reduce((acc, id) => {
      const s = acc.sources.find((x) => x.id === id)
      return s ? editSource(acc, id, chosen(id, s.text, acc.glossary)) : acc
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

/**
 * Reassigns one turn to another speaker. Sources with supplied segments are
 * updated directly; parsed transcripts have their "[mm:ss]  Speaker" header
 * rewritten, with every anchor moved to match.
 */
export function setTurnSpeaker(sourceId: string, turnIndex: number, speaker: string) {
  update('reassign speaker', (p) => {
    const s = p.sources.find((x) => x.id === sourceId)
    if (!s) return p
    if (s.segments?.length) {
      return { ...p, sources: p.sources.map((x) => (x.id !== sourceId ? x : { ...x, segments: x.segments!.map((g, i) => (i === turnIndex ? { ...g, speaker } : g)) })) }
    }
    const seg = segmentsOf(s)[turnIndex]
    if (!seg) return p
    const nl = s.text.indexOf('\n', seg.start)
    const header = s.text.slice(seg.start, nl < 0 ? seg.end : nl)
    const m = /^(\[[\d:.]+\]\s+)(.+)$/.exec(header)
    if (!m) return p
    return editSource(p, sourceId, [{ start: seg.start + m[1].length, end: seg.start + header.length, text: speaker }])
  })
}

// Team merge -----------------------------------------------------------------

export interface MergeReport { codings: number; memos: number; candidates: number; codes: number; skippedSources: string[]; coders: string[] }

/**
 * Merges a colleague's exported copy of the same study: a set union of their
 * codings, memos, candidate codes, extraction rows and any new codes. Only
 * sources whose text is identical are merged, so anchors stay valid; others are
 * reported. A snapshot is taken first.
 */
export async function mergeCoderFile(other: Project): Promise<MergeReport> {
  const p = store.state.project
  if (!p) throw new Error('No project open')
  const mine = new Map(p.sources.map((s) => [s.id, s]))
  const byText = new Map(p.sources.map((s) => [s.text, s]))
  const sourceMap = new Map<string, string>()
  const skipped: string[] = []
  for (const s of other.sources ?? []) {
    const match = mine.get(s.id)?.text === s.text ? mine.get(s.id) : byText.get(s.text)
    if (match) sourceMap.set(s.id, match.id)
    else skipped.push(s.name)
  }
  const codeIds = new Set(p.codes.map((c) => c.id))
  const newCodes = (other.codes ?? []).filter((c) => !codeIds.has(c.id))
  const have = new Set(p.codings.map((c) => c.id))
  const sig = new Set(p.codings.map((c) => `${c.sourceId}|${c.codeId}|${c.start}|${c.end}|${c.coder}`))
  const codings = (other.codings ?? []).flatMap((c) => {
    const sid = sourceMap.get(c.sourceId)
    if (!sid || have.has(c.id)) return []
    const k = `${sid}|${c.codeId}|${c.start}|${c.end}|${c.coder}`
    if (sig.has(k)) return []
    sig.add(k)
    return [{ ...c, sourceId: sid }]
  })
  const memoIds = new Set(p.memos.map((m) => m.id))
  const memos = (other.memos ?? []).filter((m) => !memoIds.has(m.id) && (!m.sourceId || sourceMap.has(m.sourceId))).map((m) => ({ ...m, sourceId: m.sourceId ? sourceMap.get(m.sourceId)! : null }))
  const candIds = new Set(p.candidates.map((c) => c.id))
  const candidates = (other.candidates ?? []).filter((c) => !candIds.has(c.id)).map((c) => ({ ...c, sourceId: c.sourceId ? sourceMap.get(c.sourceId) ?? null : null }))
  const codingIds = new Set(codings.map((c) => c.id))
  const extractions = (other.extractions ?? []).filter((e) => codingIds.has(e.codingId))
  await snapshot(`Before merging ${other.coder || 'a colleague'}'s copy`)
  update(`merge ${codings.length} codings from a colleague`, (proj) => ({
    ...proj,
    codes: [...proj.codes, ...newCodes],
    codings: [...proj.codings, ...codings],
    memos: [...proj.memos, ...memos],
    candidates: [...proj.candidates, ...candidates],
    extractions: [...proj.extractions, ...extractions],
    aiRuns: [...proj.aiRuns, ...(other.aiRuns ?? []).filter((r) => !proj.aiRuns.some((x) => x.id === r.id))],
    reviewLog: [...proj.reviewLog, ...(other.reviewLog ?? []).filter((e) => sourceMap.has(e.sourceId) && !proj.reviewLog.some((x) => x.id === e.id)).map((e) => ({ ...e, sourceId: sourceMap.get(e.sourceId)! }))],
    restricted: [...proj.restricted, ...(other.restricted ?? []).filter((r) => sourceMap.has(r.sourceId) && !proj.restricted.some((x) => x.id === r.id)).map((r) => ({ ...r, sourceId: sourceMap.get(r.sourceId)! }))],
  }))
  return { codings: codings.length, memos: memos.length, candidates: candidates.length, codes: newCodes.length, skippedSources: skipped, coders: [...new Set(codings.map((c) => c.coder))] }
}

// Audio review ---------------------------------------------------------------

/** Stores a second transcription's reading of each coded passage, replacing earlier checks on that source. */
export function setWordingChecks(sourceId: string, checks: WordingCheck[]) {
  update(`compare ${checks.length} passages with a second transcription`, (p) => ({ ...p, wordingChecks: [...p.wordingChecks.filter((w) => w.sourceId !== sourceId), ...checks] }))
}

/** Makes a passage its own turn with the given speaker (an interviewer's question inside a respondent's turn). */
export function splitTurn(sourceId: string, span: { start: number; end: number }, speaker: string) {
  update('split turn', (p) => {
    const s = p.sources.find((x) => x.id === sourceId)
    const segments = s && splitSegments(s, span.start, span.end, speaker)
    if (!s || !segments) return p
    const speakers = s.speakers.some((x) => x.raw === speaker) ? s.speakers : [...s.speakers, { raw: speaker, name: speaker, role: 'unknown' as const }]
    return { ...p, sources: p.sources.map((x) => (x.id === sourceId ? { ...x, segments, speakers } : x)) }
  })
}

/**
 * Joins a turn onto the one before it (and the one after, when that is the
 * same speaker again), so a sentence the transcript cut in two is one turn.
 * Codings and other anchors move with the text.
 */
export function joinTurn(sourceId: string, index: number) {
  update('join turns', (p) => {
    const s = p.sources.find((x) => x.id === sourceId)
    const joined = s && joinSegments(s, index)
    if (!s || !joined) return p
    const withSegments = { ...p, sources: p.sources.map((x) => (x.id === sourceId ? { ...x, segments: joined.segments } : x)) }
    return editSource(withSegments, sourceId, joined.edits)
  })
}

/** Lays an imported speaker track over a source's timed turns. A snapshot is taken first. */
export async function importSpeakerTrack(sourceId: string, track: SpeakerInterval[]) {
  const s = store.state.project?.sources.find((x) => x.id === sourceId)
  if (!s) throw new Error('Source not found')
  const result = applySpeakerTrack(s, track)
  await snapshot('Before importing a speaker track')
  update('import speaker track', (p) => ({
    ...p,
    sources: p.sources.map((x) => {
      if (x.id !== sourceId) return x
      const known = new Set(x.speakers.map((sp) => sp.raw))
      const fresh = [...new Set(result.segments.map((g) => g.speaker))].filter((raw) => raw && !known.has(raw)).map((raw) => ({ raw, name: raw, role: 'unknown' as const }))
      return { ...x, segments: result.segments, speakers: [...x.speakers, ...fresh] }
    }),
  }))
  return result
}
