import type { Project } from '../types'
import { codesInGroup, formatTime, indexBy } from '../model'
import { forExport } from '../names'
import { cellKey, type ProfileCell } from '../profile'
import { peopleOf } from '../positions'
import { ALL, personOf, scopeProject, type Scope } from '../scope'
import {
  ANON_NOTE, COVERAGE_TEXT, anonymised, asides, caseOf, firstSentences, openItems, perspectives, reportData, reportStatus, runUse,
} from '../report'
import { DEFAULT_VISUAL, answerCard, visualBrief, type Block, type Card, type VisualBrief } from '../visual-report'

// The data a document-kit recipe reads: the study as plain values (text already worded, tables as lists of cells,
// charts as PNG pictures). Recipes only print; every count, judgement and wording is worked out here, as the kit
// asks (docs/recipe.md, "JSON or code?"). Masked names are replaced in every string when the study is anonymised.

/** PNG bytes and pixel size for a chart, or null when it cannot be drawn here. */
export type Rasterize = (svg: string, width: number, height: number) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>

export interface RecipeDataOptions {
  /** Draws the SVG charts as pictures. Without it (as in tests), the data has no charts and recipes leave them out. */
  rasterize?: Rasterize
  /** The Ask question for "participant perspectives"; the latest answered one when null. */
  askId?: string | null
  generatedAt?: Date
}

type Picture = { bytes: Uint8Array; format: 'png'; width: number; height: number } | null
const DASH = '—'
const cell = (v: unknown) => (v == null || v === '' ? DASH : String(v))
const pc = (v: number) => `${Math.round(v * 100)}%`
const tidy = (s: string) => s.replace(/\s{2,}/g, ' ').trim()
const short = (name: string) => name.trim().split(/\s{2,}/)[0]
const longDate = (d: Date) => d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })

const sectionOf = (b: VisualBrief, id: string) => b.sections.find((s) => s.id === id)
const blocksOf = <T extends Block['t']>(b: VisualBrief, id: string, t: T) => (sectionOf(b, id)?.blocks ?? []).filter((x): x is Extract<Block, { t: T }> => x.t === t)
const noteOf = (b: VisualBrief, id: string) => blocksOf(b, id, 'p').find((p) => p.tone === 'note')?.text ?? null

const parts = (c: Card) => c.parts.map((p) => ({ heading: p.heading || null, items: p.items }))

/** Every string in a value, masked for export; pictures pass through. */
function masked<T>(project: Project, value: T): T {
  if (typeof value === 'string') return forExport(project, value) as T
  if (value instanceof Uint8Array || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => masked(project, v)) as T
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, masked(project, v)])) as T
}

