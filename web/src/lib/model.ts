import type {
  Code, CodeGroup, Coding, Correction, GroupKind, Project, Rule, Segment, Source,
} from './types'

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
export const now = () => new Date().toISOString()

export const PALETTE = [
  '#2f7d78', '#c2573a', '#5b5fc7', '#b8892c', '#7a4fa3', '#3f7fb5',
  '#a8456b', '#4f8a3c', '#8a6a4a', '#d0743c', '#3a6f8f', '#6b7a2c',
]

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  substantive: 'Substantive',
  evidence: 'Evidence grade',
  stance: 'Stance',
  flag: 'Flag',
  process: 'Process',
  other: 'Other',
}

export function emptyProject(name = 'Untitled study'): Project {
  const t = now()
  return {
    id: uid(), name, question: '', method: '', createdAt: t, updatedAt: t, coder: 'Researcher',
    sources: [], groups: [], codes: [], codings: [], rules: [], guide: [], coverage: [], memos: [],
    cases: [], themes: [], cells: [], glossary: [], extractionFields: ['Figure', 'Unit', 'Basis'],
    extractions: [], candidates: [], aiRuns: [], reviewLog: [], restricted: [], wordingChecks: [], importNotes: [],
  }
}

export function newSource(name: string, text: string, importedFrom = 'Pasted text'): Source {
  return {
    id: uid(), name, text, attributes: {}, speakers: [], segments: null, media: null, status: 'new',
    readTo: 0, importedFrom, createdAt: now(),
  }
}

/** Returns a converter from code-point offsets to UTF-16 offsets for `text`. */
export function codePointToUtf16(text: string) {
  if (!/[\uD800-\uDFFF]/.test(text)) return (n: number) => n
  const table: number[] = []
  let u = 0
  for (const ch of text) { table.push(u); u += ch.length }
  table.push(u)
  return (n: number) => table[Math.max(0, Math.min(n, table.length - 1))]
}

// ---------------------------------------------------------------------------
// Transcript structure

const TIME_HEADER = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.\d+)?\]\s+(.{1,60})$/
const INLINE_SPEAKER = /^((?:Speaker|SPEAKER|Interviewer|Respondent|Participant|Moderator|[IPR])[ _]?\d{0,3}|[A-Z][\w.'-]{1,20}(?: [A-Z][\w.'-]{1,20})?)\s*(?:\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.\d+)?\])?\s*:\s+/
const LINE_TIME = /^\[?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.\d+)?\]?\s+/

const secs = (h: string | undefined, m: string, s: string) =>
  Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s)

/**
 * Derives speaker turns from plain transcript text. Recognises
 * "[mm:ss]  Speaker 1" header lines (QualCoder / Research Weave exports) and
 * "Name: text" lines. Falls back to blank-line paragraphs.
 */
export function parseTurns(text: string): Segment[] {
  const lines: { start: number; end: number; line: string }[] = []
  let pos = 0
  for (const line of text.split('\n')) {
    lines.push({ start: pos, end: pos + line.length, line })
    pos += line.length + 1
  }
  const headerTurns: Segment[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = TIME_HEADER.exec(lines[i].line.trim())
    if (m) headerTurns.push({ start: lines[i].start, end: 0, speaker: m[4].trim(), time: secs(m[1], m[2], m[3]) })
  }
  if (headerTurns.length >= 2) return closeTurns(text, headerTurns)

  const inline: Segment[] = []
  for (const l of lines) {
    const m = INLINE_SPEAKER.exec(l.line)
    if (m) inline.push({ start: l.start, end: 0, speaker: m[1], time: m[3] ? secs(m[2], m[3], m[4]) : null })
  }
  if (inline.length >= 3) return closeTurns(text, inline)

  const paras: Segment[] = []
  const re = /\S[\s\S]*?(?=\n\s*\n|$)/g
  let p: RegExpExecArray | null
  while ((p = re.exec(text))) {
    const t = LINE_TIME.exec(p[0])
    paras.push({ start: p.index, end: p.index + p[0].length, speaker: '', time: t ? secs(t[1], t[2], t[3]) : null })
  }
  return paras.length ? paras : [{ start: 0, end: text.length, speaker: '', time: null }]
}

