import type { Project, Segment, Source, WordingCheck } from './types'
import { buildClaims, type Claim } from './claims'
import { segmentsOf, timeRange } from './model'

// Checking wording against the recording. A second machine transcription
// cannot replace listening, but where two transcriptions of the same passage
// disagree is where a listener should start.

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean)

/** Share of `a`'s words that appear, in order, in `b` (longest common subsequence over words). */
export function wordAgreement(a: string, b: string) {
  const x = words(a), y = words(b)
  if (!x.length) return 1
  let prev = new Array<number>(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array<number>(y.length + 1).fill(0)
    for (let j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    prev = cur
  }
  return prev[y.length] / x.length
}

interface WhisperLike { segments?: { text?: string; start?: number; end?: number; words?: { word?: string; start?: number }[] }[] }
type Clip = { start: number; end: number; second: string }

/**
 * Reads a second transcription for one source. Two shapes are accepted: a
 * Whisper-style JSON of the whole recording (segments with timed words), read
 * against each coded passage by time, or a list of passages already cut out
 * (`[{start, end, second}]`, offsets into the source text).
 */
export function wordingChecks(project: Project, source: Source, data: unknown, model = ''): WordingCheck[] {
  const spans = [...new Map(project.codings.filter((c) => c.sourceId === source.id && c.status === 'accepted').map((c) => [`${c.start}:${c.end}`, c])).values()]
  const make = (start: number, end: number, other: string): WordingCheck => ({ sourceId: source.id, start, end, other: other.trim(), agreement: wordAgreement(source.text.slice(start, end), other), model })
  if (Array.isArray(data)) {
    return (data as Clip[]).filter((c) => typeof c?.start === 'number' && typeof c.end === 'number' && typeof c.second === 'string' && c.end > c.start).map((c) => make(c.start, c.end, c.second))
  }
  const timed: { t: number; w: string }[] = []
  for (const s of (data as WhisperLike)?.segments ?? []) {
    if (s.words?.length) for (const w of s.words) { if (typeof w.start === 'number' && w.word) timed.push({ t: w.start, w: w.word.trim() }) }
    else if (typeof s.start === 'number' && s.text) {
      // No word timings: spread the segment's words evenly across it.
      const parts = s.text.trim().split(/\s+/)
      const dur = Math.max(0.1, (s.end ?? s.start + parts.length / 3) - s.start)
      parts.forEach((w, i) => timed.push({ t: s.start! + (dur * i) / parts.length, w }))
    }
  }
  if (!timed.length) throw new Error('No timed words or passages were found in that file.')
  const out: WordingCheck[] = []
  for (const c of spans) {
    const r = timeRange(source, c.start, c.end)
    if (!r) continue
    const heard = timed.filter((x) => x.t >= r[0] - 1 && x.t <= r[1] + 1).map((x) => x.w)
    // Too few words in that stretch means the other transcription does not cover the passage: no comparison beats a false alarm.
    if (heard.length >= words(source.text.slice(c.start, c.end)).length * 0.6) out.push(make(c.start, c.end, heard.join(' ')))
  }
  return out
}

export interface ListenItem {
  claim: Claim
  check: WordingCheck | null
  pinned: boolean
  uncertain: number
  verified: boolean
  /** Higher means listen sooner. */
  risk: number
  reasons: string[]
}

/** Coded passages in the order worth listening to: quoted evidence first, then where transcriptions disagree. */
export function listenQueue(project: Project, sourceId?: string): ListenItem[] {
  const pinned = new Set(project.cells.flatMap((c) => c.pinned))
  const checks = new Map(project.wordingChecks.map((c) => [`${c.sourceId}:${c.start}:${c.end}`, c]))
  const segs = new Map<string, Segment[]>(project.sources.map((s) => [s.id, segmentsOf(s)]))
  return buildClaims(project, { sourceId }).filter((c) => c.codings.some((x) => x.status === 'accepted')).map((claim) => {
    const accepted = claim.codings.filter((x) => x.status === 'accepted')
    const check = checks.get(claim.key) ?? null
    const isPinned = accepted.some((x) => pinned.has(x.id) || x.important)
    const uncertain = (segs.get(claim.sourceId) ?? []).reduce((n, g) => n + (g.uncertain ?? []).filter(([a, b]) => a < claim.end && b > claim.start).length, 0)
    const reasons: string[] = []
    if (isPinned) reasons.push('quoted as key evidence')
    if (check && check.agreement < 0.85) reasons.push(`transcriptions agree on ${Math.round(check.agreement * 100)}% of words`)
    if (uncertain) reasons.push(`${uncertain} low-confidence word${uncertain === 1 ? '' : 's'}`)
    return {
      claim, check, pinned: isPinned, uncertain, reasons,
      verified: accepted.every((x) => !!x.verifiedAt),
      risk: (isPinned ? 3 : 0) + (check ? (1 - check.agreement) * 6 : 0) + Math.min(2, uncertain * 0.5),
    }
  }).sort((a, b) => Number(a.verified) - Number(b.verified) || b.risk - a.risk || a.claim.start - b.claim.start)
}

// ---------------------------------------------------------------------------
// Speaker tracks

export interface SpeakerInterval { start: number; end: number; speaker: string }

/** Reads RTTM "SPEAKER file 1 start duration <NA> <NA> name <NA> <NA>" lines. */
export function parseRTTM(text: string): SpeakerInterval[] {
  const out: SpeakerInterval[] = []
  for (const line of text.split(/\r?\n/)) {
    const f = line.trim().split(/\s+/)
    if (f[0] !== 'SPEAKER' || f.length < 8) continue
    const start = Number(f[3]), dur = Number(f[4])
    if (Number.isFinite(start) && Number.isFinite(dur) && dur > 0) out.push({ start, end: start + dur, speaker: f[7] })
  }
  return out.sort((a, b) => a.start - b.start)
}

/**
 * Lays a speaker track over a source that has word timings: each word takes
 * the speaker whose interval covers it, and a turn is split wherever the
 * speaker changes inside it. Text and coding offsets do not move.
 */
export function applySpeakerTrack(source: Source, track: SpeakerInterval[]): { segments: Segment[]; changed: number; splits: number } {
  if (!source.segments?.length) throw new Error('This source has no timed turns to lay a speaker track over. Re-import it from a transcript with word timings.')
  const at = (t: number) => {
    let best: SpeakerInterval | undefined
    for (const i of track) { if (i.start > t) break; if (i.end >= t) best = i }
    return best?.speaker
  }
  const out: Segment[] = []
  let changed = 0, splits = 0
  for (const seg of source.segments) {
    const ws = seg.words ?? []
    if (!ws.length) {
      const sp = seg.time != null ? at(seg.time + 0.2) : undefined
      if (sp && sp !== seg.speaker) changed++
      out.push(sp ? { ...seg, speaker: sp } : seg)
      continue
    }
    // Runs of words with one speaker; a word no interval covers stays with the run before it.
    const runs: { from: number; speaker: string }[] = []
    let cur = ''
    ws.forEach(([, t], i) => {
      const sp = at(t) ?? cur ?? seg.speaker
      if (i === 0 || sp !== cur) { runs.push({ from: i, speaker: sp || seg.speaker }); cur = sp || seg.speaker }
    })
    // Ignore one- or two-word flickers: they are almost always boundary noise.
    const kept = runs.filter((r, i) => (runs[i + 1]?.from ?? ws.length) - r.from > 2 || runs.length === 1)
    const use = kept.length ? kept : [{ from: 0, speaker: seg.speaker }]
    use.forEach((r, i) => {
      const start = i === 0 ? seg.start : ws[r.from][0]
      const end = i + 1 < use.length ? ws[use[i + 1].from][0] : seg.end
      if (r.speaker !== seg.speaker) changed++
      out.push({
        start, end: trimEnd(source.text, start, end), speaker: r.speaker, time: i === 0 ? seg.time : ws[r.from][1],
        words: ws.filter(([o]) => o >= start && o < end), uncertain: seg.uncertain?.filter(([a]) => a >= start && a < end),
      })
    })
    splits += use.length - 1
  }
  return { segments: out, changed, splits }
}

function trimEnd(text: string, start: number, end: number) {
  while (end > start && /\s/.test(text[end - 1])) end--
  return end
}

/** Splits one turn so that `[start, end)` becomes its own turn with `speaker`. */
export function splitSegments(source: Source, start: number, end: number, speaker: string): Segment[] | null {
  const segs = source.segments
  if (!segs?.length) return null
  const i = segs.findIndex((g) => g.start <= start && g.end >= end)
  if (i < 0) return null
  const seg = segs[i]
  const piece = (a: number, b: number, sp: string): Segment | null => {
    while (a < b && /\s/.test(source.text[a])) a++
    b = trimEnd(source.text, a, b)
    if (b <= a) return null
    const ws = seg.words?.filter(([o]) => o >= a && o < b)
    return { start: a, end: b, speaker: sp, time: a === seg.start ? seg.time : ws?.[0]?.[1] ?? seg.time, words: ws, uncertain: seg.uncertain?.filter(([x]) => x >= a && x < b) }
  }
  const parts = [piece(seg.start, start, seg.speaker), piece(start, end, speaker), piece(end, seg.end, seg.speaker)].filter((p): p is Segment => !!p)
  return [...segs.slice(0, i), ...parts, ...segs.slice(i + 1)]
}
