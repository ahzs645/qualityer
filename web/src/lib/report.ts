import type { CoverageStatus, GroupKind, Project } from './types'
import {
  checkRules, codesInGroup, describeRule, findCorrections, formatTime, groupOf, indexBy, pendingSuggestions, quotable, segmentsOf, speakerOf, timeAt, toCSV,
} from './model'
import { CLAIM_STATE_LABEL, buildClaims, choiceGroups, confidenceBand, summariseDecisions } from './claims'
import { compare } from './compare'
import { buildProfile, cellKey, type ProfileCell } from './profile'

// The study report: one document a team can read, print or paste from. It is
// built from the project alone (no app state), as a self-contained HTML page
// and as Markdown. Wording from off-the-record passages is withheld.

export const REPORT_SECTIONS = [
  ['glance', 'At a glance'],
  ['sources', 'Sources'],
  ['coverage', 'Interview guide coverage'],
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
export type ReportOptions = Record<SectionId, boolean>
export const DEFAULT_REPORT: ReportOptions = { glance: true, sources: true, coverage: true, framework: true, profile: true, codes: true, figures: true, ai: true, open: true, memos: true, codebook: false }

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

  const calibrations = project.aiRuns.flatMap((r) => r.sourceIds.map((sid) => ({ r, sid }))).filter(({ r, sid }) =>
    project.codings.some((c) => c.sourceId === sid && !c.origin && c.status === 'accepted') && project.codings.some((c) => c.origin?.runId === r.id && c.sourceId === sid),
  ).map(({ r, sid }) => {
    const result = compare(project, project.codings.filter((c) => c.sourceId === sid && !c.origin && c.status === 'accepted'), project.codings.filter((c) => c.sourceId === sid && c.origin?.runId === r.id), choices.map((c) => c.group.id))
    return { run: r, source: sources.get(sid)!, result }
  })

  const reviews = project.sources.filter((s) => project.reviewLog.some((e) => e.sourceId === s.id && e.ai)).map((s) => ({
    source: s, summary: summariseDecisions(project, s.id),
    reviewers: [...new Set(project.reviewLog.filter((e) => e.sourceId === s.id).map((e) => e.by))],
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

function statusLine(d: Data) {
  const parts: string[] = []
  if (d.aiClaims) parts.push(`${d.aiChecked} of ${d.aiClaims} AI-drafted claims have been checked by ${d.project.coder}`)
  if (d.pending.length) parts.push(`${d.pending.length} AI suggestions still need a decision`)
  if (d.violations.length) parts.push(`${d.violations.length} codebook rule issues are open`)
  return parts.length ? `Working draft: ${parts.join('; ')}.` : 'All coded claims have been reviewed and meet the codebook rules.'
}

/** What became of an AI pass, for the audit table. */
function runUse(d: Data, runId: string, comparisonOnly: boolean) {
  if (comparisonOnly) return 'Comparison with a human coder only'
  const left = d.project.codings.filter((c) => c.origin?.runId === runId)
  const decided = d.project.reviewLog.some((e) => e.runId === runId)
  if (!left.length && !decided) return 'Superseded; none of its suggestions were kept'
  const waiting = left.filter((c) => c.status === 'suggested').length
  return waiting ? `In review: ${waiting} suggestions undecided` : 'Reviewed claim by claim'
}

// ---------------------------------------------------------------------------
// HTML

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
.status{background:#fbf0d9;border-radius:6px;padding:.6rem .85rem;margin:1rem 0;color:#6b4700}
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
@media print{main{padding:0;max-width:none}h2{break-after:avoid}.cell,tr,blockquote,.memo{break-inside:avoid}body{font-size:11pt}}
`

export function reportHTML(project: Project, opts: ReportOptions = DEFAULT_REPORT, generatedAt = new Date()): string {
  const d = reportData(project)
  const out: string[] = []
  const h = (s: string) => out.push(s)
  const caseNames = project.cases.map((k) => k.name)

  h(`<h1>${esc(project.name)}</h1>`)
  if (project.question) h(`<p class="lede">${esc(project.question)}</p>`)
  h(`<p class="meta">Analysis report · generated ${esc(generatedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))} · reviewer ${esc(project.coder)}</p>`)
  if (project.method) h(`<p class="meta">${esc(project.method)}</p>`)
  h(`<p class="status">${esc(statusLine(d))}</p>`)

  if (opts.glance) {
    h(`<div class="tiles">${[
      [project.sources.length, 'interviews'], [d.codedClaims, 'coded claims'], [`${d.usedCodes} of ${project.codes.length}`, 'codes used'],
      [d.aiClaims ? pc(d.aiChecked / d.aiClaims) : '—', 'of AI-drafted claims checked by a person'], [d.violations.length, 'rule issues open'], [d.pending.length, 'suggestions undecided'],
    ].map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`)
  }

  if (opts.sources) {
    h('<h2>Sources</h2><div class="scroll"><table><thead><tr><th>Interview</th><th class="n">Length</th><th class="n">Words</th><th class="n">Coded claims</th><th class="n">AI-drafted</th><th class="n">Checked by a person</th><th>Guide questions not asked</th></tr></thead><tbody>')
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

  if (opts.framework && d.framework.length) {
    h('<h2>Framework matrix</h2><p class="note">One summary per case and theme, with the quotes pinned as its evidence. The bars show how that case\'s claims in the domain were graded.</p>')
    legend()
    for (const t of d.framework) {
      h(`<h3>${esc(t.theme.title)}</h3>`)
      if (t.theme.interpretation) h(`<p>${para(t.theme.interpretation)}</p>`)
      const group = project.groups.find((g) => g.name === t.theme.title)
      h('<div class="cells">')
      for (const c of t.cells) {
        h(`<div class="cell"><h4>${esc(c.case.name)}</h4>${group ? mixBar(d.profile.cells.get(cellKey(c.case.id, group.id))) : ''}<p>${c.summary ? para(c.summary) : '<small>No summary written.</small>'}</p>${c.quotes.map((q) => `<blockquote>“${esc(q.text)}”<br><small>${esc([q.time, q.code].filter(Boolean).join(' · '))}</small></blockquote>`).join('')}</div>`)
      }
      h('</div>')
    }
  }

  if (opts.profile && d.profile.rows.length) {
    h('<h2>Cases by domain</h2><p class="note">Coded claims per domain, with the evidence grades and stances they carry. Counts describe the coding, not how common a view is.</p>')
    legend()
    h(`<div class="scroll"><table><thead><tr><th>Domain</th>${caseNames.map((n) => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>`)
    const row = (label: string, get: (caseId: string) => ProfileCell | undefined) => h(`<tr><td>${label}</td>${project.cases.map((k) => { const c = get(k.id); return `<td>${c?.claims.length ? `<b>${c.claims.length}</b> claim${c.claims.length === 1 ? '' : 's'}${mixBar(c)}` : '<small>None coded</small>'}</td>` }).join('')}</tr>`)
    row('<b>All domains</b>', (id) => d.profile.totals.get(id))
    for (const g of d.profile.rows) row(esc(g.name), (id) => d.profile.cells.get(cellKey(id, g.id)))
    h('</tbody></table></div>')
  }

  if (opts.codes && d.codeCounts.length) {
    h(`<h2>Code counts</h2><p class="note">Number of claims carrying each code, per case. Codes never applied are left out.</p><div class="scroll"><table><thead><tr><th>Code</th>${caseNames.map((n) => `<th class="n">${esc(n)}</th>`).join('')}</tr></thead><tbody>`)
    for (const g of d.codeCounts) {
      h(`<tr><th colspan="${caseNames.length + 1}">${esc(g.group.name)}</th></tr>`)
      for (const r of g.rows) h(`<tr><td>${esc(tidy(r.code.name))}</td>${r.counts.map((n) => `<td class="n">${n || ''}</td>`).join('')}</tr>`)
    }
    h('</tbody></table></div>')
  }

  if (opts.figures && d.figures.length) {
    h(`<h2>Flagged figures</h2><p class="note">Figures and costable facts flagged while coding, with the extraction row recorded for each. Respondent figures are recall unless the basis says otherwise.</p><div class="scroll"><table><thead><tr><th>Flag</th><th>Source</th>${project.extractionFields.map((f) => `<th>${esc(f)}</th>`).join('')}<th>Passage</th></tr></thead><tbody>`)
    for (const f of d.figures) h(`<tr><td>${esc(f.code)}</td><td>${esc(f.source)} ${esc(f.time)}</td>${f.values.map((v) => `<td>${esc(v) || '<small>missing</small>'}</td>`).join('')}<td>“${esc(f.quote)}”</td></tr>`)
    h('</tbody></table></div>')
  }

  if (opts.ai && (project.aiRuns.length || d.reviews.length)) {
    h('<h2>AI assistance and review</h2>')
    if (project.aiRuns.length) {
      h('<div class="scroll"><table><thead><tr><th>Pass</th><th>Source</th><th>Model</th><th class="n">Suggestions</th><th>Quotes</th><th>Use</th></tr></thead><tbody>')
      for (const r of project.aiRuns) h(`<tr><td>${esc(new Date(r.startedAt).toLocaleString())}</td><td>${esc(r.sourceIds.map((id) => d.sources.get(id)?.name.split(' — ')[0] ?? '?').join(', '))}</td><td>${esc(r.model)}</td><td class="n">${r.suggestions}</td><td>${r.repaired ? `${r.repaired} repaired` : 'all verbatim'}${r.rejected.length ? `, ${r.rejected.length} unmatched and dropped` : ''}</td><td>${esc(runUse(d, r.id, !!r.comparisonOnly))}</td></tr>`)
      h('</tbody></table></div>')
    }
    for (const c of d.calibrations) {
      const sub = c.result.byKind.substantive
      h(`<h3>Calibration on ${esc(c.source.name.split(' — ')[0])}: the AI against the human coding</h3><p>The model coded this interview without seeing the human coding. On substantive codes it matched <b>${sub?.recall != null ? pc(sub.recall) : '—'}</b> of the ${sub?.ref ?? 0} human codings (recall), and <b>${sub?.precision != null ? pc(sub.precision) : '—'}</b> of its own ${sub?.other ?? 0} were ones the human coder also applied to an overlapping passage (precision).</p>`)
      for (const m of c.result.confusions) {
        const ids = m.codeIds.filter((id) => id === '' || m.codeIds.some((o) => (m.counts.get(id)?.get(o) ?? 0) || (m.counts.get(o)?.get(id) ?? 0)))
        const lab = (id: string) => (id ? short(d.codes.get(id)?.name ?? '?') : 'none')
        h(`<p class="note"><b>${esc(d.groups.get(m.groupId)?.name)}</b>: same value on ${m.agree} of ${m.compared} passages both graded (${m.compared ? pc(m.agree / m.compared) : '—'}). Rows are the human coder, columns the AI.</p><div class="scroll"><table style="width:auto"><thead><tr><th></th>${ids.map((o) => `<th class="n">${esc(lab(o))}</th>`).join('')}</tr></thead><tbody>${ids.map((r) => `<tr><th>${esc(r ? tidy(d.codes.get(r)?.name ?? '?') : 'none')}</th>${ids.map((o) => { const n = m.counts.get(r)?.get(o) ?? 0; return `<td class="n"${r === o && r ? ' style="font-weight:700;background:#f4f3ef"' : ''}>${n || ''}</td>` }).join('')}</tr>`).join('')}</tbody></table></div>`)
      }
    }
    for (const r of d.reviews) {
      const s = r.summary
      h(`<h3>Review of ${esc(r.source.name.split(' — ')[0])}</h3><p>${esc(r.reviewers.join(', '))} decided ${s.total} AI codings: <b>${s.kept} kept as proposed</b> (${s.total ? pc(s.kept / s.total) : '—'}), <b>${s.recoded} given a different code</b>, <b>${s.rejected} rejected</b>; ${s.added} codings added by the reviewer.</p>`)
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
    h(`<h2>Open items</h2>${items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '<p>Nothing outstanding.</p>'}`)
  }

  if (opts.memos && project.memos.length) {
    h('<h2>Memos and journal</h2>')
    for (const m of project.memos) h(`<h3>${esc(m.title)}</h3><p class="meta">${m.kind === 'journal' ? 'Journal' : 'Memo'} · ${esc(m.author)} · ${esc(new Date(m.updatedAt).toLocaleDateString())}</p><div class="memo">${esc(m.body)}</div>`)
  }

  if (opts.codebook && project.codes.length) {
    h('<h2>Codebook</h2>')
    for (const g of project.groups) {
      h(`<h3>${esc(g.name)}</h3><div class="scroll"><table><thead><tr><th>Code</th><th>Definition</th><th>Include</th><th>Exclude</th><th>Anchor</th></tr></thead><tbody>${codesInGroup(project, g.id).map((c) => `<tr><td>${esc(tidy(c.name))}</td><td>${esc(c.definition)}</td><td>${esc(c.include)}</td><td>${esc(c.exclude)}</td><td><i>${esc(c.anchor)}</i></td></tr>`).join('')}</tbody></table></div>`)
    }
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.name)} — analysis report</title><style>${CSS}</style></head><body><main>${out.join('\n')}</main></body></html>`
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
  h(`Analysis report, generated ${generatedAt.toISOString().slice(0, 10)}. Reviewer: ${project.coder}.`)
  if (project.method) h(project.method)
  h(`**${statusLine(d)}**`)

  if (opts.glance) h(`${project.sources.length} interviews · ${d.codedClaims} coded claims · ${d.usedCodes} of ${project.codes.length} codes used · ${d.violations.length} rule issues open · ${d.pending.length} suggestions undecided.`)
  if (opts.sources) h('## Sources', table(['Interview', 'Length', 'Words', 'Coded claims', 'AI-drafted', 'Checked by a person', 'Not asked'], d.sourceRows.map((r) => [r.source.name, formatTime(r.duration), r.words, r.claims, r.aiDrafted, r.aiDrafted ? `${r.checked} (${pc(r.checked / r.aiDrafted)})` : 'all', r.notAsked.join(', ') || '—'])))
  if (opts.coverage && d.coverage.length) h('## Interview guide coverage', table(['Question', ...project.sources.map((s) => s.name.split(' — ')[0])], d.coverage.map((row) => [`${row.question.key} ${row.question.title}`, ...row.marks.map((m) => `${COVERAGE_TEXT[m.status]}${m.note ? `: ${m.note}` : ''}`)])))
  if (opts.framework && d.framework.length) {
    h('## Framework matrix')
    for (const t of d.framework) {
      h(`### ${t.theme.title}`)
      if (t.theme.interpretation) h(t.theme.interpretation)
      for (const c of t.cells) {
        h(`**${c.case.name}.** ${c.summary || '_No summary written._'}`)
        if (c.quotes.length) h(c.quotes.map((q) => `> “${q.text}” (${[q.time, q.code].filter(Boolean).join(' · ')})`).join('\n>\n'))
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
      h(`### Review of ${r.source.name.split(' — ')[0]}`, `${r.reviewers.join(', ')} decided ${s.total} AI codings: ${s.kept} kept as proposed, ${s.recoded} given a different code, ${s.rejected} rejected; ${s.added} added by the reviewer.`)
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
    h('## Open items', items.length ? items.map((i) => `- ${i}`).join('\n') : 'Nothing outstanding.')
  }
  if (opts.memos && project.memos.length) {
    h('## Memos and journal')
    for (const m of project.memos) h(`### ${m.title}`, m.body)
  }
  if (opts.codebook) {
    h('## Codebook')
    for (const g of project.groups) h(`### ${g.name}`, table(['Code', 'Definition', 'Include', 'Exclude', 'Anchor'], codesInGroup(project, g.id).map((c) => [tidy(c.name), c.definition, c.include, c.exclude, c.anchor])))
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
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
  return '﻿' + toCSV(rows)
}
