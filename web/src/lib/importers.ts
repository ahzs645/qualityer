import { inflateSync, strFromU8, unzipSync } from 'fflate'
import type {
  Code, CodeGroup, Coding, GuideQuestion, Memo, Project, Segment, Source, Theme,
} from './types'
import {
  PALETTE, codePointToUtf16, emptyProject, guessGroupKind, newSource, now, splitDefinition, suggestedRules, uid,
} from './model'

// ---------------------------------------------------------------------------
// Offsets: imports store Unicode code points, the app uses UTF-16 indices.

export { codePointToUtf16 }

// ---------------------------------------------------------------------------
// Plain transcripts

const subtitleTime = (s: string) => {
  const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(s)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number('0.' + m[4]) : null
}

/**
 * Parses SRT / WebVTT cues into a transcript with timestamped turns.
 *
 * Every cue keeps its timing: each word gets a start time, exact when the cue
 * carries WebVTT inline timestamps (`<00:01:02.500>word`), otherwise spread
 * across the cue's duration. Machine captions often come as one cue every few
 * words, so without this a three-minute answer would have a single timestamp
 * and nothing inside it could be played or followed.
 *
 * Consecutive cues from one speaker form a turn. Long monologues are broken
 * into paragraphs at a pause or a length cap, but only where a sentence ends,
 * and unlabelled captions are grouped into paragraphs, so a turn stays
 * readable and codable (as for Whisper JSON).
 */