export async function recipeData(project: Project, scope: Scope = ALL, opts: RecipeDataOptions = {}): Promise<Record<string, unknown>> {
  const at = opts.generatedAt ?? new Date()
  const person = personOf(project, scope)
  const scoped = scopeProject(project, scope)
  const d = reportData(scoped)
  const brief = visualBrief(project, DEFAULT_VISUAL, scope, at)
  const svgMask = (svg: string) => forExport(project, svg, { html: true })
  const draw = async (chart: { svg: string; w: number; h: number } | undefined): Promise<Picture> => {
    if (!chart || !opts.rasterize) return null
    const png = await opts.rasterize(svgMask(chart.svg), chart.w, chart.h)
    return png ? { ...png, format: 'png' } : null
  }
  const chartOf = (b: VisualBrief, id: string) => draw(blocksOf(b, id, 'svg')[0])
  const multiOf = async (b: VisualBrief, id: string, labels: string[]) => {
    const charts = blocksOf(b, id, 'svgs')[0]?.charts ?? blocksOf(b, id, 'svg')
    return (await Promise.all(charts.map(draw))).map((image, i) => ({ image, label: labels[i] ?? '' })).filter((x) => x.image)
  }
  const people = peopleOf(project).filter((p) => !person || p.id === person.id)
  const caseNames = scoped.cases.map((k) => k.name)

  // ------------------------------------------------------------------ the study
  const so = project.signoff
  const study = {
    title: scoped.name,
    question: project.question || null,
    method: project.method || null,
    reviewer: project.coder,
    generated: longDate(at),
    status: reportStatus(project),
    final: !!so,
    signoffNote: so?.note || null,
    anonNote: anonymised(project) ? ANON_NOTE : null,
    scope: person ? `One participant: ${person.label}` : `All ${project.sources.length} interviews together`,
    person: person?.label ?? null,
    personNote: person ? 'This export covers one participant. Writing about the other participants (theme interpretations and study-wide memos) is left out, and charts set this participant against the others without naming them.' : null,
  }

  const tiles = blocksOf(brief, 'glance', 'tiles')[0]?.tiles.map(([value, label]) => ({ value, label })) ?? []
  const glanceLine = `${scoped.sources.length} interview${scoped.sources.length === 1 ? '' : 's'} · ${d.codedClaims} coded claims · ${d.usedCodes} of ${project.codes.length} codes used · ${d.aiClaims ? pc(d.aiChecked / d.aiClaims) : DASH} of AI-drafted claims checked · ${d.violations.length} rule issues open · ${d.pending.length} suggestions undecided`

  // ------------------------------------------------------------------ interviews and coverage
  const sources = {
    columns: ['Interview', 'Length', 'Words', 'Coded claims', 'AI-drafted', 'Checked', 'Not asked'],
    rows: d.sourceRows.map((r) => [
      r.source.name + (r.restricted ? ` (${r.restricted} off-the-record passage${r.restricted === 1 ? '' : 's'} withheld)` : ''),
      cell(formatTime(r.duration)), r.words.toLocaleString('en'), String(r.claims), String(r.aiDrafted),
      r.aiDrafted ? `${r.checked} (${pc(r.checked / r.aiDrafted)})` : 'all', cell(r.notAsked.join(', ')),
    ]),
  }
  const coverage = d.coverage.length ? {
    columns: ['Question', ...scoped.sources.map((s) => s.name.split(' — ')[0])],
    rows: d.coverage.map((row) => [`${row.question.key} ${row.question.title}`, ...row.marks.map((m) => `${COVERAGE_TEXT[m.status]}${m.note ? `: ${m.note}` : ''}`)]),
  } : null

  // ------------------------------------------------------------------ perspectives and asides
  const persp = perspectives(scoped, opts.askId ?? null)
  const perspectivesData = persp && persp.rows.length ? {
    title: persp.prompt.title,
    question: persp.prompt.text,
    note: `The same question was put to each interview separately${persp.prompt.version > 1 ? ` (version ${persp.prompt.version})` : ''}. Answers were drafted by ${persp.models.join(', ')} from each full transcript; every quote was checked against the transcript. Read them as a guide to the interviews, not a substitute.`,
    people: persp.rows.map((r) => {
      const full = answerCard(caseOf(scoped, r.source.id), r.answer.text, false)
      const brief = answerCard(caseOf(scoped, r.source.id), r.answer.text, true)
      return { name: full.title, tag: full.tag ?? null, lead: full.lead ?? null, leadShort: brief.lead ?? null, full: parts(full), brief: parts(brief) }
    }),
  } : null

  const asidesData = asides(scoped).map((q) => ({
    title: q.prompt.title,
    sensitive: !!q.sensitive,
    counts: q.rows.map((r) => `${caseOf(scoped, r.source.id)}: ${r.items.length || 'none'}`).join(' · '),
    people: q.rows.map((r) => ({
      name: caseOf(scoped, r.source.id),
      items: r.items.map((it) => ({ note: it.note, quote: it.quote, time: it.time || null })),
    })),
  }))

  // ------------------------------------------------------------------ framework, cases by domain, codes, figures
  const framework = d.framework.map((t) => ({
    title: t.theme.title,
    interpretation: t.theme.interpretation || null,
    cells: t.cells.map((c) => {
      const group = scoped.groups.find((g) => g.name === t.theme.title)
      const mix = group ? mixText(d.profile.cells.get(cellKey(c.case.id, group.id))) : null
      const summary = c.summary.replace(/\s*\((?:Drafted by|Checked against)[^)]*\)\s*$/i, '').trim()
      return {
        name: c.case.name,
        summary: summary || null,
        short: summary ? firstSentences(summary, 2) : null,
        mix,
        quotes: c.quotes.map((q) => ({ text: `“${q.text}”`, cite: [q.time, q.code].filter(Boolean).join(' · '), time: q.time || null })),
      }
    }),
  }))

  const profile = d.profile.rows.length && scoped.cases.length ? {
    columns: ['Domain', ...caseNames],
    rows: [
      ['All domains', ...scoped.cases.map((k) => profileCell(d.profile.totals.get(k.id)))],
      ...d.profile.rows.map((g) => [g.name, ...scoped.cases.map((k) => profileCell(d.profile.cells.get(cellKey(k.id, g.id))))]),
    ],
  } : null

  const codeCounts = d.codeCounts.length ? {
    columns: ['Code', ...caseNames],
    rows: d.codeCounts.flatMap((g) => [{ group: g.group.name }, ...g.rows.map((r) => [tidy(r.code.name), ...r.counts.map((n) => (n ? String(n) : DASH))])]),
  } : null

  const figures = d.figures.length ? {
    columns: ['Flag', 'Source', ...project.extractionFields, 'Passage'],
    rows: d.figures.map((f) => [f.code, `${f.source} ${f.time}`.trim(), ...f.values.map((v) => cell(v)), `“${f.quote}”`]),
  } : null

  // ------------------------------------------------------------------ AI assistance and review
  const ai = scoped.aiRuns.length || d.reviews.length ? {
    runs: scoped.aiRuns.length ? {
      columns: ['Pass', 'Source', 'Model', 'Suggestions', 'Quotes', 'Use'],
      rows: scoped.aiRuns.map((r) => [
        new Date(r.startedAt).toISOString().slice(0, 16).replace('T', ' '),
        r.sourceIds.map((id) => d.sources.get(id)?.name.split(' — ')[0] ?? '?').join(', '), r.model, String(r.suggestions),
        `${r.repaired ? `${r.repaired} repaired` : 'all verbatim'}${r.rejected.length ? `, ${r.rejected.length} dropped` : ''}`, runUse(d, r.id, !!r.comparisonOnly),
      ]),
    } : null,
    calibrations: d.calibrations.map((c) => {
      const sub = c.result.byKind.substantive
      const where = c.source.name.split(' — ')[0]
      return c.run.kind === 'grades'
        ? `Grade pass on ${where}: ${Object.keys(c.run.claims ?? {}).length} claims the human coder had graded were graded again by the model as a held-out test.`
        : `Calibration on ${where}: on substantive codes the model matched ${sub?.recall != null ? pc(sub.recall) : DASH} of the ${sub?.ref ?? 0} human codings (recall), and ${sub?.precision != null ? pc(sub.precision) : DASH} of its own ${sub?.other ?? 0} overlapped a human coding of the same code (precision). ${c.result.confusions.map((m) => `${d.groups.get(m.groupId)?.name}: same value on ${m.agree} of ${m.compared} passages both graded`).join('. ')}.`
    }),
    reviews: d.reviews.map((r) => {
      const s = r.summary
      return {
        title: `Review of ${r.source.name.split(' — ')[0]}`,
        text: `${r.reviewers.join(', ')} decided ${s.total} AI codings: ${s.kept} kept as proposed (${s.total ? pc(s.kept / s.total) : DASH}), ${s.recoded} given a different code, ${s.rejected} rejected; ${s.added} codings added by the reviewer.${r.endorsers.length ? ` Endorsed by ${r.endorsers.join(', ')}.` : ''}`,
        changes: s.changes.slice(0, 8).map((c) => `${c.n} × ${tidy(d.codes.get(c.fromId)?.name ?? '?')} → ${tidy(d.codes.get(c.toId)?.name ?? '?')}`),
      }
    }),
  } : null

  const open = { title: so ? 'Limitations' : 'Open items', intro: so ? 'What the sign-off does not cover.' : null, items: openItems(scoped, d) }
  const memos = scoped.memos.map((m) => ({ title: m.title, meta: `${m.kind === 'journal' ? 'Journal' : 'Memo'} · ${m.author} · ${new Date(m.updatedAt).toISOString().slice(0, 10)}`, paragraphs: m.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) }))
  const codes = indexBy(project.codes)
  const codebook = project.groups.map((g) => ({
    title: g.name,
    rows: codesInGroup(project, g.id).map((c) => [tidy(codes.get(c.id)?.name ?? c.name), cell(c.definition), cell(c.include), cell(c.exclude)]),
  })).filter((g) => g.rows.length)

  // ------------------------------------------------------------------ the visual brief's charts and cards
  const labels = people.map((p) => p.label)
  const charts = {
    stance: await chartOf(brief, 'stance'), mix: await chartOf(brief, 'mix'), evidence: await chartOf(brief, 'evidence'),
    raised: await chartOf(brief, 'raised'), coverage: await chartOf(brief, 'coverage'), pairs: await chartOf(brief, 'pairs'),
    asides: await chartOf(brief, 'asides'),
    through: await multiOf(brief, 'through', labels), themes: await multiOf(brief, 'themes', labels),
  }
  const notes = Object.fromEntries(['stance', 'mix', 'evidence', 'raised', 'perspectives', 'through', 'themes', 'coverage', 'pairs', 'quotes', 'asides'].map((id) => [id, noteOf(brief, id)]))
  const cards = blocksOf(brief, 'perspectives', 'cards')[0]?.cards.map((c) => ({ name: c.title, tag: c.tag ?? null, lead: c.lead ?? null, parts: parts(c) })) ?? []
  const quotes = blocksOf(brief, 'quotes', 'quotes')[0]?.quotes.map((q) => ({ title: q.title, summary: q.summary ?? null, text: `“${q.text}”`, cite: q.cite })) ?? []
  const headlines = blocksOf(brief, 'glance', 'list')[0]?.items ?? []
  const limitations = blocksOf(brief, 'open', 'list')[0]?.items ?? []
  const asideItems = person ? blocksOf(brief, 'asides', 'list')[0]?.items ?? [] : []

  // ------------------------------------------------------------------ one page set per participant (the casebook)
  const casebook = person ? [] : await Promise.all(peopleOf(project).map(async (p) => {
    const b = visualBrief(project, DEFAULT_VISUAL, { kind: 'person', personId: p.id }, at)
    const card = blocksOf(b, 'perspectives', 'cards')[0]?.cards[0]
    return {
      name: p.label,
      attributes: attributesLine(project, p.sourceIds),
      tiles: blocksOf(b, 'glance', 'tiles')[0]?.tiles.map(([value, label]) => ({ value, label })) ?? [],
      headlines: blocksOf(b, 'glance', 'list')[0]?.items ?? [],
      charts: { stance: await chartOf(b, 'stance'), raised: await chartOf(b, 'raised'), through: await chartOf(b, 'through'), themes: await chartOf(b, 'themes') },
      card: card ? { tag: card.tag ?? null, lead: card.lead ?? null, parts: parts(card) } : null,
      quotes: blocksOf(b, 'quotes', 'quotes')[0]?.quotes.map((q) => ({ title: q.title, summary: q.summary ?? null, text: `“${q.text}”`, cite: q.cite })) ?? [],
    }
  }))

  return masked(project, {
    study, glance: { tiles, line: glanceLine }, headlines, sources, coverage, perspectives: perspectivesData, asides: asidesData, asideItems,
    framework, profile, codeCounts, figures, ai, open, limitations, memos, codebook, charts, notes, cards, quotes, casebook,
    participants: people.map((p) => p.label).join(', '),
    layout: person ? { columns: 1, throughHeight: 230, themesHeight: 280 } : { columns: 2, throughHeight: 165, themesHeight: 190 },
  })
}

function mixText(c: ProfileCell | undefined) {
  if (!c?.claims.length) return null
  return `${c.claims.length} claim${c.claims.length === 1 ? '' : 's'}: ${c.mixes.map((m) => m.parts.filter((p) => p.n).map((p) => `${short(p.code.name)} ${p.n}`).join(' ')).filter(Boolean).join(' / ')}`
}
const profileCell = (c: ProfileCell | undefined) => (c?.claims.length ? mixText(c)! : 'None coded')

function attributesLine(project: Project, sourceIds: string[]) {
  const a: Record<string, string> = {}
  for (const id of sourceIds) Object.assign(a, project.sources.find((s) => s.id === id)?.attributes ?? {})
  const keep = ['Role level', 'Organisation type', 'Insider status', 'View scope', 'Interview date', 'Modules administered']
  const line = keep.filter((k) => a[k]).map((k) => `${k}: ${a[k]}`).join(' · ')
  return line || null
}
