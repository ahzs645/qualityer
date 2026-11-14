import type { AiRun, CoverageStatus, GroupKind, Project } from './types'
import {
  checkRules, codesInGroup, describeRule, findCorrections, formatTime, groupOf, indexBy, pendingSuggestions, quotable, segmentsOf, speakerOf, timeAt, toCSV,
} from './model'
import { CLAIM_STATE_LABEL, buildClaims, choiceGroups, confidenceBand, summariseDecisions } from './claims'
import { comparablePasses, compare, humanBaseline } from './compare'
import { turnsOf } from './ai/pipeline'
import { forExport } from './names'
import { buildProfile, cellKey, type ProfileCell } from './profile'

// The study report: one document a team can read, print or paste from. It is
// built from the project alone (no app state), as a self-contained HTML page
// and as Markdown. Wording from off-the-record passages is withheld.

export const REPORT_SECTIONS = [
  ['glance', 'At a glance'],
  ['sources', 'Sources'],
  ['coverage', 'Interview guide coverage'],
  ['perspectives', 'Participant perspectives'],
  ['framework', 'Framework matrix'],
  ['profile', 'Cases by domain'],
  ['codes', 'Code counts'],
  ['figures', 'Flagged figures'],
  ['ai', 'AI assistance and review'],
  ['open', 'Open items'],
  ['memos', 'Memos and journal'],
  ['codebook', 'Codebook'],
] as const
export type SectionId = (typeof REPORT_SECTIONS)[number][0]
export type Recipe = 'summary' | 'standard' | 'full'
export type ReportOptions = Record<SectionId, boolean> & {
  recipe: Recipe
  /** The Ask question whose answers make the "Participant perspectives" section; null takes the latest answered one. */
  askId: string | null
  /** Pinned quotes shown per framework cell. */
  quotesPerCell: number
  /** Evidence-grade and stance bars beside framework cells and in tables. */
  bars: boolean
  /** Sections as tabs (printing still shows them all). */
  tabs: boolean
}

const on = (...ids: SectionId[]) => Object.fromEntries(REPORT_SECTIONS.map(([id]) => [id, ids.includes(id)])) as Record<SectionId, boolean>

/**
 * Three ways to read the same study. The summary is for partners and funders:
 * what people said, one line per theme, one quote each. The standard report is
 * the analysis. The full audit adds the working record behind it.
 */
export const RECIPES: Record<Recipe, { label: string; description: string; options: Omit<ReportOptions, 'askId'> }> = {
  summary: {
    label: 'Summary', description: 'For partners: who was interviewed, what each said, the main findings by theme with one quote, and what is still open.',
    options: { ...on('glance', 'perspectives', 'framework', 'open'), recipe: 'summary', quotesPerCell: 1, bars: false, tabs: false },
  },
  standard: {
    label: 'Standard', description: 'The analysis: interviews and coverage, perspectives, the framework with its pinned evidence, cases by domain and flagged figures.',
    options: { ...on('glance', 'sources', 'coverage', 'perspectives', 'framework', 'profile', 'figures', 'open'), recipe: 'standard', quotesPerCell: 3, bars: true, tabs: true },
  },
  full: {
    label: 'Full audit', description: 'Everything, including code counts, the AI audit trail, memos and the codebook.',
    options: { ...on(...REPORT_SECTIONS.map(([id]) => id)), recipe: 'full', quotesPerCell: 99, bars: true, tabs: true },
  },
}
export const recipeOptions = (r: Recipe, askId: string | null = null): ReportOptions => ({ ...RECIPES[r].options, askId })
export const DEFAULT_REPORT: ReportOptions = recipeOptions('standard')