export function parseSubtitles(raw: string) {
  const cues = raw.replace(/\r/g, '').split(/\n\s*\n/)
  const segments: Segment[] = []
  let text = ''
  let lastEnd: number | null = null
  for (const cue of cues) {
    const lines = cue.split('\n').filter((l) => l.trim() && l.trim() !== 'WEBVTT')
    const timeIdx = lines.findIndex((l) => l.includes('-->'))
    if (timeIdx < 0) continue
    let body = lines.slice(timeIdx + 1).join(' ').trim()
    if (!body) continue
    const [from, to] = lines[timeIdx].split('-->')
    const t0 = subtitleTime(from)
    const t1 = subtitleTime(to)
    let speaker = ''
    const v = /^<v(?:\.[\w.-]+)?\s+([^>]+)>/.exec(body)
    const colon = /^([A-Z][\w .'-]{0,30}):\s+/.exec(body)
    if (v) { speaker = v[1].trim(); body = body.slice(v[0].length) }
    else if (colon) { speaker = colon[1]; body = body.slice(colon[0].length) }

    // Split the cue into words, keeping any inline timestamp that precedes one.
    const parts: { word: string; at: number | null }[] = []
    let pending: number | null = null
    for (const tok of body.split(/(<\d[\d:.,]*>)|\s+/)) {
      if (!tok) continue
      if (/^<\d/.test(tok)) { pending = subtitleTime(tok); continue }
      const word = tok.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim()
      if (!word) continue
      parts.push({ word, at: pending })
      pending = null
    }
    if (!parts.length) continue
    body = parts.map((p) => p.word).join(' ')

    const prev = segments[segments.length - 1]
    const pause = t0 != null && lastEnd != null ? t0 - lastEnd : 0
    lastEnd = t1 ?? t0 ?? lastEnd
    const length = prev ? text.length - prev.start : 0
    const cap = speaker ? 1200 : 700
    // Break a long run of one speaker only where a sentence ends, so a claim is never split across two
    // paragraphs; past twice the cap, break anyway.
    const sentenceEnd = prev ? /[.?!…]["”')]?$/.test(text) : false
    const wantBreak = length + body.length > cap || (pause > 2 && (!speaker || length >= 400))
    const join = prev && prev.speaker === speaker && (!wantBreak || (!sentenceEnd && length + body.length <= cap * 2))
    let start: number
    if (join) { text += ' '; start = text.length; prev.end = start + body.length }
    else {
      if (text) text += '\n\n'
      start = text.length
      segments.push({ start, end: start + body.length, speaker, time: t0, words: [] })
    }
    text += body
    const seg = segments[segments.length - 1]
    let o = start
    for (const p of parts) {
      const share = (o - start) / Math.max(1, body.length)
      const at = p.at ?? (t0 != null ? t0 + (t1 != null && t1 > t0 ? (t1 - t0) * share : 0) : null)
      if (at != null) seg.words!.push([o, Math.round(at * 1000) / 1000])
      o += p.word.length + 1
    }
  }
  for (const s of segments) if (!s.words?.length) delete s.words
  return { text, segments }
}

interface WhisperWord { word?: string; text?: string; start?: number; probability?: number; score?: number }
interface WhisperSegment { text?: string; start?: number; end?: number; speaker?: string; words?: WhisperWord[] }

/** Whisper / WhisperX / noScribe-style JSON with `segments`. */
export function parseWhisperJSON(json: { segments?: WhisperSegment[] }) {
  const segments: Segment[] = []
  let text = ''
  let lastEnd: number | null = null
  for (const s of json.segments ?? []) {
    const body = (s.text ?? '').trim()
    if (!body) continue
    const speaker = s.speaker ?? ''
    const prev = segments[segments.length - 1]
    let start: number
    // Same speaker continues the turn; unlabelled speech is grouped into paragraphs,
    // breaking at sentence ends or long pauses.
    const pause = s.start != null && lastEnd != null ? s.start - lastEnd : 0
    lastEnd = s.end ?? lastEnd
    // Long monologues are split into paragraphs too, so a turn stays readable and codable.
    const cap = speaker ? 1200 : 700
    const join = prev && prev.speaker === speaker && text.length - prev.start + body.length <= cap && !(pause > 2)
    if (join) { text += ' '; start = text.length; prev.end = start + body.length }
    else {
      if (text) text += '\n\n'
      start = text.length
      segments.push({ start, end: start + body.length, speaker, time: s.start ?? null, uncertain: [], words: [] })
    }
    text += body
    const seg = segments[segments.length - 1]
    let cursor = start
    for (const w of s.words ?? []) {
      const word = (w.word ?? w.text ?? '').trim()
      const at = word ? text.indexOf(word, cursor) : -1
      if (at < 0) continue
      cursor = at + word.length
      if (w.start != null) seg.words!.push([at, w.start])
      const p = w.probability ?? w.score
      if (p != null && p < 0.5) seg.uncertain!.push([at, at + word.length])
    }
  }
  return { text, segments }
}

export async function sourceFromFile(file: File): Promise<Source> {
  const name = file.name.replace(/\.[^.]+$/, '')
  const raw = await file.text()
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'srt' || ext === 'vtt') {
    const { text, segments } = parseSubtitles(raw)
    return { ...newSource(name, text, file.name), segments }
  }
  if (ext === 'docx' || ext === 'odt' || ext === 'pdf' || ext === 'html' || ext === 'htm' || ext === 'rtf') {
    const docs = await import('./documents')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const text = ext === 'docx' ? docs.docxText(bytes)
      : ext === 'odt' ? docs.odtText(bytes)
      : ext === 'pdf' ? await docs.pdfText(bytes)
      : ext === 'rtf' ? docs.rtfText(raw)
      : docs.htmlText(raw)
    return newSource(name, text, file.name)
  }
  if (ext === 'json') {
    const json = JSON.parse(raw)
    if (Array.isArray(json.segments)) {
      const { text, segments } = parseWhisperJSON(json)
      return { ...newSource(name, text, file.name), segments }
    }
    throw new Error('This JSON file has no transcript segments.')
  }
  return newSource(name, raw.replace(/\r\n?/g, '\n'), file.name)
}

// ---------------------------------------------------------------------------
// Interview guide (Markdown)

/**
 * Reads question headings like "## C1 — Vantage · 2 min" with a blockquoted
 * prompt and bulleted probes. Top-level "# Core …" / "# Modules" sections
 * decide whether a question is core or part of a module.
 */
export function parseGuideMarkdown(md: string): GuideQuestion[] {
  const out: GuideQuestion[] = []
  let section = ''
  let cur: GuideQuestion | null = null
  const head = /^##\s+([A-Z]{1,3}\d{1,2}[a-z]?)\s*[—–:-]\s*(.+?)(?:\s*·\s*(\d+)\s*min)?\s*$/
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    if (/^#\s/.test(line)) { section = line.replace(/^#\s+/, '').replace(/·.*$/, '').trim(); cur = null; continue }
    const h = head.exec(line)
    if (h) {
      const key = h[1]
      const core = /core/i.test(section) || !/module/i.test(section)
      cur = {
        id: uid(), key, title: h[2].trim(), prompt: '', probes: [],
        module: core && !/^M\d/.test(key) ? '' : `${key} ${h[2].trim()}`,
        minutes: h[3] ? Number(h[3]) : null, codeIds: [],
      }
      out.push(cur)
      continue
    }
    if (/^##\s/.test(line)) { cur = null; continue }
    if (!cur) continue
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote && quote[1].trim()) {
      if (!cur.probes.length) cur.prompt = (cur.prompt + ' ' + quote[1].replace(/\*\*/g, '')).trim()
      else cur.probes.push(quote[1].replace(/\*\*/g, '').trim())
      continue
    }
    const item = /^\s*(?:[-*]|\d+\.|\*\*[a-z]\.\*\*)\s+(.+)$/.exec(line)
    if (item) cur.probes.push(item[1].replace(/\*\*/g, '').trim())
  }
  return out
}

/** Fallback for plain guides: one question per numbered or bulleted line. */
export function parseGuideLines(text: string): GuideQuestion[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const m = /^(?:([A-Z]{0,3}\d{1,2})[.)]?|[-*])\s+(.+)$/.exec(l)
    return {
      id: uid(), key: m?.[1] ? (/^\d/.test(m[1]) ? 'Q' + m[1] : m[1]) : 'Q' + (i + 1),
      title: (m?.[2] ?? l).slice(0, 80), prompt: m?.[2] ?? l, probes: [], module: '', minutes: null, codeIds: [],
    }
  })
}