function closeTurns(text: string, turns: Segment[]): Segment[] {
  const out: Segment[] = []
  if (turns[0].start > 0 && text.slice(0, turns[0].start).trim()) {
    out.push({ start: 0, end: turns[0].start, speaker: '', time: null })
  }
  turns.forEach((t, i) => {
    let end = i + 1 < turns.length ? turns[i + 1].start : text.length
    while (end > t.start && /\s/.test(text[end - 1])) end--
    out.push({ ...t, end })
  })
  return out
}

const segmentCache = new WeakMap<Source, Segment[]>()
export function segmentsOf(source: Source): Segment[] {
  if (source.segments?.length) return source.segments
  let s = segmentCache.get(source)
  if (!s) segmentCache.set(source, (s = parseTurns(source.text)))
  return s
}

export function speakerOf(source: Source, raw: string) {
  return source.speakers.find((s) => s.raw === raw)
}

/** Distinct raw speaker labels in order of first appearance. */
export function rawSpeakers(source: Source): string[] {
  const seen = new Set<string>()
  for (const s of segmentsOf(source)) if (s.speaker) seen.add(s.speaker)
  return [...seen]
}

export function formatTime(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(s).padStart(2, '0')
}

/** Time at `offset`: word-level when word timings exist, else the turn's start. */
export function timeAt(source: Source, offset: number) {
  const segs = segmentsOf(source)
  let best: Segment | undefined
  for (const s of segs) {
    if (s.start <= offset) best = s
    else break
  }
  if (best?.words?.length) {
    let t: number | null = null
    for (const [o, time] of best.words) {
      if (o <= offset) t = time
      else break
    }
    if (t != null) return t
  }
  return best?.time ?? null
}

/** Text offset spoken at `time` seconds (nearest preceding word or turn). */
export function offsetAt(source: Source, time: number): number | null {
  const segs = segmentsOf(source)
  let seg: Segment | undefined
  for (const s of segs) {
    if (s.time != null && s.time <= time) seg = s
    else if (s.time != null && s.time > time) break
  }
  if (!seg) return null
  let off = seg.start
  for (const [o, t] of seg.words ?? []) {
    if (t <= time) off = o
    else break
  }
  return off
}

/** Start and end time of a passage, using the next word's start as the end. */
export function timeRange(source: Source, start: number, end: number): [number, number] | null {
  const a = timeAt(source, start)
  if (a == null) return null
  const segs = segmentsOf(source)
  let b: number | null = null
  for (const s of segs) {
    for (const [o, t] of s.words ?? []) if (o >= end) { b = t; break }
    if (b != null) break
    if (s.start >= end && s.time != null) { b = s.time; break }
  }
  return [a, b ?? a + Math.max(3, (end - start) / 14)]
}

// ---------------------------------------------------------------------------
// Lookups

export function indexBy<T extends { id: string }>(items: T[]) {
  return new Map(items.map((i) => [i.id, i]))
}