/** The answers to one Ask question, for the "Participant perspectives" section. */
export function perspectives(project: Project, askId: string | null) {
  const answered = (id: string) => project.askAnswers.some((a) => a.promptId === id)
  const prompt = (askId ? project.asks.find((a) => a.id === askId && answered(a.id)) : null)
    ?? [...project.asks].filter((a) => answered(a.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!prompt) return null
  const rows = project.sources.map((s) => {
    const a = project.askAnswers.find((x) => x.promptId === prompt.id && x.sourceId === s.id)
    if (!a) return null
    // The overall label, when the question asked for one ("Overall: supportive with conditions…").
    const label = /^\s*(?:\*\*)?overall(?: stance)?:?(?:\*\*)?\s*([^.\n]+?)(?:\.|\n|$)/i.exec(a.text)?.[1]?.replace(/\*\*/g, '').trim() ?? null
    const quotes = a.evidence.filter((e) => e.start != null && e.end != null).map((e) => ({ text: quotable(project, s, e.start!, e.end!), time: formatTime(timeAt(s, e.start!)) }))
    return { source: s, answer: a, label: label && label.length <= 60 ? label : null, quotes }
  }).filter((r): r is NonNullable<typeof r> => !!r)
  return { prompt, rows, models: [...new Set(rows.map((r) => r.answer.model))] }
}

const COVERAGE_TEXT: Record<CoverageStatus, string> = { unmarked: 'Not marked', answered: 'Answered', partial: 'Partly', 'no-view': 'Asked, no view', 'not-asked': 'Not asked' }
const EVIDENCE = ['#083f3c', '#176f69', '#2f9c92', '#6fc2b8']
const STANCE = ['#1c5cab', '#86b6ef', '#b5b3aa', '#ef9f9e', '#d03b3b']
const mixColor = (kind: GroupKind, i: number, n: number) => {
  const ramp = kind === 'stance' ? STANCE : EVIDENCE
  return n <= ramp.length ? ramp[Math.min(i, ramp.length - 1)] : ramp[Math.round((i / (n - 1)) * (ramp.length - 1))]
}
const tidy = (name: string) => name.replace(/\s{2,}/g, ' ').trim()
const short = (name: string) => name.trim().split(/\s{2,}/)[0]
const pc = (v: number) => `${Math.round(v * 100)}%`
const words = (t: string) => (t.match(/\S+/g) ?? []).length

/** Everything the report says, computed once and rendered twice. */
export function reportData(project: Project) {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const sources = indexBy(project.sources)
  const gOf = (codeId: string) => groupOf(codes.get(codeId), codes, groups)
  const claims = buildClaims(project)
  const accepted = project.codings.filter((c) => c.status === 'accepted')
  const violations = checkRules(project)
  const pending = pendingSuggestions(project)
  const profile = buildProfile(project)
  const choices = choiceGroups(project)

  const sourceRows = project.sources.map((s) => {
    const own = claims.filter((c) => c.sourceId === s.id && c.codings.some((x) => x.status === 'accepted'))
    const ai = own.filter((c) => c.ai)
    const segs = segmentsOf(s)
    const last = [...segs].reverse().find((g) => g.time != null)?.time ?? null
    const marks = project.coverage.filter((c) => c.sourceId === s.id)
    return {
      source: s, claims: own.length, aiDrafted: ai.length,
      checked: ai.filter((c) => c.state === 'checked').length,
      unchecked: own.filter((c) => c.state === 'unchecked').length,
      pending: pending.filter((c) => c.sourceId === s.id).length,
      words: words(s.text), duration: s.media?.duration ?? last,
      asked: marks.filter((m) => m.status === 'answered' || m.status === 'partial' || m.status === 'no-view').length,
      notAsked: project.guide.filter((q) => marks.some((m) => m.questionId === q.id && m.status === 'not-asked')).map((q) => q.key),
      restricted: project.restricted.filter((r) => r.sourceId === s.id).length,
    }
  })

  const coverage = project.guide.map((q) => ({
    question: q,
    marks: project.sources.map((s) => project.coverage.find((c) => c.sourceId === s.id && c.questionId === q.id) ?? { status: 'unmarked' as CoverageStatus, note: '' }),
  }))

  const framework = project.themes.map((t) => ({
    theme: t,
    cells: project.cases.map((k) => {
      const cell = project.cells.find((c) => c.caseId === k.id && c.themeId === t.id)
      const quotes = (cell?.pinned ?? []).map((id) => project.codings.find((c) => c.id === id)).filter((c) => !!c).map((c) => {
        const s = sources.get(c!.sourceId)
        return { text: quotable(project, s, c!.start, c!.end), time: s ? formatTime(timeAt(s, c!.start)) : '', code: tidy(codes.get(c!.codeId)?.name ?? '') }
      })
      return { case: k, summary: cell?.summary ?? '', quotes }
    }),
  })).filter((t) => t.cells.some((c) => c.summary || c.quotes.length))

  const codeCounts = profile.rows.map((g) => ({
    group: g,
    rows: codesInGroup(project, g.id).map((code) => ({
      code, counts: project.cases.map((k) => new Set(accepted.filter((c) => c.codeId === code.id && k.sourceIds.includes(c.sourceId)).map((c) => `${c.sourceId}:${c.start}:${c.end}`)).size),
    })).filter((r) => r.counts.some((n) => n > 0)),
  })).filter((g) => g.rows.length)

  const figures = accepted.filter((c) => gOf(c.codeId)?.kind === 'flag').map((c) => {
    const s = sources.get(c.sourceId)
    const row = project.extractions.find((e) => e.codingId === c.id)
    return { code: tidy(codes.get(c.codeId)?.name ?? ''), source: s?.name.split(' — ')[0] ?? '', time: s ? formatTime(timeAt(s, c.start)) : '', values: project.extractionFields.map((f) => row?.values[f] ?? ''), quote: quotable(project, s, c.start, c.end) }
  })

  // A calibration needs a person's coding made before the pass ran (see humanBaseline).
  const humanBefore = (sid: string, r: AiRun) => humanBaseline(project, sid, r)
  const calibrations = comparablePasses(project).map(({ run: r, sourceId: sid }) => {
    const asked = r.claims ? new Set(Object.values(r.claims).map(([a, b]) => `${a}:${b}`)) : null
    const result = compare(project, humanBefore(sid, r).filter((c) => !asked || asked.has(`${c.start}:${c.end}`)), project.codings.filter((c) => c.sourceId === sid && c.origin?.runId === r.id), choices.map((c) => c.group.id))
    return { run: r, source: sources.get(sid)!, result }
  })

  const reviews = project.sources.filter((s) => project.reviewLog.some((e) => e.sourceId === s.id && e.ai)).map((s) => ({
    source: s, summary: summariseDecisions(project, s.id),
    reviewers: [...new Set(project.reviewLog.filter((e) => e.sourceId === s.id && e.action !== 'endorse').map((e) => e.by))],
    endorsers: [...new Set(project.reviewLog.filter((e) => e.sourceId === s.id && e.action === 'endorse').map((e) => e.by))],
  }))

  const corrections = project.sources.reduce((n, s) => n + findCorrections(s.text, project.glossary).length, 0)
  const uncertain = project.sources.reduce((n, s) => n + (s.segments ?? []).reduce((k, g) => k + (g.uncertain?.length ?? 0), 0), 0)
  const aiClaims = claims.filter((c) => c.ai && c.state !== 'pending')
  return {
    project, codes, groups, sources, claims, accepted, violations, pending, profile, choices, sourceRows, coverage, framework, codeCounts, figures, calibrations, reviews, corrections, uncertain,
    usedCodes: new Set(accepted.map((c) => c.codeId)).size,
    aiClaims: aiClaims.length,
    aiChecked: aiClaims.filter((c) => c.state === 'checked').length,
    codedClaims: claims.filter((c) => c.codings.some((x) => x.status === 'accepted')).length,
  }
}
type Data = ReturnType<typeof reportData>

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

/** True when the study was changed more than a minute after it was signed off. */
export const editedSinceSignOff = (p: Project) => !!p.signoff && new Date(p.updatedAt).getTime() - new Date(p.signoff.at).getTime() > 60_000

/**
 * What has to be settled before the analysis can be signed off as final. Things
 * no reviewer can settle from the app (listening to recordings, questions not
 * asked) do not block; they become the report's limitations.
 */
export function signOffBlockers(project: Project): string[] {
  const d = reportData(project)
  const out: string[] = []
  if (d.pending.length) out.push(`${d.pending.length} AI suggestions have not been decided.`)
  if (d.violations.length) out.push(`${d.violations.length} codebook rule issues are open.`)
  const unchecked = d.sourceRows.reduce((n, r) => n + r.unchecked, 0)
  if (unchecked) out.push(`${unchecked} AI-drafted claims were accepted without being checked claim by claim.`)
  const open = project.candidates.filter((c) => c.status === 'open').length
  if (open) out.push(`${open} candidate code${open === 1 ? '' : 's'} await a decision.`)
  const notDone = project.sources.filter((s) => s.status !== 'done')
  if (notDone.length) out.push(`${notDone.length} source${notDone.length === 1 ? ' is' : 's are'} not marked done: ${notDone.map((s) => s.name.split(' — ')[0]).join(', ')}.`)
  const unmarked = d.coverage.reduce((n, row) => n + row.marks.filter((m) => m.status === 'unmarked').length, 0)
  if (unmarked) out.push(`${unmarked} guide questions have no coverage mark.`)
  if (d.corrections) out.push(`${d.corrections} glossary corrections are waiting to be applied.`)
  return out
}

function statusLine(d: Data) {
  const so = d.project.signoff
  if (so) {
    const who = so.role === 'ai'
      ? `${so.by}, an AI acting as the human reviewer. No person has signed off this analysis`
      : so.by
    return `Final: signed off on ${longDate(so.at)} by ${who}.${editedSinceSignOff(d.project) ? ' The study has been edited since then.' : ''}`
  }
  const parts: string[] = []
  if (d.aiClaims) parts.push(`${d.aiChecked} of ${d.aiClaims} AI-drafted claims have been checked by ${d.project.coder}`)
  if (d.pending.length) parts.push(`${d.pending.length} AI suggestions still need a decision`)
  if (d.violations.length) parts.push(`${d.violations.length} codebook rule issues are open`)
  return parts.length ? `Working draft: ${parts.join('; ')}.` : 'All coded claims have been reviewed and meet the codebook rules.'
}

/** What became of an AI pass, for the audit table. */
function runUse(d: Data, runId: string, comparisonOnly: boolean) {
  if (d.project.aiRuns.find((r) => r.id === runId)?.kind === 'grades') return comparisonOnly ? 'Held-out test of evidence grade and stance' : 'Grades on existing claims'
  if (comparisonOnly) return 'Comparison with a human coder only'
  const left = d.project.codings.filter((c) => c.origin?.runId === runId)
  const decided = d.project.reviewLog.some((e) => e.runId === runId)
  if (!left.length && !decided) return 'Superseded; none of its suggestions were kept'
  const waiting = left.filter((c) => c.status === 'suggested').length
  return waiting ? `In review: ${waiting} suggestions undecided` : 'Reviewed claim by claim'
}

// ---------------------------------------------------------------------------
// HTML

const anonymised = (p: Project) => p.anonymise && (p.names ?? []).some((e) => e.mask)
const ANON_NOTE = 'Names are anonymised: people and other masked names in quotes, titles, summaries and memos are replaced by stand-ins such as [R01] or [Person 1].'

/** Tag colour for an overall label such as "supportive with conditions". */
const labelTone = (label: string) => /oppos|scepti|skepti/i.test(label) ? 'not-asked' : /mixed|cautio/i.test(label) ? 'partial' : /enthusias/i.test(label) ? 'answered' : 'no-view'

/** The case (or respondent ID) a source belongs to. */
const caseOf = (project: Project, sourceId: string) => project.cases.find((k) => k.sourceIds.includes(sourceId))?.name ?? project.sources.find((x) => x.id === sourceId)?.name.split(' — ')[0] ?? ''

/** The first sentences of a summary, marked when cut. */
export function firstSentences(text: string, n: number) {
  const parts = text.replace(/\s*\(Drafted by[^)]*\)\s*$/i, '').match(/[^.!?]+[.!?]+["”')]*\s*/g)
  if (!parts || parts.length <= n) return text
  return parts.slice(0, n).join('').trim() + ' …'
}

/** An AI answer as HTML: bullet runs become lists, **bold**, and turn ids [T0042] become times. */
function answerHTML(text: string, turnTimes: Map<string, number | null>) {
  const inline = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[(T\d{4})(?:[,–-]\s*T?\d{4})*\]/g, (_, id) => { const tm = turnTimes.get(id); return tm != null ? `<small>(${formatTime(tm)})</small>` : '' })
  const out: string[] = []
  let list: string[] = []
  const flush = () => { if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = [] }
  for (const line of text.split('\n')) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (m) { list.push(m[1]); continue }
    flush()
    if (line.trim()) out.push(`<p>${inline(line.trim())}</p>`)
  }
  flush()
  return out.join('')
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const para = (s: string) => esc(s).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')

function mixBar(cell: ProfileCell | undefined) {
  if (!cell?.claims.length) return ''
  return cell.mixes.map((m) => `<div class="mix" title="${esc(m.group.name)}: ${esc(m.parts.filter((p) => p.n).map((p) => `${short(p.code.name)} ${p.n}`).join(', '))}"><span class="mixl">${esc(m.group.name.replace(/^[A-Z]{1,2}\s+/, ''))}</span><span class="bar">${
    m.parts.map((p, i) => (p.n ? `<i style="width:${(p.n / Math.max(1, m.total)) * 100}%;background:${mixColor(m.group.kind, i, m.parts.length)}"></i>` : '')).join('')
  }</span><span class="mixn">${esc(m.parts.filter((p) => p.n).map((p) => `${short(p.code.name)} ${p.n}`).join(' · '))}</span></div>`).join('')
}

const CSS = `
:root{--ink:#1d2221;--muted:#5d6662;--line:#dedcd4;--soft:#f4f3ef;--accent:#1f6f6b}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:60rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1{font-size:1.7rem;line-height:1.25;margin:0 0 .4rem;text-wrap:balance}
h2{font-size:1.2rem;margin:2.6rem 0 .7rem;padding-top:1rem;border-top:1px solid var(--line)}
h3{font-size:1rem;margin:1.5rem 0 .4rem}
p{margin:.5rem 0}
.lede{font-size:1.05rem;max-width:46rem}
.meta,.note,figcaption,small{color:var(--muted);font-size:.86rem}
.status{background:#fbf0d9;border-radius:6px;padding:.6rem .85rem;margin:1rem 0;color:#6b4700}.status.final{background:#e3f2e6;color:#1f5c2d}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.6rem;margin:1rem 0}
.tile{border:1px solid var(--line);border-radius:8px;padding:.6rem .8rem}
.tile b{display:block;font-size:1.5rem;line-height:1.2}
.tile span{color:var(--muted);font-size:.8rem}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.88rem;margin:.6rem 0}
th,td{border-bottom:1px solid var(--line);padding:.4rem .55rem;text-align:left;vertical-align:top}
th{font-weight:600;color:var(--muted);font-size:.8rem}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
blockquote{margin:.45rem 0;padding:.1rem 0 .1rem .8rem;border-left:3px solid var(--line);font-family:Georgia,"Iowan Old Style",serif}
blockquote small{font-family:system-ui,sans-serif}
.cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr));gap:1rem}
.cell{border:1px solid var(--line);border-radius:8px;padding:.7rem .9rem;break-inside:avoid}
.cell h4{margin:0 0 .3rem;font-size:.9rem}
.mix{display:grid;grid-template-columns:4.6rem 1fr;gap:.15rem .5rem;align-items:center;margin:.3rem 0;font-size:.74rem;color:var(--muted)}
.mix .bar{display:flex;gap:2px;height:9px}.mix .bar i{display:block;height:100%;border-radius:2px}
.mix .mixn{grid-column:2}
.legend{display:flex;flex-wrap:wrap;gap:.3rem 1rem;font-size:.8rem;color:var(--muted);margin:.5rem 0}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:.3rem;vertical-align:-1px}
.tag{display:inline-block;border-radius:4px;padding:0 .35rem;font-size:.78rem;background:var(--soft);white-space:nowrap}
.tag.answered{background:#e3f2e6;color:#1f5c2d}.tag.partial{background:#fbf0d9;color:#6b4700}.tag.not-asked{background:#fbe7e2;color:#8f2f1d}.tag.no-view{background:#e2f0ee;color:#1f6f6b}
.memo{white-space:pre-wrap;border:1px solid var(--line);border-radius:8px;padding:.7rem .9rem;margin:.6rem 0;font-size:.9rem}
ul{padding-left:1.2rem;margin:.4rem 0}
.rows .row{border-top:1px solid var(--line);padding:.5rem 0;display:grid;grid-template-columns:6rem 1fr;gap:.2rem 1rem}
.rows .row h4{margin:.1rem 0;font-size:.9rem}.rows .row>*:not(h4){grid-column:2}
.tabr{position:absolute;opacity:0;pointer-events:none}
nav.tabs{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:.1rem;margin:1.6rem 0 0;border-bottom:1px solid var(--line);background:#fff}
nav.tabs label{padding:.55rem .8rem;margin-bottom:-1px;border-bottom:2px solid transparent;color:var(--muted);font-size:.9rem;cursor:pointer}
nav.tabs label:hover{color:var(--ink)}
.panel{display:none}.panel>h2:first-child{border-top:0;margin-top:1.2rem;padding-top:0}
details summary{cursor:pointer;margin:.4rem 0}
@media print{main{padding:0;max-width:none}h2{break-after:avoid}.cell,tr,blockquote,.memo,.row{break-inside:avoid}body{font-size:11pt}nav.tabs{display:none}.panel{display:block!important}.panel>h2:first-child{border-top:1px solid var(--line)}details{display:block}details>*{display:block}}
`

export function reportHTML(project: Project, opts: ReportOptions = DEFAULT_REPORT, generatedAt = new Date()): string {
  const d = reportData(project)
  const head: string[] = []
  const sections: { id: string; label: string; body: string[] }[] = []
  let cur = head
  const h = (s: string) => cur.push(s)
  /** Starts a section; with tabs on, each section is a tab. */
  const begin = (id: string, label: string) => { const sec = { id, label, body: [] as string[] }; sections.push(sec); cur = sec.body }
  const caseNames = project.cases.map((k) => k.name)
  const persp = opts.perspectives ? perspectives(project, opts.askId) : null

  h(`<h1>${esc(project.name)}</h1>`)
  if (project.question) h(`<p class="lede">${esc(project.question)}</p>`)
  h(`<p class="meta">Analysis report${project.signoff ? ' · final' : ''} · generated ${esc(generatedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))} · reviewer ${esc(project.coder)}</p>`)
  if (anonymised(project)) h(`<p class="note">${esc(ANON_NOTE)}</p>`)
  if (project.method && opts.recipe !== 'summary') h(`<p class="meta">${esc(project.method)}</p>`)
  h(`<p class="status${project.signoff ? ' final' : ''}">${esc(statusLine(d))}</p>${project.signoff?.note ? `<p class="meta">Sign-off note: ${esc(project.signoff.note)}</p>` : ''}`)

  if (opts.glance) {
    h(`<div class="tiles">${[
      [project.sources.length, 'interviews'], [d.codedClaims, 'coded claims'], [`${d.usedCodes} of ${project.codes.length}`, 'codes used'],
      [d.aiClaims ? pc(d.aiChecked / d.aiClaims) : '—', 'of AI-drafted claims checked by the reviewer'], [d.violations.length, 'rule issues open'], [d.pending.length, 'suggestions undecided'],
    ].map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`)
  }

  if (opts.sources || (opts.coverage && d.coverage.length)) begin('interviews', 'Interviews')
  if (opts.sources) {
    h('<h2>Sources</h2><div class="scroll"><table><thead><tr><th>Interview</th><th class="n">Length</th><th class="n">Words</th><th class="n">Coded claims</th><th class="n">AI-drafted</th><th class="n">Checked by the reviewer</th><th>Guide questions not asked</th></tr></thead><tbody>')
    for (const r of d.sourceRows) {
      h(`<tr><td><b>${esc(r.source.name)}</b>${r.restricted ? `<br><small>${r.restricted} off-the-record passage${r.restricted === 1 ? '' : 's'}: wording withheld</small>` : ''}</td><td class="n">${esc(formatTime(r.duration))}</td><td class="n">${r.words.toLocaleString()}</td><td class="n">${r.claims}</td><td class="n">${r.aiDrafted}</td><td class="n">${r.aiDrafted ? `${r.checked} (${pc(r.checked / r.aiDrafted)})` : 'all'}</td><td>${esc(r.notAsked.join(', ') || '—')}</td></tr>`)
    }
    h('</tbody></table></div>')
  }

  if (opts.coverage && d.coverage.length) {
    h(`<h2>Interview guide coverage</h2><p class="note">“Not asked” is kept apart from “asked, no view”, so a missing code is not read as a missing opinion.</p><div class="scroll"><table><thead><tr><th>Question</th>${project.sources.map((s) => `<th>${esc(s.name.split(' — ')[0])}</th>`).join('')}</tr></thead><tbody>`)
    for (const row of d.coverage) {
      h(`<tr><td><b>${esc(row.question.key)}</b> ${esc(row.question.title)}</td>${row.marks.map((m) => `<td><span class="tag ${m.status}">${COVERAGE_TEXT[m.status]}</span>${m.note ? `<br><small>${esc(m.note)}</small>` : ''}</td>`).join('')}</tr>`)
    }
    h('</tbody></table></div>')
  }

  const legend = () => h(`<div class="legend">${d.profile.choice.map((g) => `<span><b>${esc(g.name)}</b></span>` + project.codes.filter((c) => c.groupId === g.id).map((c, i, all) => `<span><i style="background:${mixColor(g.kind, i, all.length)}"></i>${esc(tidy(c.name))}</span>`).join('')).join('')}</div>`)

  if (persp && persp.rows.length) {
    begin('perspectives', 'Perspectives')
    h(`<h2>Participant perspectives</h2><p class="note">The same question was put to each interview separately${persp.prompt.version > 1 ? ` (version ${persp.prompt.version})` : ''}: ${opts.recipe === 'summary' ? `<b>${esc(persp.prompt.title)}</b>.` : `“${esc(persp.prompt.text)}”`} Answers were drafted by ${esc(persp.models.join(', '))} from each full transcript; every quote was checked against the transcript. Read them as a guide to the interviews, not a substitute.</p>`)
    h('<div class="cells">')
    for (const r of persp.rows) {
      const turns = new Map(turnsOf(r.source).map((t) => [t.id, t.time]))
      h(`<div class="cell"><h4>${esc(caseOf(project, r.source.id))}${r.label ? ` <span class="tag ${labelTone(r.label)}">${esc(r.label)}</span>` : ''}</h4>${answerHTML(r.label ? r.answer.text.replace(/^\s*(?:\*\*)?overall(?: stance)?:?(?:\*\*)?\s*[^.\n]+?(?:\.|\n|$)\s*/i, '') : r.answer.text, turns)}${opts.recipe === 'full' && r.quotes.length ? `<details><summary><small>${r.quotes.length} quotes checked against the transcript</small></summary>${r.quotes.map((q) => `<blockquote>“${esc(q.text)}”<br><small>${esc(q.time)}</small></blockquote>`).join('')}</details>` : ''}</div>`)
    }
    h('</div>')
  }

  if (opts.framework && d.framework.length) {
    begin('framework', 'Framework')
    const brief = opts.recipe === 'summary'
    h(`<h2>${brief ? 'Findings by theme' : 'Framework matrix'}</h2><p class="note">${brief ? 'For each theme, what each interview said, with one quote.' : 'One summary per case and theme, with the quotes pinned as its evidence.'}${opts.bars ? ' The bars show how that case\'s claims in the domain were graded.' : ''}</p>`)
    if (opts.bars) legend()
    for (const t of d.framework) {
      h(`<h3>${esc(t.theme.title)}</h3>`)
      if (t.theme.interpretation) h(`<p>${para(t.theme.interpretation)}</p>`)
      const group = project.groups.find((g) => g.name === t.theme.title)
      h(brief ? '<div class="rows">' : '<div class="cells">')
      for (const c of t.cells) {
        const summary = brief ? firstSentences(c.summary, 2) : c.summary
        const quotes = c.quotes.slice(0, opts.quotesPerCell)
        h(`<div class="${brief ? 'row' : 'cell'}"><h4>${esc(c.case.name)}</h4>${opts.bars && group ? mixBar(d.profile.cells.get(cellKey(c.case.id, group.id))) : ''}<p>${summary ? para(summary) : '<small>No summary written.</small>'}</p>${quotes.map((q) => `<blockquote>“${esc(q.text)}”<br><small>${esc(brief ? q.time : [q.time, q.code].filter(Boolean).join(' · '))}</small></blockquote>`).join('')}${c.quotes.length > quotes.length ? `<small>${c.quotes.length - quotes.length} more pinned quote${c.quotes.length - quotes.length === 1 ? '' : 's'} in the full report.</small>` : ''}</div>`)
      }
      h('</div>')
    }
  }

  if (opts.profile && d.profile.rows.length) {
    begin('profile', 'Cases by domain')
    h('<h2>Cases by domain</h2><p class="note">Coded claims per domain, with the evidence grades and stances they carry. Counts describe the coding, not how common a view is.</p>')
    legend()
    h(`<div class="scroll"><table><thead><tr><th>Domain</th>${caseNames.map((n) => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>`)
    const row = (label: string, get: (caseId: string) => ProfileCell | undefined) => h(`<tr><td>${label}</td>${project.cases.map((k) => { const c = get(k.id); return `<td>${c?.claims.length ? `<b>${c.claims.length}</b> claim${c.claims.length === 1 ? '' : 's'}${mixBar(c)}` : '<small>None coded</small>'}</td>` }).join('')}</tr>`)
    row('<b>All domains</b>', (id) => d.profile.totals.get(id))
    for (const g of d.profile.rows) row(esc(g.name), (id) => d.profile.cells.get(cellKey(id, g.id)))
    h('</tbody></table></div>')
  }

  if (opts.codes && d.codeCounts.length) {
    begin('codes', 'Code counts')
    h(`<h2>Code counts</h2><p class="note">Number of claims carrying each code, per case. Codes never applied are left out.</p><div class="scroll"><table><thead><tr><th>Code</th>${caseNames.map((n) => `<th class="n">${esc(n)}</th>`).join('')}</tr></thead><tbody>`)
    for (const g of d.codeCounts) {
      h(`<tr><th colspan="${caseNames.length + 1}">${esc(g.group.name)}</th></tr>`)
      for (const r of g.rows) h(`<tr><td>${esc(tidy(r.code.name))}</td>${r.counts.map((n) => `<td class="n">${n || ''}</td>`).join('')}</tr>`)
    }
    h('</tbody></table></div>')
  }

  if (opts.figures && d.figures.length) {
    begin('figures', 'Figures')
    h(`<h2>Flagged figures</h2><p class="note">Figures and costable facts flagged while coding, with the extraction row recorded for each. Respondent figures are recall unless the basis says otherwise.</p><div class="scroll"><table><thead><tr><th>Flag</th><th>Source</th>${project.extractionFields.map((f) => `<th>${esc(f)}</th>`).join('')}<th>Passage</th></tr></thead><tbody>`)
    for (const f of d.figures) h(`<tr><td>${esc(f.code)}</td><td>${esc(f.source)} ${esc(f.time)}</td>${f.values.map((v) => `<td>${esc(v) || '<small>missing</small>'}</td>`).join('')}<td>“${esc(f.quote)}”</td></tr>`)
    h('</tbody></table></div>')
  }

  if (opts.ai && (project.aiRuns.length || d.reviews.length)) {
    begin('ai', 'AI & review')
    h('<h2>AI assistance and review</h2>')
    if (project.aiRuns.length) {
      h('<div class="scroll"><table><thead><tr><th>Pass</th><th>Source</th><th>Model</th><th class="n">Suggestions</th><th>Quotes</th><th>Use</th></tr></thead><tbody>')
      for (const r of project.aiRuns) h(`<tr><td>${esc(new Date(r.startedAt).toLocaleString())}</td><td>${esc(r.sourceIds.map((id) => d.sources.get(id)?.name.split(' — ')[0] ?? '?').join(', '))}</td><td>${esc(r.model)}</td><td class="n">${r.suggestions}</td><td>${r.repaired ? `${r.repaired} repaired` : 'all verbatim'}${r.rejected.length ? `, ${r.rejected.length} unmatched and dropped` : ''}</td><td>${esc(runUse(d, r.id, !!r.comparisonOnly))}</td></tr>`)
      h('</tbody></table></div>')
    }
    for (const c of d.calibrations) {
      const sub = c.result.byKind.substantive
      if (c.run.kind === 'grades') h(`<h3>Grade pass on ${esc(c.source.name.split(' — ')[0])}: held-out test</h3><p>${Object.keys(c.run.claims ?? {}).length} claims the human coder had graded were graded again by the model, which saw the respondent's attributes, the decision rules and ${c.run.gradeOptions?.examples ?? 0} examples taken only from the first ${Math.round((c.run.gradeOptions?.teachShare ?? 0) * 100)}% of the interview.</p>`)
      else h(`<h3>Calibration on ${esc(c.source.name.split(' — ')[0])}: the AI against the human coding</h3><p>The model coded this interview without seeing the human coding. On substantive codes it matched <b>${sub?.recall != null ? pc(sub.recall) : '—'}</b> of the ${sub?.ref ?? 0} human codings (recall), and <b>${sub?.precision != null ? pc(sub.precision) : '—'}</b> of its own ${sub?.other ?? 0} were ones the human coder also applied to an overlapping passage (precision).</p>`)
      for (const m of c.result.confusions) {
        const ids = m.codeIds.filter((id) => id === '' || m.codeIds.some((o) => (m.counts.get(id)?.get(o) ?? 0) || (m.counts.get(o)?.get(id) ?? 0)))
        const lab = (id: string) => (id ? short(d.codes.get(id)?.name ?? '?') : 'none')
        h(`<p class="note"><b>${esc(d.groups.get(m.groupId)?.name)}</b>: same value on ${m.agree} of ${m.compared} passages both graded (${m.compared ? pc(m.agree / m.compared) : '—'}). Rows are the human coder, columns the AI.</p><div class="scroll"><table style="width:auto"><thead><tr><th></th>${ids.map((o) => `<th class="n">${esc(lab(o))}</th>`).join('')}</tr></thead><tbody>${ids.map((r) => `<tr><th>${esc(r ? tidy(d.codes.get(r)?.name ?? '?') : 'none')}</th>${ids.map((o) => { const n = m.counts.get(r)?.get(o) ?? 0; return `<td class="n"${r === o && r ? ' style="font-weight:700;background:#f4f3ef"' : ''}>${n || ''}</td>` }).join('')}</tr>`).join('')}</tbody></table></div>`)
      }
    }
    for (const r of d.reviews) {
      const s = r.summary
      h(`<h3>Review of ${esc(r.source.name.split(' — ')[0])}</h3><p>${esc(r.reviewers.join(', '))} decided ${s.total} AI codings: <b>${s.kept} kept as proposed</b> (${s.total ? pc(s.kept / s.total) : '—'}), <b>${s.recoded} given a different code</b>, <b>${s.rejected} rejected</b>; ${s.added} codings added by the reviewer.${r.endorsers.length ? ` Endorsed by ${esc(r.endorsers.join(', '))}.` : ''}</p>`)
      const bands = (['high', 'medium', 'low'] as const).filter((b) => s.byBand[b].kept + s.byBand[b].recoded + s.byBand[b].rejected > 0)
      if (bands.length) h(`<table style="width:auto"><thead><tr><th>AI confidence</th><th class="n">Kept</th><th class="n">Changed</th><th class="n">Rejected</th><th class="n">Kept as proposed</th></tr></thead><tbody>${bands.map((b) => { const v = s.byBand[b]; const t = v.kept + v.recoded + v.rejected; return `<tr><td>${b[0].toUpperCase() + b.slice(1)}</td><td class="n">${v.kept}</td><td class="n">${v.recoded}</td><td class="n">${v.rejected}</td><td class="n">${pc(v.kept / t)}</td></tr>` }).join('')}</tbody></table>`)
      if (s.changes.length) h(`<p class="note">Most frequent corrections:</p><ul>${s.changes.slice(0, 8).map((c) => `<li>${c.n} × ${esc(tidy(d.codes.get(c.fromId)?.name ?? '?'))} → ${esc(tidy(d.codes.get(c.toId)?.name ?? '?'))}</li>`).join('')}</ul>`)
    }
  }

  if (opts.open) {
    const items: string[] = []
    if (d.pending.length) items.push(`${d.pending.length} AI suggestions have not been decided.`)
    for (const r of d.sourceRows) if (r.unchecked) items.push(`${esc(r.source.name.split(' — ')[0])}: ${r.unchecked} AI-drafted claims were accepted but not checked by ${esc(project.coder)}.`)
    const rules = indexBy(project.rules)
    const byRule = new Map<string, number>()
    for (const v of d.violations) byRule.set(v.ruleId, (byRule.get(v.ruleId) ?? 0) + 1)
    for (const [id, n] of byRule) items.push(`${n} passage${n === 1 ? '' : 's'} break the rule “${esc(rules.get(id) ? describeRule(rules.get(id)!, d.groups) : 'rule')}”.`)
    for (const r of d.sourceRows) if (r.notAsked.length) items.push(`${esc(r.source.name.split(' — ')[0])} was not asked ${esc(r.notAsked.join(', '))}; absence of codes there is not absence of a view.`)
    const unmarked = d.coverage.reduce((n, row) => n + row.marks.filter((m) => m.status === 'unmarked').length, 0)
    if (unmarked) items.push(`${unmarked} guide questions have no coverage mark yet.`)
    if (d.corrections) items.push(`${d.corrections} transcript corrections from the glossary are waiting to be applied.`)
    if (d.uncertain) items.push(`${d.uncertain} low-confidence words in machine transcripts have not been checked against the recordings.`)
    const unverified = d.accepted.filter((c) => !c.verifiedAt && d.sources.get(c.sourceId)?.media).length
    if (unverified) items.push(`No wording check against the recording is recorded for ${unverified} codings on sources that have audio.`)
    if (project.restricted.length) items.push(`${project.restricted.length} passage${project.restricted.length === 1 ? ' is' : 's are'} marked off the record; ${project.restricted.length === 1 ? 'its' : 'their'} wording is withheld from this report and from quote exports.`)
    const open = project.candidates.filter((c) => c.status === 'open')
    if (open.length) items.push(`${open.length} candidate code${open.length === 1 ? '' : 's'} await a decision: ${esc(open.map((c) => c.name).join('; '))}.`)
    const final = !!project.signoff
    begin('open', final ? 'Limitations' : 'Open items')
    h(`<h2>${final ? 'Limitations' : 'Open items'}</h2>${final ? '<p class="note">What the sign-off does not cover.</p>' : ''}${items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : `<p>${final ? 'None recorded.' : 'Nothing outstanding.'}</p>`}`)
  }

  if (opts.memos && project.memos.length) {
    begin('memos', 'Memos')
    h('<h2>Memos and journal</h2>')
    for (const m of project.memos) h(`<h3>${esc(m.title)}</h3><p class="meta">${m.kind === 'journal' ? 'Journal' : 'Memo'} · ${esc(m.author)} · ${esc(new Date(m.updatedAt).toLocaleDateString())}</p><div class="memo">${esc(m.body)}</div>`)
  }

  if (opts.codebook && project.codes.length) {
    begin('codebook', 'Codebook')
    h('<h2>Codebook</h2>')
    for (const g of project.groups) {
      h(`<h3>${esc(g.name)}</h3><div class="scroll"><table><thead><tr><th>Code</th><th>Definition</th><th>Include</th><th>Exclude</th><th>Anchor</th></tr></thead><tbody>${codesInGroup(project, g.id).map((c) => `<tr><td>${esc(tidy(c.name))}</td><td>${esc(c.definition)}</td><td>${esc(c.include)}</td><td>${esc(c.exclude)}</td><td><i>${esc(c.anchor)}</i></td></tr>`).join('')}</tbody></table></div>`)
    }
  }

  // Tabs without scripts: one radio per section, labels as the tab bar, and a CSS rule per tab.
  // An "All" tab shows everything; printing always does.
  const tabbed = opts.tabs && sections.length > 1
  const body = tabbed
    ? [
      `<input type="radio" name="tab" id="tab-all" class="tabr">`,
      ...sections.map((sec, i) => `<input type="radio" name="tab" id="tab-${sec.id}" class="tabr"${i === 0 ? ' checked' : ''}>`),
      `<nav class="tabs" aria-label="Report sections">${sections.map((sec) => `<label for="tab-${sec.id}">${esc(sec.label)}</label>`).join('')}<label for="tab-all">All</label></nav>`,
      `<div class="panels">${sections.map((sec) => `<section class="panel" id="p-${sec.id}">${sec.body.join('\n')}</section>`).join('')}</div>`,
      `<style>${sections.map((sec) => `#tab-${sec.id}:checked~.panels #p-${sec.id}{display:block}#tab-${sec.id}:checked~.tabs label[for=tab-${sec.id}]{color:var(--ink);border-color:var(--accent);font-weight:600}#tab-${sec.id}:focus-visible~.tabs label[for=tab-${sec.id}]`).join(',')}{outline:2px solid var(--accent);outline-offset:-2px}#tab-all:checked~.panels .panel{display:block}#tab-all:checked~.tabs label[for=tab-all]{color:var(--ink);border-color:var(--accent);font-weight:600}</style>`,
    ].join('\n')
    : sections.map((sec) => sec.body.join('\n')).join('\n')
  return forExport(project, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.name)} — ${opts.recipe === 'summary' ? 'summary' : 'analysis report'}</title><style>${CSS}</style></head><body><main>${head.join('\n')}${body}</main></body></html>`, { html: true })
}

// ---------------------------------------------------------------------------
// Markdown

const cellMD = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')
const table = (head: string[], rows: unknown[][]) => [`| ${head.map(cellMD).join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cellMD).join(' | ')} |`)].join('\n')
const mixText = (c: ProfileCell | undefined) => (c?.claims.length ? c.mixes.map((m) => m.parts.filter((p) => p.n).map((p) => `${short(p.code.name)} ${p.n}`).join(' ')).filter(Boolean).join(' / ') : '')

export function reportMarkdown(project: Project, opts: ReportOptions = DEFAULT_REPORT, generatedAt = new Date()): string {
  const d = reportData(project)
  const out: string[] = [`# ${project.name}`, '']
  const h = (...s: string[]) => out.push(...s, '')
  if (project.question) h(project.question)
  h(`Analysis report${project.signoff ? ' (final)' : ''}, generated ${generatedAt.toISOString().slice(0, 10)}. Reviewer: ${project.coder}.`)
  if (anonymised(project)) h(`*${ANON_NOTE}*`)
  if (project.method && opts.recipe !== 'summary') h(project.method)
  h(`**${statusLine(d)}**`)
  if (project.signoff?.note) h(`Sign-off note: ${project.signoff.note}`)

  if (opts.glance) h(`${project.sources.length} interviews · ${d.codedClaims} coded claims · ${d.usedCodes} of ${project.codes.length} codes used · ${d.violations.length} rule issues open · ${d.pending.length} suggestions undecided.`)
  if (opts.sources) h('## Sources', table(['Interview', 'Length', 'Words', 'Coded claims', 'AI-drafted', 'Checked by the reviewer', 'Not asked'], d.sourceRows.map((r) => [r.source.name, formatTime(r.duration), r.words, r.claims, r.aiDrafted, r.aiDrafted ? `${r.checked} (${pc(r.checked / r.aiDrafted)})` : 'all', r.notAsked.join(', ') || '—'])))
  if (opts.coverage && d.coverage.length) h('## Interview guide coverage', table(['Question', ...project.sources.map((s) => s.name.split(' — ')[0])], d.coverage.map((row) => [`${row.question.key} ${row.question.title}`, ...row.marks.map((m) => `${COVERAGE_TEXT[m.status]}${m.note ? `: ${m.note}` : ''}`)])))
  const persp = opts.perspectives ? perspectives(project, opts.askId) : null
  if (persp && persp.rows.length) {
    h('## Participant perspectives', `_The same question was put to each interview separately: ${opts.recipe === 'summary' ? `**${persp.prompt.title}**.` : `“${persp.prompt.text}”`} Answers drafted by ${persp.models.join(', ')} from each full transcript; quotes checked against the transcript._`)
    for (const r of persp.rows) {
      const times = new Map(turnsOf(r.source).map((t) => [t.id, t.time]))
      h(`### ${caseOf(project, r.source.id)}`, r.answer.text.replace(/\[(T\d{4})(?:[,–-]\s*T?\d{4})*\]/g, (_, id) => { const tm = times.get(id); return tm != null ? `(${formatTime(tm)})` : '' }))
    }
  }
  if (opts.framework && d.framework.length) {
    const brief = opts.recipe === 'summary'
    h(brief ? '## Findings by theme' : '## Framework matrix')
    for (const t of d.framework) {
      h(`### ${t.theme.title}`)
      if (t.theme.interpretation) h(t.theme.interpretation)
      for (const c of t.cells) {
        h(`**${c.case.name}.** ${(brief ? firstSentences(c.summary, 2) : c.summary) || '_No summary written._'}`)
        const quotes = c.quotes.slice(0, opts.quotesPerCell)
        if (quotes.length) h(quotes.map((q) => `> “${q.text}” (${(brief ? [q.time] : [q.time, q.code]).filter(Boolean).join(' · ')})`).join('\n>\n'))
      }
    }
  }
  if (opts.profile && d.profile.rows.length) {
    h('## Cases by domain', 'Claims per domain, then evidence grades / stances.', table(['Domain', ...project.cases.map((k) => k.name)], [
      ['All domains', ...project.cases.map((k) => { const c = d.profile.totals.get(k.id); return c?.claims.length ? `${c.claims.length} (${mixText(c)})` : '—' })],
      ...d.profile.rows.map((g) => [g.name, ...project.cases.map((k) => { const c = d.profile.cells.get(cellKey(k.id, g.id)); return c?.claims.length ? `${c.claims.length} (${mixText(c)})` : '—' })]),
    ]))
  }
  if (opts.codes && d.codeCounts.length) h('## Code counts', table(['Code', ...project.cases.map((k) => k.name)], d.codeCounts.flatMap((g) => [[`**${g.group.name}**`, ...project.cases.map(() => '')], ...g.rows.map((r) => [tidy(r.code.name), ...r.counts.map((n) => n || '')])])))
  if (opts.figures && d.figures.length) h('## Flagged figures', table(['Flag', 'Source', ...project.extractionFields, 'Passage'], d.figures.map((f) => [f.code, `${f.source} ${f.time}`, ...f.values, `“${f.quote}”`])))
  if (opts.ai && (project.aiRuns.length || d.reviews.length)) {
    h('## AI assistance and review')
    if (project.aiRuns.length) h(table(['Pass', 'Source', 'Model', 'Suggestions', 'Use'], project.aiRuns.map((r) => [new Date(r.startedAt).toISOString().slice(0, 16).replace('T', ' '), r.sourceIds.map((id) => d.sources.get(id)?.name.split(' — ')[0] ?? '?').join(', '), r.model, r.suggestions, runUse(d, r.id, !!r.comparisonOnly)])))
    for (const c of d.calibrations) {
      const sub = c.result.byKind.substantive
      h(`### Calibration on ${c.source.name.split(' — ')[0]}`, `Substantive codes: recall ${sub?.recall != null ? pc(sub.recall) : '—'} of ${sub?.ref ?? 0} human codings, precision ${sub?.precision != null ? pc(sub.precision) : '—'} of ${sub?.other ?? 0} AI codings. ${c.result.confusions.map((m) => `${d.groups.get(m.groupId)?.name}: same value on ${m.agree} of ${m.compared} passages both graded`).join('. ')}.`)
    }
    for (const r of d.reviews) {
      const s = r.summary
      h(`### Review of ${r.source.name.split(' — ')[0]}`, `${r.reviewers.join(', ')} decided ${s.total} AI codings: ${s.kept} kept as proposed, ${s.recoded} given a different code, ${s.rejected} rejected; ${s.added} added by the reviewer.${r.endorsers.length ? ` Endorsed by ${r.endorsers.join(', ')}.` : ''}`)
      if (s.changes.length) h(s.changes.slice(0, 8).map((c) => `- ${c.n} × ${tidy(d.codes.get(c.fromId)?.name ?? '?')} → ${tidy(d.codes.get(c.toId)?.name ?? '?')}`).join('\n'))
    }
  }
  if (opts.open) {
    const items: string[] = []
    if (d.pending.length) items.push(`${d.pending.length} AI suggestions have not been decided.`)
    for (const r of d.sourceRows) if (r.unchecked) items.push(`${r.source.name.split(' — ')[0]}: ${r.unchecked} AI-drafted claims accepted but not checked by ${project.coder}.`)
    if (d.violations.length) items.push(`${d.violations.length} codebook rule issues.`)
    for (const r of d.sourceRows) if (r.notAsked.length) items.push(`${r.source.name.split(' — ')[0]} was not asked ${r.notAsked.join(', ')}.`)
    if (d.corrections) items.push(`${d.corrections} glossary corrections waiting to be applied.`)
    if (d.uncertain) items.push(`${d.uncertain} low-confidence transcript words unchecked.`)
    if (project.restricted.length) items.push(`${project.restricted.length} off-the-record passage(s): wording withheld.`)
    h(project.signoff ? '## Limitations' : '## Open items', items.length ? items.map((i) => `- ${i}`).join('\n') : project.signoff ? 'None recorded.' : 'Nothing outstanding.')
  }
  if (opts.memos && project.memos.length) {
    h('## Memos and journal')
    for (const m of project.memos) h(`### ${m.title}`, m.body)
  }
  if (opts.codebook) {
    h('## Codebook')
    for (const g of project.groups) h(`### ${g.name}`, table(['Code', 'Definition', 'Include', 'Exclude', 'Anchor'], codesInGroup(project, g.id).map((c) => [tidy(c.name), c.definition, c.include, c.exclude, c.anchor])))
  }
  return forExport(project, out.join('\n').replace(/\n{3,}/g, '\n\n'))
}