// ---------------------------------------------------------------------------
// QualCoder project (data.qda SQLite)

type Row = Record<string, unknown>

async function sqliteTables(bytes: Uint8Array, names: string[]) {
  const initSqlJs = (await import('sql.js')).default
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const dbh = new SQL.Database(bytes)
  try {
    const present = new Set(
      (dbh.exec("select name from sqlite_master where type='table'")[0]?.values ?? []).map((r) => String(r[0])),
    )
    const out: Record<string, Row[]> = {}
    for (const n of names) {
      if (!present.has(n)) { out[n] = []; continue }
      const res = dbh.exec(`select * from "${n}"`)[0]
      out[n] = res ? res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]]))) : []
    }
    return { tables: out, present }
  } finally {
    dbh.close()
  }
}

const str = (v: unknown) => (v == null ? '' : String(v))

export async function importQualCoder(bytes: Uint8Array, name: string): Promise<Project> {
  const { tables: t, present } = await sqliteTables(bytes, [
    'project', 'source', 'code_name', 'code_cat', 'code_text', 'cases', 'case_text', 'attribute', 'journal', 'annotation',
  ])
  if (!present.has('code_name') || !present.has('source')) throw new Error('This SQLite file is not a QualCoder project.')
  const p = emptyProject(name)
  p.method = str(t.project[0]?.memo).slice(0, 2000)
  p.importNotes.push(`Imported from QualCoder (${t.code_name.length} codes, ${t.code_text.length} codings).`)

  // QualCoder categories become code groups; nested categories become parent codes.
  const catRows = t.code_cat
  const topOf = (catid: string): Row | undefined => {
    let row = catRows.find((c) => str(c.catid) === catid)
    let guard = 0
    while (row?.supercatid != null && guard++ < 20) row = catRows.find((c) => str(c.catid) === str(row!.supercatid))
    return row
  }
  const tops = catRows.filter((c) => c.supercatid == null)
  p.groups = tops.map((c, i): CodeGroup => ({
    id: 'g' + str(c.catid), name: str(c.name).replace(/\s{2,}/g, ' ').trim(),
    kind: guessGroupKind(str(c.name)), color: PALETTE[i % PALETTE.length], description: str(c.memo),
  }))
  const nested = catRows.filter((c) => c.supercatid != null)
  const codes: Code[] = nested.map((c) => ({
    id: 'cat' + str(c.catid), name: str(c.name), groupId: 'g' + str(topOf(str(c.catid))?.catid),
    parentId: tops.some((t2) => str(t2.catid) === str(c.supercatid)) ? null : 'cat' + str(c.supercatid),
    color: '#888888', ...splitDefinition(str(c.memo)),
  }))
  for (const c of t.code_name) {
    const top = c.catid != null ? topOf(str(c.catid)) : undefined
    const nestedParent = c.catid != null && nested.some((n) => str(n.catid) === str(c.catid)) ? 'cat' + str(c.catid) : null
    codes.push({
      id: str(c.cid), name: str(c.name).replace(/\s{2,}/g, '  ').trim(),
      groupId: top ? 'g' + str(top.catid) : null,
      parentId: c.supercid != null ? str(c.supercid) : nestedParent,
      color: str(c.color) || '#888888', ...splitDefinition(str(c.memo)),
    })
  }
  p.codes = codes
  p.rules = suggestedRules(p.groups)

  const owners = new Set<string>()
  const conv = new Map<string, (n: number) => number>()
  p.sources = t.source.filter((s) => s.fulltext != null).map((s) => {
    const src = newSource(str(s.name), str(s.fulltext), 'QualCoder')
    src.id = str(s.id)
    conv.set(src.id, codePointToUtf16(src.text))
    src.attributes = Object.fromEntries(
      t.attribute.filter((a) => a.attr_type === 'file' && str(a.id) === src.id).map((a) => [str(a.name), str(a.value)]),
    )
    src.status = 'coding'
    return src
  })
  const sourceIds = new Set(p.sources.map((s) => s.id))
  let dropped = 0
  p.codings = t.code_text.flatMap((c): Coding[] => {
    const sid = str(c.fid)
    const f = conv.get(sid)
    if (!f || !sourceIds.has(sid)) { dropped++; return [] }
    owners.add(str(c.owner))
    return [{
      id: 'qc' + str(c.ctid), sourceId: sid, codeId: str(c.cid), start: f(Number(c.pos0)), end: f(Number(c.pos1)),
      coder: str(c.owner) || 'Imported coder', memo: str(c.memo), important: !!c.important,
      status: 'accepted', createdAt: str(c.date) || now(),
    }]
  })
  if (dropped) p.importNotes.push(`${dropped} codings on non-text sources (images, audio, video) were not imported.`)
  if (owners.size) p.coder = [...owners][0]

  p.cases = t.cases.map((c) => ({
    id: 'case' + str(c.caseid), name: str(c.name),
    sourceIds: [...new Set(t.case_text.filter((l) => str(l.caseid) === str(c.caseid)).map((l) => str(l.fid)))],
    attributes: Object.fromEntries(
      t.attribute.filter((a) => a.attr_type === 'case' && str(a.id) === str(c.caseid)).map((a) => [str(a.name), str(a.value)]),
    ),
  }))
  if (!p.cases.length) p.cases = p.sources.map((s) => ({ id: uid(), name: s.name, sourceIds: [s.id], attributes: { ...s.attributes } }))

  p.memos = [
    ...t.journal.map((j): Memo => ({
      id: uid(), title: str(j.name), body: str(j.jentry), kind: 'journal', sourceId: null, codeId: null,
      start: null, end: null, author: str(j.owner), updatedAt: str(j.date) || now(),
    })),
    ...t.annotation.filter((a) => sourceIds.has(str(a.fid))).map((a): Memo => {
      const f = conv.get(str(a.fid))!
      return {
        id: uid(), title: 'Annotation', body: str(a.memo), kind: 'memo', sourceId: str(a.fid), codeId: null,
        start: f(Number(a.pos0)), end: f(Number(a.pos1)), author: str(a.owner), updatedAt: str(a.date) || now(),
      }
    }),
  ]
  // Code memos carry definitions; source memos become linked memos.
  for (const s of t.source) {
    if (str(s.memo).trim() && sourceIds.has(str(s.id))) {
      p.memos.push({ id: uid(), title: `About ${str(s.name)}`, body: str(s.memo), kind: 'memo', sourceId: str(s.id), codeId: null, start: null, end: null, author: str(s.owner), updatedAt: now() })
    }
  }
  return p
}