export function excerpt(text: string, start: number, end: number) {
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

export function codePath(code: Code, codes: Map<string, Code>): string {
  const names = [code.name]
  let cur = code.parentId ? codes.get(code.parentId) : undefined
  let guard = 0
  while (cur && guard++ < 20) {
    names.unshift(cur.name)
    cur = cur.parentId ? codes.get(cur.parentId) : undefined
  }
  return names.join(' › ')
}

/** Codes in display order: grouped, parents before children. */
export function orderedCodes(project: Project): { code: Code; depth: number }[] {
  const out: { code: Code; depth: number }[] = []
  const byParent = new Map<string | null, Code[]>()
  for (const c of project.codes) {
    const key = c.parentId && project.codes.some((p) => p.id === c.parentId) ? c.parentId : null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(c)
  }
  const visit = (c: Code, depth: number) => {
    out.push({ code: c, depth })
    for (const k of byParent.get(c.id) ?? []) visit(k, depth + 1)
  }
  const groupOrder = new Map(project.groups.map((g, i) => [g.id, i]))
  const roots = [...(byParent.get(null) ?? [])].sort(
    (a, b) => (groupOrder.get(a.groupId ?? '') ?? 999) - (groupOrder.get(b.groupId ?? '') ?? 999),
  )
  for (const r of roots) visit(r, 0)
  return out
}

/** A code's group, inherited from its nearest ancestor when unset. */
export function groupOf(code: Code | undefined, codes: Map<string, Code>, groups: Map<string, CodeGroup>) {
  let cur = code
  let guard = 0
  while (cur && guard++ < 20) {
    if (cur.groupId && groups.has(cur.groupId)) return groups.get(cur.groupId)!
    cur = cur.parentId ? codes.get(cur.parentId) : undefined
  }
  return undefined
}

/** Ids of AI passes kept only for comparison with a human coder. */
export function comparisonRuns(project: Project) {
  return new Set(project.aiRuns.filter((r) => r.comparisonOnly).map((r) => r.id))
}

/** Suggestions waiting for a decision, leaving out comparison-only passes. */
export function pendingSuggestions(project: Project) {
  const skip = comparisonRuns(project)
  return project.codings.filter((c) => c.status === 'suggested' && !(c.origin && skip.has(c.origin.runId)))
}

/** The off-the-record restriction a passage touches, if any. */
export function restrictionAt(project: Project, sourceId: string, start: number, end: number) {
  return project.restricted.find((r) => r.sourceId === sourceId && r.start < end && r.end > start)
}

export const WITHHELD = '[withheld — off the record]'

/** A passage's text for quoting outside the app: withheld when it is off the record. */
export function quotable(project: Project, source: Source | undefined, start: number, end: number) {
  if (!source) return ''
  return restrictionAt(project, source.id, start, end) ? WITHHELD : excerpt(source.text, start, end)
}

/** Every code that belongs to a group, including children that inherit it. */
export function codesInGroup(project: Project, groupId: string): Code[] {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  return project.codes.filter((c) => groupOf(c, codes, groups)?.id === groupId)
}

// ---------------------------------------------------------------------------
// Intervals

export function mergeIntervals(spans: [number, number][]): [number, number][] {
  const sorted = spans.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

export const intervalLength = (spans: [number, number][]) =>
  spans.reduce((n, [a, b]) => n + (b - a), 0)

// ---------------------------------------------------------------------------
// Codebook rules

export interface Violation {
  ruleId: string
  sourceId: string
  start: number
  end: number
  codingIds: string[]
  message: string
}

export function describeRule(rule: Rule, groups: Map<string, CodeGroup>) {
  const trig = rule.triggerGroupIds.map((g) => groups.get(g)?.name ?? '?').join(' or ') || 'any group'
  const target = rule.targetGroupId ? groups.get(rule.targetGroupId)?.name ?? '?' : '?'
  if (rule.kind === 'exactly-one') return `Every ${trig} span has exactly one ${target} code`
  if (rule.kind === 'at-most-one') return `A ${trig} span has at most one ${target} code`
  return `Every ${trig} coding has an extraction row`
}

export function checkRules(project: Project, sourceId?: string): Violation[] {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const groupIdOf = (codeId: string) => groupOf(codes.get(codeId), codes, groups)?.id
  const codings = project.codings.filter(
    (c) => c.status === 'accepted' && (!sourceId || c.sourceId === sourceId),
  )
  const out: Violation[] = []
  const bySpan = new Map<string, Coding[]>()
  for (const c of codings) {
    const k = `${c.sourceId}:${c.start}:${c.end}`
    if (!bySpan.has(k)) bySpan.set(k, [])
    bySpan.get(k)!.push(c)
  }
  const extracted = new Set(project.extractions.map((e) => e.codingId))
  for (const rule of project.rules) {
    if (!rule.enabled) continue
    const trig = new Set(rule.triggerGroupIds)
    if (rule.kind === 'requires-extraction') {
      for (const c of codings) {
        if (trig.has(groupIdOf(c.codeId) ?? '') && !extracted.has(c.id)) {
          out.push({
            ruleId: rule.id, sourceId: c.sourceId, start: c.start, end: c.end, codingIds: [c.id],
            message: `${codes.get(c.codeId)?.name ?? 'Code'} has no extraction row`,
          })
        }
      }
      continue
    }
    if (!rule.targetGroupId) continue
    const targetName = groups.get(rule.targetGroupId)?.name ?? 'target'
    for (const span of bySpan.values()) {
      if (!span.some((c) => trig.has(groupIdOf(c.codeId) ?? ''))) continue
      const targets = new Set(span.filter((c) => groupIdOf(c.codeId) === rule.targetGroupId).map((c) => c.codeId))
      const n = targets.size
      const bad = rule.kind === 'exactly-one' ? n !== 1 : n > 1
      if (bad) {
        const s = span[0]
        out.push({
          ruleId: rule.id, sourceId: s.sourceId, start: s.start, end: s.end, codingIds: span.map((c) => c.id),
          message: n === 0 ? `Missing ${targetName}` : `${n} ${targetName} codes on one span`,
        })
      }
    }
  }
  return out.sort((a, b) => (a.sourceId === b.sourceId ? a.start - b.start : a.sourceId < b.sourceId ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Transcript corrections that keep code anchors

export interface Edit {
  start: number
  end: number
  text: string
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function correctionRegExp(c: Correction) {
  const body = escapeRegExp(c.find)
  const src = c.wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body
  return new RegExp(src, 'gu' + (c.caseSensitive ? '' : 'i'))
}

export function findCorrections(text: string, corrections: Correction[]): (Edit & { correctionId: string })[] {
  const found: (Edit & { correctionId: string })[] = []
  for (const c of corrections) {
    if (!c.find) continue
    const re = correctionRegExp(c)
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m[0] === '') { re.lastIndex++; continue }
      if (m[0] !== c.replace) found.push({ start: m.index, end: m.index + m[0].length, text: c.replace, correctionId: c.id })
    }
  }
  // Earlier, longer matches win; drop overlaps.
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const out: typeof found = []
  for (const e of found) if (!out.length || e.start >= out[out.length - 1].end) out.push(e)
  return out
}

/** Maps an offset in the original text to the edited text. */
export function remapper(edits: Edit[]) {
  return (pos: number, side: 'start' | 'end') => {
    let shift = 0
    for (const e of edits) {
      if (e.end <= pos) { shift += e.text.length - (e.end - e.start); continue }
      if (e.start >= pos) break
      // `pos` falls inside a replaced range: snap outward.
      return side === 'start' ? e.start + shift : e.start + shift + e.text.length
    }
    return pos + shift
  }
}

export function applyEdits(text: string, edits: Edit[]) {
  let out = ''
  let last = 0
  for (const e of edits) {
    out += text.slice(last, e.start) + e.text
    last = e.end
  }
  return out + text.slice(last)
}

/** Applies edits to one source and moves every anchor that points into it. */
export function editSource(project: Project, sourceId: string, edits: Edit[]): Project {
  if (!edits.length) return project
  const map = remapper(edits)
  const nullableMap = (v: number | null, side: 'start' | 'end') => (v == null ? v : map(v, side))
  return {
    ...project,
    sources: project.sources.map((s) =>
      s.id !== sourceId ? s : {
        ...s,
        text: applyEdits(s.text, edits),
        readTo: map(s.readTo, 'end'),
        segments: s.segments?.map((g) => ({
          ...g,
          start: map(g.start, 'start'),
          end: map(g.end, 'end'),
          uncertain: g.uncertain
            ?.map(([a, b]) => [map(a, 'start'), map(b, 'end')] as [number, number])
            .filter(([a, b]) => b > a),
          words: g.words?.map(([o, t]) => [map(o, 'start'), t] as [number, number]),
        })) ?? null,
      }),
    codings: project.codings.map((c) =>
      c.sourceId !== sourceId ? c : { ...c, start: map(c.start, 'start'), end: map(c.end, 'end') }),
    coverage: project.coverage.map((c) =>
      c.sourceId !== sourceId ? c : { ...c, start: nullableMap(c.start, 'start'), end: nullableMap(c.end, 'end') }),
    memos: project.memos.map((m) =>
      m.sourceId !== sourceId ? m : { ...m, start: nullableMap(m.start, 'start'), end: nullableMap(m.end, 'end') }),
    candidates: project.candidates.map((m) =>
      m.sourceId !== sourceId ? m : { ...m, start: nullableMap(m.start, 'start'), end: nullableMap(m.end, 'end') }),
    restricted: project.restricted.map((r) =>
      r.sourceId !== sourceId ? r : { ...r, start: map(r.start, 'start'), end: map(r.end, 'end') }),
    reviewLog: project.reviewLog.map((e) =>
      e.sourceId !== sourceId ? e : { ...e, start: map(e.start, 'start'), end: map(e.end, 'end') }),
    wordingChecks: project.wordingChecks.map((w) =>
      w.sourceId !== sourceId ? w : { ...w, start: map(w.start, 'start'), end: map(w.end, 'end') }),
    aiRuns: project.aiRuns.map((r) =>
      !r.claims || r.sourceIds[0] !== sourceId ? r : { ...r, claims: Object.fromEntries(Object.entries(r.claims).map(([k, [a, b]]) => [k, [map(a, 'start'), map(b, 'end')] as [number, number]])) }),
  }
}

// ---------------------------------------------------------------------------
// Intercoder agreement (character-level, per code and pooled per group)

export interface AgreementRow {
  id: string
  label: string
  both: number
  onlyA: number
  onlyB: number
  percent: number
  kappa: number | null
}

export function agreement(project: Project, coderA: string, coderB: string, sourceIds: string[], opts: { includeSuggested?: boolean; codeIds?: string[] } = {}) {
  const sources = project.sources.filter((s) => sourceIds.includes(s.id))
  const total = sources.reduce((n, s) => n + s.text.length, 0)
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const cells = new Map<string, { both: number; onlyA: number; onlyB: number }>()
  for (const code of project.codes) {
    if (opts.codeIds && !opts.codeIds.includes(code.id)) continue
    let both = 0, onlyA = 0, onlyB = 0
    for (const s of sources) {
      const pick = (coder: string) => mergeIntervals(
        project.codings
          .filter((c) => c.sourceId === s.id && c.codeId === code.id && c.coder === coder && (c.status === 'accepted' || (opts.includeSuggested && c.status === 'suggested')))
          .map((c) => [c.start, c.end] as [number, number]),
      )
      const a = pick(coderA)
      const b = pick(coderB)
      const la = intervalLength(a)
      const lb = intervalLength(b)
      let inter = 0
      let i = 0, j = 0
      while (i < a.length && j < b.length) {
        const lo = Math.max(a[i][0], b[j][0])
        const hi = Math.min(a[i][1], b[j][1])
        if (hi > lo) inter += hi - lo
        if (a[i][1] < b[j][1]) i++
        else j++
      }
      both += inter; onlyA += la - inter; onlyB += lb - inter
    }
    if (both + onlyA + onlyB > 0) cells.set(code.id, { both, onlyA, onlyB })
  }
  const score = (id: string, label: string, v: { both: number; onlyA: number; onlyB: number }, n: number): AgreementRow => {
    const neither = Math.max(0, n - v.both - v.onlyA - v.onlyB)
    const po = n ? (v.both + neither) / n : 0
    const pa = n ? (v.both + v.onlyA) / n : 0
    const pb = n ? (v.both + v.onlyB) / n : 0
    const pe = pa * pb + (1 - pa) * (1 - pb)
    const union = v.both + v.onlyA + v.onlyB
    return {
      id, label, ...v,
      percent: union ? v.both / union : 1,
      kappa: pe >= 1 ? null : (po - pe) / (1 - pe),
    }
  }
  const byCode = [...cells].map(([id, v]) => score(id, codes.get(id)?.name ?? id, v, total))
  const pooled = new Map<string, { both: number; onlyA: number; onlyB: number; n: number }>()
  for (const [id, v] of cells) {
    const g = groupOf(codes.get(id), codes, groups)
    const key = g?.id ?? '—'
    const cur = pooled.get(key) ?? { both: 0, onlyA: 0, onlyB: 0, n: 0 }
    cur.both += v.both; cur.onlyA += v.onlyA; cur.onlyB += v.onlyB; cur.n += total
    pooled.set(key, cur)
  }
  const byGroup = [...pooled].map(([id, v]) => score(id, groups.get(id)?.name ?? 'Ungrouped', v, v.n))
  return { byCode, byGroup }
}

export function coders(project: Project, includeSuggested = false) {
  return [...new Set(project.codings.filter((c) => includeSuggested || c.status === 'accepted').map((c) => c.coder).filter(Boolean))].sort()
}

// ---------------------------------------------------------------------------
// Progress

export function sourceProgress(project: Project, source: Source) {
  const own = project.codings.filter((c) => c.sourceId === source.id && c.status === 'accepted')
  const covered = intervalLength(mergeIntervals(own.map((c) => [c.start, c.end])))
  const marks = project.coverage.filter((c) => c.sourceId === source.id && c.status !== 'unmarked')
  return {
    read: source.text.length ? Math.min(1, source.readTo / source.text.length) : 0,
    coded: source.text.length ? covered / source.text.length : 0,
    codings: own.length,
    suggested: pendingSuggestions(project).filter((c) => c.sourceId === source.id).length,
    guideMarked: marks.length,
  }
}

/** Codes first seen in each source, in source order — a simple saturation curve. */
export function saturation(project: Project) {
  const seen = new Set<string>()
  return project.sources.map((s) => {
    const used = new Set(project.codings.filter((c) => c.sourceId === s.id && c.status === 'accepted').map((c) => c.codeId))
    const fresh = [...used].filter((c) => !seen.has(c))
    fresh.forEach((c) => seen.add(c))
    return { source: s, used: used.size, fresh: fresh.length, cumulative: seen.size }
  })
}

// ---------------------------------------------------------------------------
// Export helpers

export function toCSV(rows: (string | number | boolean | null | undefined)[][]) {
  const cell = (v: unknown) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s // neutralise spreadsheet formulas
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(cell).join(',')).join('\r\n')
}

export function download(name: string, data: BlobPart, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project'
}

/** Splits a codebook memo written as "Definition… INCLUDE: … EXCLUDE: … ANCHOR: …". */
export function splitDefinition(memo: string) {
  const out = { definition: '', include: '', exclude: '', anchor: '' }
  const re = /^\s*(include(?:\/qualify)?|exclude(?:\/qualify)?|anchor(?: example)?|definition)\s*:\s*/gim
  const marks: { key: keyof typeof out; at: number; body: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(memo))) {
    const w = m[1].toLowerCase()
    const key = w.startsWith('incl') ? 'include' : w.startsWith('excl') ? 'exclude' : w.startsWith('anch') ? 'anchor' : 'definition'
    marks.push({ key, at: m.index, body: m.index + m[0].length })
  }
  out.definition = (marks.length ? memo.slice(0, marks[0].at) : memo).trim()
  marks.forEach((mk, i) => {
    const text = memo.slice(mk.body, i + 1 < marks.length ? marks[i + 1].at : memo.length).trim()
    out[mk.key] = out[mk.key] ? out[mk.key] + '\n\n' + text : text
  })
  return out
}

/** Guesses a group's role from its name. */
export function guessGroupKind(name: string): GroupKind {
  const n = name.toLowerCase()
  if (/evidence|grade|certainty/.test(n)) return 'evidence'
  if (/stance|position|sentiment|attitude/.test(n)) return 'stance'
  if (/flag|cost|benefit|extract/.test(n)) return 'flag'
  if (/process|method|procedur|admin/.test(n)) return 'process'
  return 'substantive'
}

/** Default rules for a codebook that has evidence/stance/flag groups. */
export function suggestedRules(groups: CodeGroup[]): Rule[] {
  const subs = groups.filter((g) => g.kind === 'substantive').map((g) => g.id)
  const rules: Rule[] = []
  if (!subs.length) return rules
  for (const g of groups) {
    if (g.kind === 'evidence') rules.push({ id: uid(), kind: 'exactly-one', triggerGroupIds: subs, targetGroupId: g.id, enabled: true })
    if (g.kind === 'stance') rules.push({ id: uid(), kind: 'at-most-one', triggerGroupIds: subs, targetGroupId: g.id, enabled: true })
    if (g.kind === 'flag') rules.push({ id: uid(), kind: 'requires-extraction', triggerGroupIds: [g.id], targetGroupId: null, enabled: true })
  }
  return rules
}

// ---------------------------------------------------------------------------
// Selection helpers

/** Trims whitespace and extends partial words at either edge. */
export function snapToWords(text: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  const word = /[\p{L}\p{N}'’-]/u
  while (start > 0 && word.test(text[start - 1]) && word.test(text[start])) start--
  while (end < text.length && word.test(text[end]) && word.test(text[end - 1])) end++
  return [start, end]
}

/** Expands a span to whole sentences, never crossing a line break. */
export function snapToSentence(text: string, start: number, end: number): [number, number] {
  let s = start
  while (s > 0 && text[s - 1] !== '\n' && !(/[.!?…]/.test(text[s - 2] ?? '') && /\s/.test(text[s - 1]))) s--
  let e = Math.max(end, s)
  while (e < text.length && text[e] !== '\n' && !/[.!?…]/.test(text[e - 1] ?? '')) e++
  while (e < text.length && /["'”’)]/.test(text[e])) e++
  return snapToWords(text, s, e)
}