// ---------------------------------------------------------------------------
// One row per claim, for spreadsheets

export function claimsCSV(project: Project) {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  const sources = indexBy(project.sources)
  const kinds = (c: { codeId: string }) => groupOf(codes.get(c.codeId), codes, groups)?.kind ?? 'other'
  const rows: (string | number)[][] = [['Source', 'Time', 'Speaker', 'Substantive codes', 'Evidence grade', 'Stance', 'Flags', 'Other codes', 'Review state', 'AI-drafted', 'AI confidence', 'Coders', 'Reviewed by', 'Rule issues', 'Note', 'Passage', 'Start', 'End']]
  for (const cl of buildClaims(project)) {
    const acc = cl.codings.filter((c) => c.status === 'accepted')
    if (!acc.length) continue
    const s = sources.get(cl.sourceId)
    const seg = s ? segmentsOf(s).find((g) => g.start <= cl.start && g.end > cl.start) : undefined
    const names = (kind: GroupKind[]) => acc.filter((c) => kind.includes(kinds(c))).map((c) => tidy(codes.get(c.codeId)?.name ?? '')).join('; ')
    rows.push([
      s?.name ?? '', s ? formatTime(timeAt(s, cl.start)) : '', s && seg ? speakerOf(s, seg.speaker)?.name || seg.speaker : '',
      names(['substantive']), names(['evidence']), names(['stance']), names(['flag']), names(['process', 'other']),
      CLAIM_STATE_LABEL[cl.state], cl.ai ? 'yes' : '', confidenceBand(cl.confidence) ?? '',
      [...new Set(acc.map((c) => c.coder))].join('; '), [...new Set(acc.map((c) => c.reviewedBy).filter(Boolean))].join('; '),
      cl.issues.join('; '), acc.find((c) => c.memo)?.memo ?? '', quotable(project, s, cl.start, cl.end), cl.start, cl.end,
    ])
  }
  return '﻿' + forExport(project, toCSV(rows))
}

/** The status line at the top of every report, for other formats. */
export const reportStatus = (project: Project) => statusLine(reportData(project))