/**
 * QualCoder is read directly. Requal, RQDA, AQDA and Taguette databases go
 * through the original app's native importers (loaded on demand), then the
 * Research Weave v1 adapter.
 */
export async function importSQLiteProject(bytes: Uint8Array, name: string): Promise<Project> {
  const initSqlJs = (await import('sql.js')).default
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const dbh = new SQL.Database(bytes)
  let tables: string[]
  try {
    tables = (dbh.exec("select name from sqlite_master where type='table'")[0]?.values ?? []).map((r) => String(r[0]))
    if (tables.includes('code_name') && tables.includes('code_text')) { dbh.close(); return importQualCoder(bytes, name) }
    const native = await import('../../../src/native-project-import.mjs')
    const choices = native.nativeProjectChoices(dbh)
    const first = choices?.projects?.[0]
    const state = native.readNativeProject(dbh, first ? { projectId: first.id } : {})
    const p = importLegacyState(state, name)
    p.importNotes.push(`Imported from a ${choices?.format ?? 'native'} database${(choices?.projects?.length ?? 0) > 1 ? ` (first of ${choices?.projects.length} projects)` : ''}.`)
    return p
  } catch (e) {
    throw new Error(`This SQLite file isn't a project format I can read (QualCoder, Requal, RQDA, AQDA, Taguette). ${e instanceof Error ? e.message : ''}`)
  } finally {
    try { dbh.close() } catch { /* already closed */ }
  }
}

