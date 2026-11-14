import type { NameEntry, NameKind, NameRole, Project, Source, SpeakerRef } from './types'
import { segmentsOf } from './model'

// Names across a study: finding the people, organisations and places a
// transcript mentions, keeping every spelling of each together, and masking
// them in what leaves the app (reports, quotes, CSV exports).

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A pattern for one spelling: whole words only, either apostrophe, any run of spaces. */
function spellingPattern(spelling: string) {
  return escapeRe(spelling.trim()).replace(/['’]/g, "['’]").replace(/\s+/g, '\\s+')
}

export interface NameHit { start: number; end: number; entry: NameEntry; text: string }

/**
 * Every mention of every registered name in a text, longest spellings first so
 * "Jo Ames" wins over "Jo", without overlaps.
 */
export function findNames(text: string, entries: NameEntry[]): NameHit[] {
  // A spelling with a title ("Dr. Lena Ortiz") also matches without it ("Lena Ortiz").
  const withoutTitle = (v: string) => v.replace(/^(dr|mr|mrs|ms|prof|professor|doctor|president|chief|mayor|premier|minister|chancellor)\.?\s+(?=\p{Lu})/iu, '')
  const spellings = entries.flatMap((entry) => [...new Set([entry.name, ...entry.variants].map((v) => v.trim()).filter(Boolean).flatMap((v) => [v, withoutTitle(v)]))].map((v) => ({ v, entry })))
    .sort((a, b) => b.v.length - a.v.length)
  const taken: NameHit[] = []
  for (const { v, entry } of spellings) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${spellingPattern(v)}(?![\\p{L}\\p{N}])`, entry.caseSensitive ? 'gu' : 'giu')
    for (const m of text.matchAll(re)) {
      const start = m.index!, end = start + m[0].length
      if (taken.some((h) => h.start < end && h.end > start)) continue
      taken.push({ start, end, entry, text: m[0] })
    }
  }
  return taken.sort((a, b) => a.start - b.start)
}

/** Replaces masked names with their stand-ins. With `html`, also matches names whose "&" was escaped. */
export function maskNames(text: string, entries: NameEntry[], opts: { html?: boolean } = {}): string {
  const masked = entries.filter((e) => e.mask && e.replacement.trim())
  if (!masked.length || !text) return text
  const list = opts.html
    ? masked.flatMap((e) => {
      const esc = (v: string) => v.replace(/&/g, '&amp;')
      const all = [e.name, ...e.variants]
      return all.some((v) => v.includes('&')) ? [e, { ...e, name: esc(e.name), variants: e.variants.map(esc) }] : [e]
    })
    : masked
  let out = ''
  let last = 0
  for (const h of findNames(text, list)) {
    out += text.slice(last, h.start) + h.entry.replacement.trim()
    last = h.end
  }
  return out + text.slice(last)
}

/** Text for an export: masked when the study is set to anonymise, as it is otherwise. */
export function forExport(project: Project, text: string, opts: { html?: boolean } = {}) {
  return project.anonymise ? maskNames(text, project.names ?? [], opts) : text
}

/** Mentions of each registered name, per source. */
export function nameCounts(project: Project): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>(project.names.map((e) => [e.id, new Map()]))
  for (const s of project.sources) {
    for (const h of findNames(s.text, project.names)) {
      const m = out.get(h.entry.id)!
      m.set(s.id, (m.get(s.id) ?? 0) + 1)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Finding candidates

/** Capitalised words that start sentences, fill speech or are common nouns, not names. */
const NOT_NAMES = new Set(`i i'm i've i'd i'll im ive id the a an and but or so if then than that this these those there here it it's its we we're we've you you're your yours they they're them their he she his her him my our us me mine ours what when where why how who whom which whose
okay ok yeah yep yes no not right well oh um uh uhm mm mm-hmm mhm hmm uh-huh like just also because as in on at for to of with from by into about over under after before since until while during through without within
thank thanks sorry sure absolutely exactly good great interesting fantastic alright hello hi hey wow cool perfect awesome nice fine
let let's do does did is are was were be been being am can could would should will shall may might must have has had having get got go going gone
all some any one two three four five six seven eight nine ten first second third last next other another every each many much more most few less least such same both either neither
now today tomorrow yesterday always never sometimes often maybe perhaps actually basically obviously certainly probably really very quite
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december
speaker interviewer respondent question answer part number section page okay. yes. no.
dr dr. mr mr. mrs mrs. ms ms. prof prof. professor doctor president chief mayor premier minister chancellor`.split(/\s+/))

const ORG_WORDS = /^(health|university|universities|college|foundation|centre|center|hospital|program|programme|services|service|council|society|institute|agency|trust|fund|group|company|corporation|inc|ltd|ministry|department|office|authority|school|network|hub|association|board|commission|clinic|lab|laboratory|bank|government|cancer|research|sciences|science|partners|nation|nations|band|tribal|products|journal|programs|programmes|project|pulp|forest|industries|resources|mining|mines|energy|press|media|tinto)$/i
/** Abbreviations that are common nouns, not names. */
const NOT_NAME_ACRONYMS = new Set('PHD MSC BSC MD CEO CFO COO VP IP MOU RNA DNA COVID HQP HQPS FTE RCT RCTS NMR PCR AI IT HR TV OK US UK EU ID PDF CV MRI CT ICU ER GP NP RN LPN'.split(' '))
const PLACE_NAMES = /^(bc|b\.c|canada|columbia|alberta|ontario|quebec|manitoba|saskatchewan|yukon|nunavut|america|africa|europe|asia|australia|england|scotland|ireland|india|china|japan|mexico|zealand|france|germany|norway|sweden|finland|iceland|alaska|toronto|montreal|vancouver|victoria|edmonton|calgary|ottawa|kelowna|winnipeg)$/i
const PLACE_WORDS = /^(fort|port|mount|mt|cape|lake|river|island|islands|valley|mountain|mountains|city|county|street|road|bay|creek|park|north|south|east|west|mainland|coast|region|district|town|village|landing|falls|harbour|harbor|inlet|peninsula)$/i
const TITLES = /^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|professor|doctor|president|chief|mayor|premier|minister|chancellor)$/i

export interface NameCandidate {
  text: string
  kind: NameKind
  /** Mentions per source id. */
  counts: Map<string, number>
  total: number
  /** A sample mention: source, offsets. None for a name known only from a title or speaker list. */
  sample: { sourceId: string; start: number; end: number } | null
  /** Why it was suggested. */
  reason: string
  /** Suggested stand-in. */
  replacement: string
  /** A registered name this looks like a spelling of. */
  partOf?: string
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu
const isCap = (w: string) => /^\p{Lu}/u.test(w)
const bare = (w: string) => w.replace(/[.'’]+$/, '').replace(/['’]s$/, '')

/** Guesses what kind of name a run of words is. */
export function guessKind(text: string, contexts: string[] = []): NameKind {
  const ws = text.split(/\s+/)
  if (TITLES.test(ws[0])) return 'person'
  if (ws.some((w) => ORG_WORDS.test(bare(w))) || /^[\p{Lu}]{2,6}$/u.test(text)) return 'organisation'
  if (ws.some((w) => PLACE_WORDS.test(bare(w)) || PLACE_NAMES.test(bare(w)))) return 'place'
  // Mostly said after "in", "from", "at": a place. ("to" also comes before people: "talk to Okafor".)
  const placed = contexts.filter((c) => /\b(in|from|at|near|around|across)\s*$/i.test(c)).length
  if (contexts.length && placed / contexts.length >= 0.5) return 'place'
  if (ws.length >= 2 && ws.length <= 3 && ws.every((w) => isCap(w))) return 'person'
  return 'other'
}

/**
 * Suggests names the register does not yet hold: speakers' display names and
 * names in source titles first, then runs of capitalised words that are not
 * merely starting a sentence. Each comes with mentions per source.
 */
export function nameCandidates(project: Project, limit = 200): NameCandidate[] {
  const known = new Set(project.names.flatMap((e) => [e.name, ...e.variants]).map((v) => v.toLowerCase()))
  const dismissed = new Set((project.notNames ?? []).map((v) => v.toLowerCase()))
  const found = new Map<string, { reason: string; kind?: NameKind; replacement?: string; mid: number; contexts: string[] }>()
  const note = (text: string, reason: string, extra: { kind?: NameKind; replacement?: string; mid?: boolean; context?: string } = {}) => {
    const t = text.trim()
    if (t.length < 2 || known.has(t.toLowerCase()) || dismissed.has(t.toLowerCase())) return
    const cur = found.get(t) ?? { reason, mid: 0, contexts: [] }
    if (extra.kind) { cur.kind = extra.kind; cur.reason = reason }
    if (extra.replacement) cur.replacement = extra.replacement
    if (extra.mid) cur.mid++
    if (extra.context != null && cur.contexts.length < 12) cur.contexts.push(extra.context)
    found.set(t, cur)
  }

  // People the study already knows: speakers' names and names in source titles.
  for (const s of project.sources) {
    const rid = s.attributes['Respondent ID']?.trim() || s.name.split(' — ')[0].trim()
    const paren = /\(([^)]+)\)\s*$/.exec(s.name)?.[1]
    if (paren && /^\p{Lu}[\p{L}'’-]+(\s+\p{Lu}[\p{L}'’-]+)+$/u.test(paren.trim())) note(paren, `named in the title of ${rid}`, { kind: 'person', replacement: `[${rid}]` })
    for (const sp of s.speakers) {
      if (sp.name && /^\p{Lu}[\p{L}'’-]+\s+\p{Lu}/u.test(sp.name) && !/^(lead|colleague|interviewer|speaker|observer|respondent)\b/i.test(sp.name)) note(sp.name, `speaker in ${rid}`, { kind: 'person' })
    }
  }

  for (const s of project.sources) scanSource(s, (run, mid, context) => note(run, mid ? 'capitalised mid-sentence' : 'capitalised', { mid, context }))

  // How often each word is written in lower case: a single capitalised word that the transcripts
  // mostly write in lower case ("Totally", "Northern", "Health") is a word, not a name.
  const lower = new Map<string, number>()
  for (const src of project.sources) for (const m of src.text.matchAll(WORD)) if (!isCap(m[0])) lower.set(bare(m[0]), (lower.get(bare(m[0])) ?? 0) + 1)

  const kept = [...found].filter(([text, f]) => {
    if (f.kind) return true
    const ws = text.split(' ')
    if (ws.length === 1 && f.mid === 0) return false
    if (ws.some((w) => /^\p{Lu}$/u.test(w))) return false
    if (/^R\d+$/.test(text) || NOT_NAME_ACRONYMS.has(text.toUpperCase().replace(/S$/, '')) || NOT_NAME_ACRONYMS.has(text.toUpperCase())) return false
    return true
  })
  // Each mention counts for the longest suggestion that covers it, so "Port" is not counted inside "Port Ellis".
  const probes: NameEntry[] = kept.map(([text]) => ({ id: text, name: text, variants: [], kind: 'other', replacement: '', mask: false, caseSensitive: true, note: '' }))
  const counts = new Map<string, Map<string, number>>()
  const samples = new Map<string, NameCandidate['sample']>()
  for (const src of project.sources) {
    for (const h of findNames(src.text, probes)) {
      const m = counts.get(h.entry.id) ?? new Map<string, number>()
      m.set(src.id, (m.get(src.id) ?? 0) + 1)
      counts.set(h.entry.id, m)
      if (!samples.has(h.entry.id)) samples.set(h.entry.id, { sourceId: src.id, start: h.start, end: h.end })
    }
  }
  const out: NameCandidate[] = []
  for (const [text, f] of kept) {
    const sample = samples.get(text) ?? null
    // Names from source titles and speaker lists stay even when the transcript never says them in full.
    if (!sample && !f.kind) continue
    const per = counts.get(text) ?? new Map<string, number>()
    const total = [...per.values()].reduce((a, b) => a + b, 0)
    if (!f.kind && !text.includes(' ') && (lower.get(text.toLowerCase()) ?? 0) >= total) continue
    const kind = f.kind ?? guessKind(text, f.contexts)
    // A registered person whose spelling this contains or is part of: "Jo" or "Dr. Jo Ames" for "Jo Ames".
    const tw = text.split(/\s+/)
    const partOf = project.names.find((e) => e.kind === 'person' && [e.name, ...e.variants].some((v) => {
      const vw = v.split(/\s+/)
      return vw.includes(text) || (tw.length > vw.length && vw.every((w) => tw.includes(w)))
    }))?.id
    out.push({ text, kind, counts: per, total, sample, reason: f.reason, replacement: f.replacement ?? '', partOf })
  }
  // People the study already knows first, then people, unclassified names (often first names), places, organisations.
  const order: Record<NameKind, number> = { person: 1, other: 2, place: 3, organisation: 4 }
  const rank = (c: NameCandidate) => (c.replacement ? 0 : order[c.kind])
  return out.sort((a, b) => rank(a) - rank(b) || b.total - a.total || a.text.localeCompare(b.text)).slice(0, limit)
}

/** Calls `onRun` with each run of capitalised words in a source, and whether it is mid-sentence. */
function scanSource(source: Source, onRun: (run: string, midSentence: boolean, before: string) => void) {
  for (const seg of segmentsOf(source)) {
    const text = source.text.slice(seg.start, seg.end)
    const words = [...text.matchAll(WORD)].map((m) => ({ w: m[0], at: m.index! }))
    let i = 0
    while (i < words.length) {
      if (!isCap(words[i].w) || NOT_NAMES.has(bare(words[i].w).toLowerCase()) && !TITLES.test(words[i].w)) { i++; continue }
      // Extend over capitalised words, allowing "of", "de", "van" inside ("University of Northern British Columbia").
      let j = i + 1
      while (j < words.length && j - i < 6) {
        const w = words[j].w
        const gap = text.slice(words[j - 1].at + words[j - 1].w.length, words[j].at)
        const prevWord = words[j - 1].w
        // A full stop ends the run, except after a title or an initial ("Dr. Lee", "J. Smith", "St. John").
        const stop = /\.$/.test(prevWord) && !TITLES.test(prevWord) && !/^(\p{Lu}|St|Mt|Ft)\.$/u.test(prevWord)
        if (/[.,;:!?]/.test(gap) || /[,;:!?]$/.test(prevWord) || stop) break
        if (isCap(w) && !NOT_NAMES.has(bare(w).toLowerCase())) { j++; continue }
        if (/^(of|de|van|von|der|la|le|du|da|di)$/.test(w) && j + 1 < words.length && isCap(words[j + 1].w)) { j += 2; continue }
        break
      }
      // A title on its own is not a name.
      if (j - i === 1 && TITLES.test(words[i].w)) { i++; continue }
      const startAt = words[i].at
      const lastWord = words[j - 1]
      let run = text.slice(startAt, lastWord.at + lastWord.w.length).replace(/[.'’]+$/, '').replace(/['’]s$/, '').replace(/^(\p{Lu}\s+)+(?=\p{Lu}\p{L})/u, '')
      run = run.replace(/\s+/g, ' ')
      const before = text.slice(Math.max(0, startAt - 12), startAt)
      const mid = startAt > 0 && !/[.?!…]["”)]?\s*$/.test(text.slice(0, startAt))
      if (run.length >= 2 && !/^\p{N}/u.test(run)) onRun(run, mid, before)
      i = j
    }
  }
}

/**
 * Spellings to add with a new name. For a person of two or more words, the
 * surname on its own: memos and summaries often use it ("Ames said…"), and
 * masking the full name alone would leave it behind.
 */
export function defaultVariants(name: string, kind: NameKind): string[] {
  if (kind !== 'person') return []
  const words = name.replace(/^(dr|mr|mrs|ms|prof|professor|doctor|president|chief|mayor)\.?\s+/i, '').trim().split(/\s+/)
  const last = words[words.length - 1]
  return words.length >= 2 && /^\p{Lu}[\p{L}'’-]{2,}$/u.test(last) ? [last] : []
}

/** Next stand-in for a kind: "[Person 3]" after "[Person 2]". */
export function nextReplacement(project: Project, kind: NameKind) {
  const label = { person: 'Person', organisation: 'Organisation', place: 'Place', other: 'Name' }[kind]
  const used = project.names.map((e) => new RegExp(`^\\[${label} (\\d+)\\]$`).exec(e.replacement.trim())?.[1]).filter(Boolean).map(Number)
  return `[${label} ${used.length ? Math.max(...used) + 1 : 1}]`
}

/** Default for whether a kind of name is masked: people and unclassified names (often first names) are; organisations and places are a decision. */
export const MASK_BY_DEFAULT: Record<NameKind, boolean> = { person: true, organisation: false, place: false, other: true }

// ---------------------------------------------------------------------------
// Roles: who a name is in the study, and which speaker they are

export const ROLE_LABEL: Record<NameRole, string> = { participant: 'Participant', team: 'Research team', mentioned: 'Mentioned' }

const ROLE_STAND_IN = /^\[(?:R\d+|P\d+|Participant[^\]]*|Interviewer[^\]]*|Colleague[^\]]*|Team member[^\]]*|Lead[^\]]*)\]$/i

/** The role set on the entry, else the role of a linked speaker, else what its stand-in implies. Only people have roles. */
export function roleOf(project: Project, e: NameEntry): NameRole | null {
  if (e.kind !== 'person' && e.kind !== 'other') return null
  if (e.role) return e.role
  for (const ref of e.speakers ?? []) {
    const sp = project.sources.find((s) => s.id === ref.sourceId)?.speakers.find((x) => x.raw === ref.raw)
    if (sp?.role === 'respondent') return 'participant'
    if (sp?.role === 'interviewer' || sp?.role === 'observer') return 'team'
  }
  if (/^\[(?:R|P)\d+\]$/i.test(e.replacement.trim())) return 'participant'
  if (/^\[(?:Interviewer|Colleague|Team member|Lead)/i.test(e.replacement.trim())) return 'team'
  return e.kind === 'person' ? 'mentioned' : null
}

/** Every speaker in the study, for linking names to voices. */
export function speakerOptions(project: Project) {
  return project.sources.flatMap((s) => s.speakers.map((sp) => ({
    ref: { sourceId: s.id, raw: sp.raw },
    key: `${s.id}|${sp.raw}`,
    label: `${s.attributes['Respondent ID']?.trim() || s.name.split(' — ')[0]} · ${sp.name || sp.raw}`,
    role: sp.role,
  })))
}

/** A stand-in that says the role: [Team member 2], or the next [Person n] for someone mentioned. */
export function standInFor(project: Project, role: NameRole | null, kind: NameKind) {
  if (role === 'team') {
    const used = project.names.map((e) => /^\[Team member (\d+)\]$/.exec(e.replacement.trim())?.[1]).filter(Boolean).map(Number)
    return `[Team member ${used.length ? Math.max(...used) + 1 : 1}]`
  }
  if (role === 'participant') return '[Participant]'
  return nextReplacement(project, kind)
}

export interface NameIssue { id: string; text: string; entryIds: string[] }

/**
 * Problems that make an anonymised report misleading: different people sharing
 * one stand-in, a stand-in that claims a role the entry does not have, and the
 * same speaker linked to two names.
 */
export function nameIssues(project: Project): NameIssue[] {
  const out: NameIssue[] = []
  const masked = project.names.filter((e) => e.mask && e.replacement.trim())
  const byStandIn = new Map<string, NameEntry[]>()
  for (const e of masked) byStandIn.set(e.replacement.trim(), [...(byStandIn.get(e.replacement.trim()) ?? []), e])
  for (const [r, es] of byStandIn) if (es.length > 1) out.push({ id: `shared:${r}`, entryIds: es.map((e) => e.id), text: `${es.map((e) => e.name).join(', ')} all become ${r}. If they are different people, give each its own stand-in; if they are one person, make the others spellings of one entry.` })
  for (const e of masked) {
    const role = roleOf(project, e)
    if (ROLE_STAND_IN.test(e.replacement.trim()) && role === 'mentioned') out.push({ id: `role:${e.id}`, entryIds: [e.id], text: `${e.name} is masked as ${e.replacement}, which names a role, but is marked as someone mentioned. Use a neutral stand-in such as ${nextReplacement(project, 'person')}, or set the role.` })
  }
  const unlinked = masked.filter((e) => roleOf(project, e) === 'team' && !(e.speakers ?? []).length)
  if (unlinked.length) out.push({ id: 'link:team', entryIds: unlinked.map((e) => e.id), text: `Research team not linked to a speaker: ${unlinked.map((e) => e.name).join(', ')}. Link each under “speaks as” where you know which voice is theirs; leave it where the recording does not say.` })
  const seen = new Map<string, NameEntry>()
  for (const e of project.names) for (const ref of e.speakers ?? []) {
    const k = `${ref.sourceId}|${ref.raw}`
    const other = seen.get(k)
    if (other && other.id !== e.id) out.push({ id: `voice:${k}`, entryIds: [other.id, e.id], text: `${other.name} and ${e.name} are both linked to the same speaker in one interview.` })
    else seen.set(k, e)
  }
  return out
}

/**
 * Participants whose stand-in is a respondent ID ([R03]) and who are not yet
 * linked to a speaker: the respondent speaker of the interview with that ID.
 */
export function participantLinks(project: Project): { id: string; refs: SpeakerRef[] }[] {
  return project.names.flatMap((e) => {
    if (roleOf(project, e) !== 'participant' || (e.speakers ?? []).length) return []
    const rid = /^\[(R\d+|P\d+)\]$/i.exec(e.replacement.trim())?.[1]
    if (!rid) return []
    const refs = project.sources.filter((s) => (s.attributes['Respondent ID']?.trim() || s.name.split(' — ')[0]).toUpperCase() === rid.toUpperCase())
      .flatMap((s) => s.speakers.filter((sp) => sp.role === 'respondent').map((sp) => ({ sourceId: s.id, raw: sp.raw })))
    return refs.length ? [{ id: e.id, refs }] : []
  })
}