// ---------------------------------------------------------------------------
// Research Weave (previous app) export

interface LegacyTurn { start: number; end: number; speaker?: string; timeStart?: number; raw?: { words?: { word: string; start?: number; probability?: number }[] } }
interface LegacyDoc { id: string; name: string; text: string; attributes?: Record<string, unknown>; turns?: LegacyTurn[]; reviewStatus?: string }
interface LegacyState {
  name?: string; description?: string
  documents?: LegacyDoc[]
  codes?: { id: string; name: string; description?: string; color?: string; parentId?: string | null; categoryId?: string | null }[]
  categories?: { id: string; name: string; parentId?: string | null }[]
  codings?: { id: string; documentId: string; codeId: string; start: number; end: number; coder?: string; memo?: string; status?: string; date?: string; important?: boolean }[]
  cases?: { id: string; name: string; documentIds?: string[]; attributes?: Record<string, unknown> }[]
  memos?: { id: string; title?: string; content?: string; author?: string; date?: string; documentId?: string; start?: number; end?: number }[]
  journals?: { id: string; name?: string; content?: string; text?: string; coder?: string; date?: string }[]
  frameworkStudies?: { id: string; name?: string; researchQuestion?: string; method?: string; themes?: { id: string; title: string; interpretation?: string }[] }[]
  frameworkCells?: { studyId: string; documentId: string; themeId: string; summary?: string }[]
  extractions?: unknown[]
}

export function importLegacyState(state: LegacyState, fallbackName = 'Imported study'): Project {
  const p = emptyProject(state.name || fallbackName)
  p.importNotes.push('Imported from a Research Weave (v1) export.')
  const conv = new Map<string, (n: number) => number>()
  p.sources = (state.documents ?? []).map((d) => {
    const s = newSource(d.name, d.text ?? '', 'Research Weave v1')
    s.id = d.id
    const f = codePointToUtf16(s.text)
    conv.set(d.id, f)
    s.attributes = Object.fromEntries(Object.entries(d.attributes ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]))
    if (d.turns?.length) {
      s.segments = d.turns.map((t) => {
        const start = f(t.start)
        const end = f(t.end)
        const uncertain: [number, number][] = []
        const words: [number, number][] = []
        let cursor = start
        for (const w of t.raw?.words ?? []) {
          const word = w.word.trim()
          const at = word ? s.text.indexOf(word, cursor) : -1
          if (at < 0 || at > end) continue
          cursor = at + word.length
          if (w.start != null) words.push([at, w.start])
          if (w.probability != null && w.probability < 0.5) uncertain.push([at, at + word.length])
        }
        return { start, end, speaker: t.speaker && t.speaker !== 'Unassigned' ? t.speaker : '', time: t.timeStart ?? null, uncertain, words }
      })
      s.segments = mergeSegments(s.segments)
    }
    s.status = 'coding'
    return s
  })
  const groups = new Map<string, CodeGroup>()
  for (const [i, c] of (state.categories ?? []).filter((c) => !c.parentId).entries()) {
    groups.set(c.id, { id: c.id, name: c.name, kind: guessGroupKind(c.name), color: PALETTE[i % PALETTE.length] })
  }
  p.groups = [...groups.values()]
  if (!p.groups.length && state.codes?.length) {
    p.groups = [{ id: uid(), name: 'Codes', kind: 'substantive', color: PALETTE[0] }]
  }
  p.codes = (state.codes ?? []).map((c, i) => ({
    id: c.id, name: c.name, groupId: (c.categoryId && groups.has(c.categoryId) ? c.categoryId : p.groups[0]?.id) ?? null,
    parentId: c.parentId ?? null, color: c.color || PALETTE[i % PALETTE.length], ...splitDefinition(c.description ?? ''),
  }))
  p.rules = suggestedRules(p.groups)
  const sids = new Set(p.sources.map((s) => s.id))
  p.codings = (state.codings ?? []).filter((c) => sids.has(c.documentId)).map((c) => {
    const f = conv.get(c.documentId)!
    return {
      id: c.id, sourceId: c.documentId, codeId: c.codeId, start: f(c.start), end: f(c.end),
      coder: c.coder || 'Imported coder', memo: c.memo ?? '', important: !!c.important,
      status: c.status === 'accepted' || c.status === 'coded' || !c.status ? 'accepted' : 'suggested',
      createdAt: c.date || now(),
    }
  })
  const owners = [...new Set(p.codings.map((c) => c.coder))]
  if (owners.length) p.coder = owners[0]
  p.cases = (state.cases ?? []).map((c) => ({
    id: c.id, name: c.name, sourceIds: (c.documentIds ?? []).filter((d) => sids.has(d)),
    attributes: Object.fromEntries(Object.entries(c.attributes ?? {}).map(([k, v]) => [k, String(v)])),
  }))
  if (!p.cases.length) p.cases = p.sources.map((s) => ({ id: uid(), name: s.name, sourceIds: [s.id], attributes: {} }))
  p.memos = [
    ...(state.memos ?? []).map((m): Memo => ({
      id: m.id, title: m.title || 'Memo', body: m.content ?? '', kind: 'memo',
      sourceId: m.documentId && sids.has(m.documentId) ? m.documentId : null, codeId: null,
      start: m.start ?? null, end: m.end ?? null, author: m.author ?? '', updatedAt: m.date ?? now(),
    })),
    ...(state.journals ?? []).map((j): Memo => ({
      id: j.id, title: j.name || 'Journal', body: j.content ?? j.text ?? '', kind: 'journal', sourceId: null, codeId: null,
      start: null, end: null, author: j.coder ?? '', updatedAt: j.date ?? now(),
    })),
  ]
  const study = state.frameworkStudies?.[0]
  if (study) {
    p.question = study.researchQuestion ?? ''
    p.method = study.method ?? ''
    p.themes = (study.themes ?? []).map((t): Theme => ({ id: t.id, title: t.title, codeIds: [], interpretation: t.interpretation ?? '' }))
    for (const cell of state.frameworkCells ?? []) {
      if (cell.studyId !== study.id) continue
      const kase = p.cases.find((c) => c.sourceIds.includes(cell.documentId))
      if (kase && cell.summary) p.cells.push({ caseId: kase.id, themeId: cell.themeId, summary: cell.summary, pinned: [] })
    }
  }
  return p
}

/**
 * Joins consecutive sentence-level ASR segments from the same speaker into
 * readable turns. Unlabelled runs are capped so they still read as paragraphs.
 */
export function mergeSegments(segments: Segment[], cap = 700): Segment[] {
  const out: Segment[] = []
  for (const g of segments) {
    const prev = out[out.length - 1]
    if (prev && prev.speaker === g.speaker && (g.speaker || g.end - prev.start <= cap)) {
      prev.end = g.end
      prev.uncertain = [...(prev.uncertain ?? []), ...(g.uncertain ?? [])]
      prev.words = [...(prev.words ?? []), ...(g.words ?? [])]
    } else out.push({ ...g, uncertain: [...(g.uncertain ?? [])], words: [...(g.words ?? [])] })
  }
  return out
}

/** Native format of this app. */
function isProject(x: unknown): x is Project {
  return !!x && typeof x === 'object' && 'sources' in x && 'codings' in x && 'groups' in x
}

// ---------------------------------------------------------------------------
// Entry point for "Import" on the projects page

const SQLITE_MAGIC = 'SQLite format 3'

export async function importProjectFile(file: File): Promise<{ project: Project; guide?: GuideQuestion[]; media?: Record<string, import('./storage').StoredMedia> }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const base = file.name.replace(/(\.qda)?\.(zip|json|qda|sqlite|db)$/i, '')
  const head = strFromU8(bytes.slice(0, 16))
  if (head.startsWith(SQLITE_MAGIC)) return { project: await importSQLiteProject(bytes, base) }
  if (/\.qdpx$/i.test(file.name)) return { project: (await import('./refi')).importQDPX(bytes, base.replace(/\.qdpx$/i, '')) }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return importZip(bytes, base)
  const text = strFromU8(bytes)
  if (/\.(md|markdown)$/i.test(file.name)) {
    const p = emptyProject(base)
    p.guide = parseGuideMarkdown(text)
    return { project: p }
  }
  const json = JSON.parse(text)
  if (isProject(json)) return { project: { ...json, id: uid(), name: json.name } }
  if (json?.format && json.state) return { project: importLegacyState(json.state, base) }
  if (json?.documents && json?.codes) return { project: importLegacyState(json, base) }
  throw new Error('Unrecognised file. Import a QualCoder project, a Research Weave export, or a transcript.')
}

/**
 * Zip archives: QualCoder project folders (…/data.qda), Research Weave
 * exports (research-weave.json). Tolerates archives cut off before the end
 * by reading entries from their local headers.
 */
async function importZip(bytes: Uint8Array, base: string) {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, { filter: (f) => /(^|\/)(data\.qda|research-weave\.json|project\.json)$/.test(f.name) || /(^|\/)media\/[^/]+$/.test(f.name) })
  } catch {
    files = await recoverStreamedZip(bytes)
  }
  if (Object.keys(files).length === 0) {
    const all = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith('.qde') })
    if (Object.keys(all).length) return { project: (await import('./refi')).importQDPX(bytes, base) }
  }
  const qda = Object.keys(files).find((n) => n.endsWith('data.qda') && !/bkup|pre_/i.test(n)) ?? Object.keys(files).find((n) => n.endsWith('data.qda'))
  if (qda) return { project: await importQualCoder(files[qda], base) }
  const rw = Object.keys(files).find((n) => n.endsWith('research-weave.json') || n.endsWith('project.json'))
  if (rw) {
    const json = JSON.parse(strFromU8(files[rw]))
    if (isProject(json)) {
      // A study saved with its recordings: source ids are kept, so the recordings can be stored against them.
      const media = (await import('./bundle')).recordingsFrom(files, json)
      return { project: { ...json, id: uid() }, media }
    }
    return { project: importLegacyState(json.state ?? json, base) }
  }
  throw new Error('No QualCoder project or Research Weave export was found in this archive.')
}

/** Reads deflated entries from local headers when the central directory is missing. */
async function recoverStreamedZip(bytes: Uint8Array) {
  const out: Record<string, Uint8Array> = {}
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = 0
  while (pos + 30 < bytes.length && view.getUint32(pos, true) === 0x04034b50) {
    const flags = view.getUint16(pos + 6, true)
    const method = view.getUint16(pos + 8, true)
    let size = view.getUint32(pos + 18, true)
    const nameLen = view.getUint16(pos + 26, true)
    const extraLen = view.getUint16(pos + 28, true)
    const name = strFromU8(bytes.subarray(pos + 30, pos + 30 + nameLen))
    const dataStart = pos + 30 + nameLen + extraLen
    const wanted = /(^|\/)(data\.qda|research-weave\.json|project\.json)$/.test(name)
    if (flags & 8) {
      // Size unknown: find the next data descriptor signature.
      let q = dataStart
      for (;;) {
        q = indexOf(bytes, [0x50, 0x4b, 0x07, 0x08], q)
        if (q < 0) return out
        const csize = view.getUint32(q + 8, true)
        if (csize === q - dataStart || view.getUint32(q + 16, true) === 0x04034b50 || view.getUint32(q + 24, true) === 0x04034b50) { size = q - dataStart; break }
        q += 4
      }
    }
    if (wanted) {
      const chunk = bytes.subarray(dataStart, dataStart + size)
      out[name] = method === 8 ? inflateSync(chunk) : chunk.slice()
      if (Object.keys(out).some((n) => n.endsWith('research-weave.json') || n.endsWith('data.qda'))) return out
    }
    pos = dataStart + size
    if (flags & 8) pos += view.getUint32(pos, true) === 0x08074b50 ? 16 : 12
  }
  return out
}

function indexOf(hay: Uint8Array, needle: number[], from: number) {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

