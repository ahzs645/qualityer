import type { Project, Source } from './types'
import { buildClaims, type Claim } from './claims'
import { formatTime, quotable, segmentsOf, timeAt } from './model'
import { buildPositions, median, peopleOf, VERDICT_LABEL, type Person, type Positions, type Verdict } from './positions'
import { buildMatrix, mkey, patternOrder } from './matrix'
import { cCoefficient, cooccurrence } from './explore'
import { asides, firstSentences, perspectives, reportStatus } from './report'
import { exportNameRisks, forExport } from './names'
import { ALL, personOf, type Scope } from './scope'

// The visual brief: the study as charts first, with only as much text as it
// takes to read them. One brief covers every interview together, or one
// participant set against the rest. It is built as blocks (headings, notes,
// SVG charts, cards, quotes) so the same content renders as a self-contained
// HTML page and as a PDF. Charts are plain SVG with fixed colours, so they
// print, paste into slides and survive the PDF converter.

export const VISUAL_SECTIONS = [
  ['headlines', 'Headlines'],
  ['stance', 'Where people stand'],
  ['mix', 'Stance mix by theme'],
  ['evidence', 'Evidence behind each theme'],
  ['raised', 'Who raised what'],
  ['perspectives', 'Hopes, worries and conditions'],
  ['through', 'Stance through each interview'],
  ['themes', 'Themes through each interview'],
  ['coverage', 'Interview guide coverage'],
  ['pairs', 'Codes that travel together'],
  ['quotes', 'One quote per theme'],
  ['asides', 'Asides'],
  ['open', 'Limitations'],
] as const
export type VisualSection = (typeof VISUAL_SECTIONS)[number][0]
export type VisualOptions = Record<VisualSection, boolean>
export const DEFAULT_VISUAL: VisualOptions = Object.fromEntries(VISUAL_SECTIONS.map(([id]) => [id, true])) as VisualOptions

// ---------------------------------------------------------------------------
// Blocks

export type Block =
  | { t: 'p'; text: string; tone?: 'note' | 'lede' }
  | { t: 'list'; items: string[] }
  | { t: 'tiles'; tiles: [string, string][] }
  | { t: 'svg'; svg: string; w: number; h: number }
  /** Small multiples: charts side by side, two to a row. */
  | { t: 'svgs'; charts: { svg: string; w: number; h: number }[] }
  | { t: 'cards'; cards: Card[] }
  | { t: 'quotes'; quotes: { title: string; text: string; cite: string; summary?: string }[] }

export interface Card { title: string; tag?: string; lead?: string; parts: { heading: string; items: string[] }[] }
export interface VisualSectionOut { id: string; title: string; blocks: Block[] }
export interface VisualBrief { title: string; subtitle: string; meta: string; status: string; anonymised: boolean; sections: VisualSectionOut[] }

// ---------------------------------------------------------------------------
// Colours: the app's light-theme chart tokens (styles/app.css), as hex.

const INK = '#1d2221', MUTED = '#5d6662', GRID = '#e1e0d9', SOFT = '#f4f3ef', ACCENT = '#1f6f6b'
const EVIDENCE = ['#083f3c', '#176f69', '#2f9c92', '#6fc2b8']
const STANCE = ['#1c5cab', '#86b6ef', '#b5b3aa', '#ef9f9e', '#d03b3b']
const NO_GRADE = '#d6d4cc'
const COVERAGE_FILL: Record<string, [string, string, string]> = {
  answered: ['#e3f2e6', '#1f5c2d', 'Answered'], partial: ['#fbf0d9', '#6b4700', 'Partly'], 'no-view': ['#e2f0ee', '#1f6f6b', 'No view'],
  'not-asked': ['#fbe7e2', '#8f2f1d', 'Not asked'], unmarked: [SOFT, MUTED, '—'],
}
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'

const ramp = (r: string[], i: number, n: number) => (i < 0 ? NO_GRADE : n <= r.length ? r[Math.min(i, r.length - 1)] : r[Math.round((i / Math.max(1, n - 1)) * (r.length - 1))])
/** White text on the dark ends of the scales. */
const onFill = (fill: string) => (['#083f3c', '#176f69', '#1c5cab', '#d03b3b', ACCENT].includes(fill) ? '#ffffff' : INK)
/** Sequential teal from near-white to the accent, for counts and shares. */
function seq(t: number) {
  const a = [0xee, 0xf6, 0xf5], b = [0x1f, 0x6f, 0x6b]
  const k = Math.max(0, Math.min(1, t))
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('')}`
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
/** Cut at a word boundary. */
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, s.lastIndexOf(' ', n - 1) > n * 0.6 ? s.lastIndexOf(' ', n - 1) : n - 1).replace(/[\s,;:]+$/, '') + ' …' : s)
const pc = (v: number) => `${Math.round(v * 100)}%`
/** "S1  Supportive" → ["S1", "Supportive"]. */
const parts = (name: string) => { const [k, ...rest] = name.trim().split(/\s{2,}/); return [k, rest.join(' ') || k] as const }
const tidy = (s: string) => s.replace(/\s{2,}/g, ' ').trim()
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function svg(w: number, h: number, alt: string, body: string[]) {
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT}" role="img" aria-label="${esc(alt)}">${body.join('')}</svg>`, w, h }
}
const text = (x: number, y: number, s: string, o: { size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: 'bold' } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size ?? 11}" fill="${o.fill ?? INK}"${o.anchor && o.anchor !== 'start' ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}>${esc(s)}</text>`
const rect = (x: number, y: number, w: number, h: number, fill: string, tip?: string, rx = 3) =>
  w <= 0 || h <= 0 ? '' : `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${fill}">${tip ? `<title>${esc(tip)}</title>` : ''}</rect>`
const line = (x1: number, y1: number, x2: number, y2: number, stroke = GRID, width = 1) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${width}"/>`
/** A row of swatches with labels, starting at x. Returns the markup. */
function legend(x: number, y: number, items: [string, string][], gap = 14) {
  let at = x
  return items.map(([fill, label]) => {
    const out = rect(at, y - 9, 10, 10, fill, undefined, 2) + text(at + 14, y, label, { size: 10, fill: MUTED })
    at += 14 + label.length * 5.3 + gap
    return out
  }).join('')
}

// ---------------------------------------------------------------------------
// Data

interface Data {
  project: Project
  pos: Positions
  people: Person[]
  focus: Person | null
  claims: Claim[]
  /** Accepted claims per person id. */
  byPerson: Map<string, Claim[]>
  stanceAt: Map<string, number>
  gradeAt: Map<string, number>
}

function data(project: Project, scope: Scope): Data {
  const pos = buildPositions(project)
  const claims = buildClaims(project).flatMap((c) => {
    const accepted = c.codings.filter((x) => x.status === 'accepted')
    return accepted.length ? [{ ...c, codings: accepted }] : []
  })
  const people = peopleOf(project)
  const byPerson = new Map(people.map((p) => [p.id, claims.filter((c) => p.sourceIds.includes(c.sourceId))]))
  return {
    project, pos, people, focus: personOf(project, scope), claims, byPerson,
    stanceAt: new Map(pos.stanceCodes.map((c, i) => [c.id, i])),
    gradeAt: new Map(pos.evidenceCodes.map((c, i) => [c.id, i])),
  }
}

const stanceOf = (d: Data, c: Claim) => c.codings.map((x) => d.stanceAt.get(x.codeId)).find((i) => i !== undefined)
const gradeOf = (d: Data, c: Claim) => { const g = c.codings.map((x) => d.gradeAt.get(x.codeId)).filter((i): i is number => i !== undefined); return g.length ? Math.min(...g) : -1 }
const inTheme = (codeIds: string[]) => { const ids = new Set(codeIds); return (c: Claim) => c.codings.some((x) => ids.has(x.codeId)) }
const scopeClaims = (d: Data) => (d.focus ? d.byPerson.get(d.focus.id) ?? [] : d.claims)
const themeLabel = (title: string, n: number) => cut(title, n)
/** "01 Capacity — what exists now" → "01"; titles without a number keep a short form. */
const themeKey = (title: string) => /^(\d+[.\d]*)\s/.exec(title)?.[1] ?? cut(title, 10)
const stanceText = (d: Data, m: number | null) => {
  if (m === null) return 'no stance'
  const at = (i: number) => parts(d.pos.stanceCodes[i]?.name ?? `S${i + 1}`)[0]
  return Number.isInteger(m) ? at(m) : `${at(Math.floor(m))}–${at(Math.ceil(m))}`
}
const sideOf = (m: number | null, n: number) => (m === null ? null : m < (n - 1) / 2 ? 'supportive' : m > (n - 1) / 2 ? 'sceptical' : 'neutral')

// ---------------------------------------------------------------------------
// Charts

/** Themes × participants, each cell the participant's middle stance on the theme. */
function stanceGrid(d: Data) {
  const n = d.pos.stanceCodes.length || 5
  const people = d.people
  const L = 230, V = 150, T = 44, rowH = 28
  const colW = Math.max(56, Math.min(110, (760 - L - V) / Math.max(1, people.length)))
  const W = L + colW * people.length + V
  const H = T + rowH * d.pos.rows.length + 6
  const body: string[] = [
    legend(0, 12, d.pos.stanceCodes.map((c, i) => [ramp(STANCE, i, n), parts(c.name).join(' ')])),
    ...people.map((p, i) => text(L + colW * i + colW / 2, T - 8, p.label, { size: 11, anchor: 'middle', weight: 'bold' })),
    text(L + colW * people.length + 10, T - 8, 'Across people', { size: 10, fill: MUTED }),
  ]
  d.pos.rows.forEach((r, ri) => {
    const y = T + ri * rowH
    body.push(text(0, y + rowH / 2 + 4, themeLabel(r.title, 36)))
    r.people.forEach((p, i) => {
      const x = L + colW * i
      const m = p.median
      if (!p.claims.length) {
        body.push(rect(x + 1, y + 2, colW - 2, rowH - 4, SOFT, `${p.person.label}: ${p.absent === 'not-asked' ? 'not asked' : 'not raised'}`))
        body.push(text(x + colW / 2, y + rowH / 2 + 4, p.absent === 'not-asked' ? 'not asked' : '—', { size: 9.5, fill: MUTED, anchor: 'middle' }))
        return
      }
      const fill = m === null ? '#ebe9e2' : ramp(STANCE, Math.round(m), n)
      body.push(rect(x + 1, y + 2, colW - 2, rowH - 4, fill, `${p.person.label} · ${r.title}: ${stanceText(d, m)} (middle of ${plural(p.stances.length, 'claim')} with a stance; ${plural(p.claims.length, 'claim')} in all)`))
      body.push(text(x + colW / 2, y + rowH / 2 + 4, `${stanceText(d, m)} · ${p.claims.length}`, { size: 10, fill: onFill(fill), anchor: 'middle' }))
    })
    body.push(text(L + colW * people.length + 10, y + rowH / 2 + 4, VERDICT_LABEL[r.verdict], { size: 10.5, fill: r.verdict === 'dissonance' ? '#8f2f1d' : INK, weight: r.verdict === 'dissonance' ? 'bold' : undefined }))
  })
  return svg(W, H, `Where each participant stands on each of ${d.pos.rows.length} themes`, body)
}

/** One participant's middle stance per theme, against the range of everyone else's. */
function stanceVersus(d: Data, focus: Person) {
  const n = d.pos.stanceCodes.length || 5
  const L = 230, R = 150, T = 46, rowH = 26, W = 760
  const x = (m: number) => L + 20 + (m / Math.max(1, n - 1)) * (W - L - R - 40)
  const H = T + rowH * d.pos.rows.length + 8
  const body: string[] = [
    `<circle cx="6" cy="8" r="5" fill="#ffffff" stroke="${ACCENT}" stroke-width="2.5"/>`, text(16, 12, focus.label, { size: 10.5, weight: 'bold' }),
    rect(70, 4, 28, 8, '#d9d7cf', undefined, 4), text(104, 12, 'range of the other participants', { size: 10, fill: MUTED }),
    line(278, 1, 278, 15, MUTED, 2), text(285, 12, 'their middle', { size: 10, fill: MUTED }),
    ...d.pos.stanceCodes.map((c, i) => text(x(i), T - 10, parts(c.name)[0], { size: 10, fill: MUTED, anchor: 'middle' })),
    text(W - R + 10, T - 10, 'Compared with others', { size: 10, fill: MUTED }),
  ]
  d.pos.stanceCodes.forEach((_, i) => body.push(line(x(i), T - 4, x(i), H - 6, GRID, i === (n - 1) / 2 ? 1.5 : 1)))
  d.pos.rows.forEach((r, ri) => {
    const cy = T + ri * rowH + rowH / 2
    body.push(text(0, cy + 4, themeLabel(r.title, 36)))
    const mine = r.people.find((p) => p.person.id === focus.id)
    const others = r.people.filter((p) => p.person.id !== focus.id && p.median !== null).map((p) => p.median!)
    if (others.length) {
      const lo = Math.min(...others), hi = Math.max(...others), mid = median(others)!
      body.push(rect(x(lo) - 4, cy - 4, x(hi) - x(lo) + 8, 8, '#d9d7cf', `Others (${others.length}): ${stanceText(d, lo)} to ${stanceText(d, hi)}, middle ${stanceText(d, mid)}`, 4))
      body.push(line(x(mid), cy - 7, x(mid), cy + 7, MUTED, 2))
    }
    let note = ''
    if (mine?.median != null) {
      body.push(`<circle cx="${x(mine.median).toFixed(1)}" cy="${cy}" r="7" fill="${ramp(STANCE, Math.round(mine.median), n)}" stroke="${ACCENT}" stroke-width="2.5"><title>${esc(`${focus.label} · ${r.title}: ${stanceText(d, mine.median)} from ${plural(mine.stances.length, 'claim')}`)}</title></circle>`)
      const om = others.length ? median(others)! : null
      if (om === null) note = 'only voice'
      else if (sideOf(mine.median, n) !== sideOf(om, n) && sideOf(mine.median, n) !== 'neutral' && sideOf(om, n) !== 'neutral') note = 'opposite side'
      else if (Math.abs(mine.median - om) >= 1.5) note = mine.median < om ? 'more supportive' : 'more sceptical'
      else note = 'in line'
    } else note = mine?.claims.length ? 'no stance coded' : mine?.absent === 'not-asked' ? 'not asked' : 'not raised'
    body.push(text(W - R + 10, cy + 4, note, { size: 10.5, fill: note === 'opposite side' ? '#8f2f1d' : note === 'in line' ? MUTED : INK, weight: note === 'opposite side' ? 'bold' : undefined }))
  })
  return svg(W, H, `${focus.label}'s stance on each theme against the other participants`, body)
}

/** Diverging bars: the share of claims at each stance, supportive to the left of neutral, sceptical to the right. */
function stanceMix(d: Data) {
  const n = d.pos.stanceCodes.length || 5
  const mid = (n - 1) / 2
  const L = 230, W = 760, T = 30, rowH = 24, half = (W - L - 120) / 2
  const cx = L + 50 + half
  const pool = scopeClaims(d)
  const body: string[] = [legend(0, 12, d.pos.stanceCodes.map((c, i) => [ramp(STANCE, i, n), parts(c.name)[1]]))]
  const rows = d.pos.rows.map((r) => {
    const counts = new Array(n).fill(0)
    for (const c of pool.filter(inTheme(r.codeIds))) { const s = stanceOf(d, c); if (s !== undefined) counts[s]++ }
    return { r, counts, total: counts.reduce((a, b) => a + b, 0) }
  })
  const H = T + rowH * rows.length + 8
  body.push(line(cx, T - 4, cx, H - 4, MUTED, 1))
  rows.forEach(({ r, counts, total }, ri) => {
    const y = T + ri * rowH
    body.push(text(0, y + rowH / 2 + 4, themeLabel(r.title, 36)))
    if (!total) { body.push(text(cx + 6, y + rowH / 2 + 4, 'no claims with a stance', { size: 10, fill: MUTED })); return }
    const share = (i: number) => counts[i] / total
    const tip = (i: number) => `${r.title}: ${parts(d.pos.stanceCodes[i].name).join(' ')} ${counts[i]} of ${total} (${pc(share(i))})`
    // Left: middle half, then each supportive step outward. Right: middle half, then each sceptical step.
    let left = cx, right = cx
    const midShare = Number.isInteger(mid) ? share(mid) / 2 : 0
    if (midShare) { body.push(rect(cx - midShare * half, y + 4, midShare * half, rowH - 8, ramp(STANCE, mid, n), tip(mid), 0), rect(cx, y + 4, midShare * half, rowH - 8, ramp(STANCE, mid, n), tip(mid), 0)); left -= midShare * half; right += midShare * half }
    for (let i = Math.ceil(mid) - 1; i >= 0; i--) { const w = share(i) * half; body.push(rect(left - w, y + 4, Math.max(0, w - 1), rowH - 8, ramp(STANCE, i, n), tip(i), 0)); left -= w }
    for (let i = Math.floor(mid) + 1; i < n; i++) { const w = share(i) * half; body.push(rect(right + 1, y + 4, Math.max(0, w - 1), rowH - 8, ramp(STANCE, i, n), tip(i), 0)); right += w }
    const sup = counts.slice(0, Math.ceil(mid)).reduce((a, b) => a + b, 0) / total
    const scep = counts.slice(Math.floor(mid) + 1).reduce((a, b) => a + b, 0) / total
    body.push(text(left - 4, y + rowH / 2 + 4, pc(sup), { size: 9.5, fill: MUTED, anchor: 'end' }))
    body.push(text(right + 4, y + rowH / 2 + 4, `${pc(scep)}  ·  n ${total}`, { size: 9.5, fill: MUTED }))
  })
  return svg(W, H, 'Share of claims at each stance, by theme', body)
}

/** 100% bars of evidence grade per theme. */
function evidenceBars(d: Data) {
  const ng = d.pos.evidenceCodes.length
  const L = 230, W = 760, T = 30, rowH = 24, barW = W - L - 200
  const pool = scopeClaims(d)
  const body: string[] = [legend(0, 12, [...d.pos.evidenceCodes.map((c, i): [string, string] => [ramp(EVIDENCE, i, ng), `${parts(c.name)[0]} ${cut(parts(c.name)[1], 22)}`]), [NO_GRADE, 'No grade']], 10)]
  const H = T + rowH * d.pos.rows.length + 8
  d.pos.rows.forEach((r, ri) => {
    const y = T + ri * rowH
    body.push(text(0, y + rowH / 2 + 4, themeLabel(r.title, 36)))
    const mine = pool.filter(inTheme(r.codeIds))
    if (!mine.length) { body.push(text(L, y + rowH / 2 + 4, 'not raised', { size: 10, fill: MUTED })); return }
    const counts = new Array(ng + 1).fill(0)
    for (const c of mine) { const g = gradeOf(d, c); counts[g < 0 ? ng : g]++ }
    let x = L
    counts.forEach((k, i) => {
      if (!k) return
      const w = (k / mine.length) * barW
      body.push(rect(x, y + 4, Math.max(0, w - 1.5), rowH - 8, i === ng ? NO_GRADE : ramp(EVIDENCE, i, ng), `${r.title}: ${i === ng ? 'No grade' : tidy(d.pos.evidenceCodes[i].name)} ${k} of ${mine.length} (${pc(k / mine.length)})`, 0))
      x += w
    })
    const strong = (counts[0] ?? 0) + (ng > 1 ? counts[1] : 0)
    const peopleNote = d.focus ? '' : ` · ${r.strong}/${d.people.length} people`
    body.push(text(L + barW + 8, y + rowH / 2 + 4, `${pc(strong / mine.length)} E1–2 · n ${mine.length}${peopleNote}`, { size: 9.5, fill: MUTED }))
  })
  return svg(W, H, 'Evidence grade of the claims in each theme', body)
}

/** Code groups × participants: each cell the share of that person's claims in the group. */
function raisedGrid(d: Data) {
  const m = buildMatrix(d.project, 'group')
  const rows = patternOrder(m)
  const L = 230, R = 110, T = 30, rowH = 26
  const colW = Math.max(56, Math.min(110, (760 - L - R) / Math.max(1, m.people.length)))
  const W = L + colW * m.people.length + R
  const H = T + rowH * rows.length + 22
  const max = Math.max(0.01, ...[...m.cells.values()].map((c) => c.share))
  const body: string[] = [
    ...m.people.map((p, i) => text(L + colW * i + colW / 2, T - 10, p.label, { size: 11, anchor: 'middle', weight: 'bold' })),
    text(L + colW * m.people.length + 10, T - 10, 'People', { size: 10, fill: MUTED }),
  ]
  rows.forEach((r, ri) => {
    const y = T + ri * rowH
    body.push(text(0, y + rowH / 2 + 4, cut(tidy(r.name), 36)))
    m.people.forEach((p, i) => {
      const c = m.cells.get(mkey(r.id, p.id))
      const n = c?.claims.length ?? 0
      const fill = n ? seq(0.12 + 0.88 * (c!.share / max)) : SOFT
      body.push(rect(L + colW * i + 1, y + 2, colW - 2, rowH - 4, fill, `${p.label} · ${tidy(r.name)}: ${plural(n, 'claim')}, ${pc(c?.share ?? 0)} of their coded claims`))
      body.push(text(L + colW * i + colW / 2, y + rowH / 2 + 4, n ? pc(c!.share) : '—', { size: 10, anchor: 'middle', fill: n && c!.share / max > 0.55 ? '#ffffff' : n ? INK : MUTED }))
    })
    body.push(text(L + colW * m.people.length + 10, y + rowH / 2 + 4, `${m.reach.get(r.id) ?? 0} of ${m.people.length}`, { size: 10.5 }))
  })
  const ly = T + rowH * rows.length + 16
  body.push(text(0, ly, 'Share of each person\'s coded claims', { size: 10, fill: MUTED }))
  for (let i = 0; i < 6; i++) body.push(rect(200 + i * 22, ly - 9, 20, 10, seq(0.12 + 0.88 * (i / 5)), undefined, 2))
  body.push(text(336, ly, `0 to ${pc(max)}`, { size: 10, fill: MUTED }))
  return svg(W, H, 'Share of each participant\'s claims in each code group', body)
}

/** One participant's share of claims per code group, with the other participants' average as a tick. */
function raisedVersus(d: Data, focus: Person) {
  const m = buildMatrix(d.project, 'group')
  const others = m.people.filter((p) => p.id !== focus.id)
  const rows = m.rows.map((r) => {
    const mine = m.cells.get(mkey(r.id, focus.id))
    const avg = others.length ? others.reduce((a, p) => a + (m.cells.get(mkey(r.id, p.id))?.share ?? 0), 0) / others.length : 0
    const raisedBy = others.filter((p) => (m.cells.get(mkey(r.id, p.id))?.claims.length ?? 0) > 0).length
    return { r, share: mine?.share ?? 0, n: mine?.claims.length ?? 0, avg, raisedBy }
  }).sort((a, b) => b.share - a.share)
  const L = 230, W = 760, T = 30, rowH = 24, barW = W - L - 200
  const max = Math.max(0.01, ...rows.flatMap((x) => [x.share, x.avg]))
  const H = T + rowH * rows.length + 8
  const body: string[] = [
    rect(0, 3, 10, 10, ACCENT, undefined, 2), text(14, 12, `${focus.label}'s share of their claims`, { size: 10, fill: MUTED }),
    line(220, 3, 220, 13, INK, 2), text(226, 12, 'average of the other participants', { size: 10, fill: MUTED }),
  ]
  rows.forEach((x, ri) => {
    const y = T + ri * rowH
    body.push(text(0, y + rowH / 2 + 4, cut(tidy(x.r.name), 36)))
    body.push(rect(L, y + 5, (x.share / max) * barW, rowH - 10, ACCENT, `${focus.label} · ${tidy(x.r.name)}: ${plural(x.n, 'claim')} (${pc(x.share)})`, 2))
    if (others.length) body.push(line(L + (x.avg / max) * barW, y + 2, L + (x.avg / max) * barW, y + rowH - 2, INK, 2))
    body.push(text(L + barW + 10, y + rowH / 2 + 4, `${pc(x.share)} · others ${pc(x.avg)}${x.n && !x.raisedBy && others.length ? ' · only them' : ''}`, { size: 9.5, fill: MUTED }))
  })
  return svg(W, H, `${focus.label}'s share of claims per code group against the other participants`, body)
}

/** Stance of each claim in interview order, with a running average. */
function stanceThrough(d: Data, person: Person, wide: boolean) {
  const n = d.pos.stanceCodes.length || 5
  const W = wide ? 760 : 370, H = wide ? 190 : 140, L = 30, R = 8, T = 22, B = 18
  const points = (d.byPerson.get(person.id) ?? []).flatMap((c) => {
    const st = stanceOf(d, c)
    const len = d.project.sources.find((s) => s.id === c.sourceId)?.text.length || 1
    const idx = person.sourceIds.indexOf(c.sourceId)
    return st === undefined ? [] : [{ st, at: (idx + c.start / len) / person.sourceIds.length, c }]
  }).sort((a, b) => a.at - b.at)
  const x = (at: number) => L + at * (W - L - R)
  const y = (st: number) => T + (st / Math.max(1, n - 1)) * (H - T - B)
  const body: string[] = [text(0, 12, `${person.label}`, { size: 11, weight: 'bold' }), text(8 + person.label.length * 7, 12, `· ${plural(points.length, 'claim')} with a stance`, { size: 10, fill: MUTED })]
  d.pos.stanceCodes.forEach((c, i) => { body.push(line(L, y(i), W - R, y(i), GRID, i === (n - 1) / 2 ? 1.5 : 1), text(L - 5, y(i) + 3, parts(c.name)[0], { size: 9, fill: MUTED, anchor: 'end' })) })
  ;['start', 'middle', 'end'].forEach((t, i) => body.push(text(x(i / 2), H - 4, t, { size: 9, fill: MUTED, anchor: i === 0 ? 'start' : i === 2 ? 'end' : 'middle' })))
  for (const p of points) body.push(`<circle cx="${x(p.at).toFixed(1)}" cy="${y(p.st).toFixed(1)}" r="${wide ? 3.2 : 2.6}" fill="${ramp(STANCE, p.st, n)}" fill-opacity="0.85" stroke="#ffffff" stroke-width="0.75"/>`)
  if (points.length > 4) {
    const run = running(points.map((p) => p.st))
    body.push(`<polyline fill="none" stroke="${INK}" stroke-opacity="0.75" stroke-width="1.6" stroke-linejoin="round" points="${run.map((v, i) => `${x(points[i].at).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`)
  }
  return svg(W, H, `${person.label}: stance of ${points.length} claims in interview order`, body)
}

export function running(xs: number[], w = 15): number[] {
  const h = Math.floor(w / 2)
  return xs.map((_, i) => { const part = xs.slice(Math.max(0, i - h), i + h + 1); return part.reduce((a, b) => a + b, 0) / part.length })
}

/** Where each theme was talked about, from the start of the interview to the end, in bins. */
function themesThrough(d: Data, person: Person, wide: boolean) {
  const BINS = wide ? 30 : 20
  const W = wide ? 760 : 370, L = wide ? 230 : 34, T = 22, rowH = wide ? 20 : 13
  const H = T + rowH * d.pos.rows.length + 18
  const cw = (W - L - 4) / BINS
  const mine = d.byPerson.get(person.id) ?? []
  const lenOf = (id: string) => d.project.sources.find((s) => s.id === id)?.text.length || 1
  const grid = d.pos.rows.map((r) => {
    const bins = new Array(BINS).fill(0)
    for (const c of mine.filter(inTheme(r.codeIds))) {
      const idx = person.sourceIds.indexOf(c.sourceId)
      const at = (idx + c.start / lenOf(c.sourceId)) / person.sourceIds.length
      bins[Math.min(BINS - 1, Math.floor(at * BINS))]++
    }
    return { r, bins }
  })
  const max = Math.max(1, ...grid.flatMap((g) => g.bins))
  const body: string[] = [text(0, 12, person.label, { size: 11, weight: 'bold' })]
  grid.forEach(({ r, bins }, ri) => {
    const y = T + ri * rowH
    body.push(text(wide ? 0 : L - 5, y + rowH / 2 + 3.5, wide ? themeLabel(r.title, 36) : themeKey(r.title), { size: wide ? 10.5 : 9, fill: wide ? INK : MUTED, anchor: wide ? 'start' : 'end' }))
    bins.forEach((k, i) => body.push(rect(L + i * cw + 0.5, y + 1, cw - 1, rowH - 2, k ? seq(0.15 + 0.85 * (k / max)) : SOFT, k ? `${r.title}: ${plural(k, 'claim')} in this part of the interview` : undefined, 1.5)))
  })
  ;['start', 'middle', 'end'].forEach((t, i) => body.push(text(L + (i / 2) * (W - L - 4), H - 3, t, { size: 9, fill: MUTED, anchor: i === 0 ? 'start' : i === 2 ? 'end' : 'middle' })))
  return svg(W, H, `${person.label}: where each theme came up through the interview`, body)
}

/** Guide questions × interviews, each cell its coverage mark. */
function coverageGrid(d: Data) {
  const sources = d.focus ? d.project.sources.filter((s) => d.focus!.sourceIds.includes(s.id)) : d.project.sources
  const L = 260, T = 40, rowH = 22
  const colW = Math.max(70, Math.min(110, (760 - L) / Math.max(1, sources.length)))
  const W = Math.max(L + colW * sources.length, 520)
  const H = T + rowH * d.project.guide.length + 4
  const body: string[] = [legend(0, 12, (['answered', 'partial', 'no-view', 'not-asked', 'unmarked'] as const).map((k) => [COVERAGE_FILL[k][0], k === 'unmarked' ? 'Not marked' : COVERAGE_FILL[k][2]]))]
  sources.forEach((s, i) => body.push(text(L + colW * i + colW / 2, T - 8, cut(s.name.split(' — ')[0], 14), { size: 11, anchor: 'middle', weight: 'bold' })))
  d.project.guide.forEach((q, qi) => {
    const y = T + qi * rowH
    body.push(text(0, y + rowH / 2 + 4, cut(`${q.key} ${q.title}`, 42), { size: 10.5 }))
    sources.forEach((s, i) => {
      const m = d.project.coverage.find((c) => c.sourceId === s.id && c.questionId === q.id)
      const [fill, ink, label] = COVERAGE_FILL[m?.status ?? 'unmarked']
      body.push(rect(L + colW * i + 1, y + 2, colW - 2, rowH - 4, fill, `${s.name.split(' — ')[0]} · ${q.key}: ${label}${m?.note ? ` — ${m.note}` : ''}`))
      body.push(text(L + colW * i + colW / 2, y + rowH / 2 + 4, label, { size: 9.5, fill: ink, anchor: 'middle' }))
    })
  })
  return svg(W, H, 'Interview guide coverage by interview', body)
}

/** The substantive code pairs most often coded on the same passage, by c-coefficient. */
function codePairs(d: Data) {
  const sourceIds = d.focus ? d.focus.sourceIds : d.project.sources.map((s) => s.id)
  const kinds = new Map(d.project.groups.map((g) => [g.id, g.kind]))
  const codes = new Map(d.project.codes.map((c) => [c.id, c]))
  const topGroup = (id: string): string | null => { let c = codes.get(id); for (let i = 0; c && !c.groupId && c.parentId && i < 20; i++) c = codes.get(c.parentId); return c?.groupId ?? null }
  const substantive = (id: string) => kinds.get(topGroup(id) ?? '') === 'substantive'
  const counts = cooccurrence(d.project, sourceIds)
  const spans = new Map<string, Set<string>>()
  const people = new Map<string, Set<string>>()
  for (const c of d.project.codings) if (c.status === 'accepted' && sourceIds.includes(c.sourceId)) {
    if (!spans.has(c.codeId)) spans.set(c.codeId, new Set())
    spans.get(c.codeId)!.add(`${c.sourceId}:${c.start}:${c.end}`)
  }
  if (!d.focus) for (const sid of sourceIds) for (const k of cooccurrence(d.project, [sid]).keys()) { if (!people.has(k)) people.set(k, new Set()); people.get(k)!.add(sid) }
  const minShared = d.focus ? 2 : 3
  const pairs = [...counts].filter(([k, n]) => { const [a, b] = k.split('|'); return n >= minShared && substantive(a) && substantive(b) && !isAncestor(codes, a, b) })
    .map(([k, n]) => { const [a, b] = k.split('|'); return { a, b, n, c: cCoefficient(n, spans.get(a)?.size ?? 0, spans.get(b)?.size ?? 0), people: people.get(k)?.size ?? 0 } })
    .sort((x, y) => y.c - x.c || y.n - x.n).slice(0, 12)
  if (!pairs.length) return null
  const L = 430, W = 760, T = 8, rowH = 24, barW = W - L - 150
  const max = Math.max(...pairs.map((p) => p.c))
  const H = T + rowH * pairs.length + 4
  const name = (id: string) => cut(tidy(codes.get(id)?.name ?? '?'), 36)
  const body: string[] = []
  pairs.forEach((p, i) => {
    const y = T + i * rowH
    body.push(text(0, y + rowH / 2 + 4, `${name(p.a)}  +  ${name(p.b)}`, { size: 10 }))
    body.push(rect(L, y + 5, (p.c / max) * barW, rowH - 10, ACCENT, `c = ${p.c.toFixed(2)}: ${p.n} shared passages`, 2))
    body.push(text(L + (p.c / max) * barW + 6, y + rowH / 2 + 4, `${p.c.toFixed(2).replace(/^0/, '')} · ${p.n} passages${d.focus ? '' : ` · ${p.people} people`}`, { size: 9.5, fill: MUTED }))
  })
  return svg(W, H, 'Code pairs most often applied to the same passage', body)
}
function isAncestor(codes: Map<string, { parentId: string | null }>, a: string, b: string) {
  const up = (x: string, y: string) => { for (let c = codes.get(x)?.parentId, i = 0; c && i < 20; c = codes.get(c)?.parentId, i++) if (c === y) return true; return false }
  return up(a, b) || up(b, a)
}

/** Asides questions × participants: how many passages each answer picked out. */
function asidesGrid(d: Data, side: ReturnType<typeof asides>) {
  const people = d.people
  const L = 300, T = 26, rowH = 24
  const colW = Math.max(56, Math.min(100, (760 - L) / Math.max(1, people.length)))
  const W = L + colW * people.length, H = T + rowH * side.length + 4
  const max = Math.max(1, ...side.flatMap((q) => q.rows.map((r) => r.items.length)))
  const body: string[] = people.map((p, i) => text(L + colW * i + colW / 2, T - 8, p.label, { size: 11, anchor: 'middle', weight: 'bold' }))
  side.forEach((q, qi) => {
    const y = T + qi * rowH
    body.push(text(0, y + rowH / 2 + 4, cut(q.prompt.title, 44) + (q.sensitive ? ' (counts only)' : ''), { size: 10.5 }))
    people.forEach((p, i) => {
      const n = q.rows.filter((r) => p.sourceIds.includes(r.source.id)).reduce((a, r) => a + r.items.length, 0)
      const fill = n ? seq(0.12 + 0.88 * (n / max)) : SOFT
      body.push(rect(L + colW * i + 1, y + 2, colW - 2, rowH - 4, fill, `${p.label} · ${q.prompt.title}: ${n}`))
      body.push(text(L + colW * i + colW / 2, y + rowH / 2 + 4, String(n || '—'), { size: 10, anchor: 'middle', fill: n / max > 0.55 ? '#ffffff' : n ? INK : MUTED }))
    })
  })
  return svg(W, H, 'Asides found per question and participant', body)
}

// ---------------------------------------------------------------------------
// Text pieces

/**
 * An Ask answer as a card: "Overall: label. Lead." then headed lists such as
 * "Hopes:", "Worries:" and "Conditions for their support:". With `brief`, each
 * item keeps only the words before its quote.
 */
export function answerCard(title: string, text: string, brief: boolean): Card {
  const clean = (s: string) => s.replace(/\s*\[T\d{4}(?:[,–-]\s*T?\d{4})*\]/g, '').replace(/\*\*/g, '').trim()
  // "Funding: "money is the top one"" → "Funding"; an item whose quote is part of the sentence stays whole.
  const short = (s: string) => {
    const c = clean(s)
    if (!brief) return c
    const labelled = /^(.{3,}?):\s*["“(]/.exec(c)
    return clip(labelled ? labelled[1] : c, 150)
  }
  let tag: string | undefined, lead: string | undefined
  const card: Card = { title, parts: [] }
  let current: { heading: string; items: string[] } | null = null
  for (const raw of text.split('\n')) {
    const lineText = raw.trim()
    if (!lineText) continue
    const overall = /^(?:\*\*)?overall(?: stance)?:?(?:\*\*)?\s*([^.\n]+?)\.\s*(.*)$/i.exec(lineText)
    if (overall && !tag) { tag = clean(overall[1]); if (overall[2]) lead = clean(overall[2]); continue }
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(lineText)
    if (bullet) { if (!current) { current = { heading: '', items: [] }; card.parts.push(current) } current.items.push(short(bullet[1])); continue }
    const head = /^(?:\*\*)?([A-Z][^:]{2,40}?):(?:\*\*)?\s*(.*)$/.exec(lineText)
    if (head) {
      current = { heading: clean(head[1]), items: [] }
      card.parts.push(current)
      if (head[2]) { current.items.push(brief ? clip(clean(head[2]).replace(/\s*;\s*this suggests.*$/i, '.'), 170) : clean(head[2])); current = null }
      continue
    }
    if (!lead) lead = clean(lineText)
    else if (!brief) card.parts.push({ heading: '', items: [clean(lineText)] })
  }
  if (brief && lead) lead = clip(lead, 220)
  return { ...card, tag: tag && tag.length <= 60 ? tag : undefined, lead }
}

function headlines(d: Data): string[] {
  const out: string[] = []
  const n = d.pos.stanceCodes.length || 5
  const rows = d.pos.rows
  const by = (v: Verdict) => rows.filter((r) => r.verdict === v).map((r) => r.title)
  const bare = (x: string) => x.replace(/^\d+[.\d]*\s+/, '')
  const list = (xs: string[]) => xs.map(bare).join(', ')
  if (!d.focus) {
    const agree = by('agreement'), dis = by('dissonance')
    if (agree.length) out.push(`Agreement on ${agree.length} of ${rows.length} themes: ${list(agree)}.`)
    if (dis.length) out.push(`People pull in different directions on ${list(dis)}: some lean supportive and some sceptical.`)
    const other = rows.filter((r) => !['agreement', 'dissonance'].includes(r.verdict))
    if (other.length) out.push(`${other.map((r) => `${bare(r.title)}: ${VERDICT_LABEL[r.verdict].toLowerCase()}`).join('; ')}.`)
    const everyone = rows.filter((r) => r.raised === d.people.length)
    if (everyone.length && everyone.length < rows.length) out.push(`${everyone.length} of ${rows.length} themes were raised by every participant; not ${list(rows.filter((r) => r.raised < d.people.length).map((r) => `${r.title} (${r.raised} of ${d.people.length})`))}.`)
    else if (everyone.length) out.push(`Every participant raised every theme.`)
  } else {
    const f = d.focus
    const mine = rows.map((r) => ({ r, p: r.people.find((x) => x.person.id === f.id)! }))
    const raised = mine.filter((x) => x.p.claims.length)
    out.push(`${f.label} raised ${raised.length} of ${rows.length} themes in ${plural((d.byPerson.get(f.id) ?? []).length, 'coded claim')}.`)
    const sup = raised.filter((x) => sideOf(x.p.median, n) === 'supportive').map((x) => x.r.title)
    const scep = raised.filter((x) => sideOf(x.p.median, n) === 'sceptical').map((x) => x.r.title)
    if (sup.length) out.push(`Leans supportive on ${list(sup)}.`)
    if (scep.length) out.push(`Leans sceptical on ${list(scep)}.`)
    const differs = mine.flatMap(({ r, p }) => {
      const others = r.people.filter((x) => x.person.id !== f.id && x.median !== null).map((x) => x.median!)
      if (p.median === null || !others.length) return []
      const om = median(others)!
      return Math.abs(p.median - om) >= 1.5 || (sideOf(p.median, n) !== sideOf(om, n) && sideOf(p.median, n) !== 'neutral' && sideOf(om, n) !== 'neutral') ? [`${bare(r.title)} (${stanceText(d, p.median)}, others ${stanceText(d, om)})`] : []
    })
    out.push(differs.length ? `Stands apart from the others on ${differs.join('; ')}.` : 'On every theme they raised, their middle stance is close to the others\'.')
  }
  const pool = scopeClaims(d)
  const ng = d.pos.evidenceCodes.length
  const strongShare = rows.map((r) => { const c = pool.filter(inTheme(r.codeIds)); return { r, n: c.length, s: c.length ? c.filter((x) => { const g = gradeOf(d, x); return g >= 0 && g < Math.min(2, ng) }).length / c.length : 0 } }).filter((x) => x.n >= 5).sort((a, b) => b.s - a.s)
  if (strongShare.length > 1) out.push(`Best-evidenced theme: ${bare(strongShare[0].r.title)} (${pc(strongShare[0].s)} of claims documented or firsthand). Least: ${bare(strongShare[strongShare.length - 1].r.title)} (${pc(strongShare[strongShare.length - 1].s)}), mostly opinion and estimate.`)
  const lean = rows.map((r) => { const s = pool.filter(inTheme(r.codeIds)).map((c) => stanceOf(d, c)).filter((x): x is number => x !== undefined); return { r, n: s.length, sc: s.length ? s.filter((x) => x > (n - 1) / 2).length / s.length : 0 } }).filter((x) => x.n >= 5).sort((a, b) => b.sc - a.sc)
  if (lean.length && lean[0].sc > 0) out.push(`Most sceptical talk: ${bare(lean[0].r.title)} (${pc(lean[0].sc)} of its claims sceptical or opposed). Themes about problems invite this; read it as where the concerns sit, not as opposition to the proposal.`)
  return out
}

function limitations(project: Project): string[] {
  const out: string[] = []
  for (const s of project.sources) {
    const notAsked = project.guide.filter((q) => project.coverage.some((m) => m.sourceId === s.id && m.questionId === q.id && m.status === 'not-asked')).map((q) => q.key)
    if (notAsked.length) out.push(`${s.name.split(' — ')[0]} was not asked ${notAsked.join(', ')}: no codes there is not the same as no view.`)
  }
  const uncertain = project.sources.reduce((n, s) => n + (s.segments ?? []).reduce((k, g) => k + (g.uncertain?.length ?? 0), 0), 0)
  if (uncertain) out.push(`${uncertain.toLocaleString()} low-confidence words in machine transcripts have not been checked against the recordings.`)
  if (project.restricted.length) out.push(`${plural(project.restricted.length, 'passage is', 'passages are')} marked off the record; the wording is withheld here.`)
  const unmarked = project.guide.length * project.sources.length - project.coverage.filter((c) => c.status !== 'unmarked').length
  if (unmarked > 0 && project.guide.length) out.push(`${plural(unmarked, 'guide question')} have no coverage mark.`)
  if (project.anonymise && project.names.some((e) => e.mask)) {
    const r = exportNameRisks(project)
    if (r.leaks.length) out.push(`${plural(r.leaks.length, 'short form')} of masked names (such as ${r.leaks.slice(0, 3).map((c) => c.text).join(', ')}) are not masked yet; read the quotes before sharing.`)
  }
  out.push('Counts describe the coding, not how common a view is. With a handful of interviews, read every chart as a lead to check in the transcripts.')
  return out
}

/** One pinned quote per theme, spread across participants (or the focus participant's own). */
function themeQuotes(d: Data) {
  const sources = new Map(d.project.sources.map((s) => [s.id, s]))
  const codings = new Map(d.project.codings.map((c) => [c.id, c]))
  const cases = d.focus ? d.project.cases.filter((k) => k.sourceIds.some((id) => d.focus!.sourceIds.includes(id))) : d.project.cases
  return d.project.themes.flatMap((t, ti) => {
    const order = cases.map((_, i) => cases[(i + ti) % cases.length])
    const options = order.flatMap((k) => {
      const cell = d.project.cells.find((c) => c.caseId === k.id && c.themeId === t.id)
      return (cell?.pinned ?? []).map((id) => codings.get(id)).filter((c) => !!c).map((c) => {
        const s = sources.get(c!.sourceId) as Source | undefined
        return { k, cell, text: quotable(d.project, s, c!.start, c!.end), time: s ? formatTime(timeAt(s, c!.start)) : '' }
      })
    }).filter((q) => q.text && !q.text.includes('[withheld'))
    if (!options.length) return []
    const pick = options.find((q) => q.text.length >= 40 && q.text.length <= 260) ?? [...options].sort((a, b) => a.text.length - b.text.length)[0]
    return [{ title: t.title, text: pick.text, cite: [pick.k.name, pick.time].filter(Boolean).join(' · '), summary: d.focus && pick.cell?.summary ? cut(firstSentences(pick.cell.summary.replace(/\s*\(Checked against[^)]*\)\s*$/i, ''), 2), 360) : undefined }]
  })
}

// ---------------------------------------------------------------------------
// The brief

export function visualBrief(project: Project, opts: VisualOptions = DEFAULT_VISUAL, scope: Scope = ALL, generatedAt = new Date()): VisualBrief {
  const d = data(project, scope)
  const f = d.focus
  const sections: VisualSectionOut[] = []
  const add = (id: string, title: string, blocks: (Block | null | false)[]) => { const b = blocks.filter((x): x is Block => !!x); if (b.length) sections.push({ id, title, blocks: b }) }
  const scopedSources = f ? project.sources.filter((s) => f.sourceIds.includes(s.id)) : project.sources
  const seconds = scopedSources.reduce((n, s) => n + (s.media?.duration ?? [...segmentsOf(s)].reverse().find((g) => g.time != null)?.time ?? 0), 0)
  const pool = scopeClaims(d)
  const n = d.pos.stanceCodes.length || 5
  const stanced = pool.map((c) => stanceOf(d, c)).filter((x): x is number => x !== undefined)

  // At a glance
  const tiles: [string, string][] = f
    ? [
      [seconds ? formatTime(seconds) : '—', 'interview length'],
      [String(pool.length), 'coded claims'],
      [`${d.pos.rows.filter((r) => r.people.find((p) => p.person.id === f.id)?.claims.length).length} of ${d.pos.rows.length}`, 'themes raised'],
      [stanced.length ? pc(stanced.filter((x) => x < (n - 1) / 2).length / stanced.length) : '—', 'of their stances supportive'],
      [stanced.length ? pc(stanced.filter((x) => x > (n - 1) / 2).length / stanced.length) : '—', 'sceptical or opposed'],
    ]
    : [
      [String(project.sources.length), 'interviews'],
      [seconds ? `${(seconds / 3600).toFixed(1)} h` : '—', 'of conversation'],
      [String(pool.length), 'coded claims'],
      [`${d.pos.rows.filter((r) => r.verdict === 'agreement').length} of ${d.pos.rows.length}`, 'themes in agreement'],
      [String(d.pos.rows.filter((r) => r.verdict === 'dissonance').length), 'themes with dissonance'],
    ]
  add('glance', 'At a glance', [{ t: 'tiles', tiles }, opts.headlines && { t: 'list', items: headlines(d) }])

  if (opts.stance && d.pos.rows.length && d.pos.stanceCodes.length) add('stance', 'Where people stand', f
    ? [{ t: 'p', tone: 'note', text: `${f.label}'s middle stance on each theme (the ringed dot), against the spread of the other participants (grey band) and their middle (tick). Other participants are not named.` }, { t: 'svg', ...stanceVersus(d, f) }]
    : [{ t: 'p', tone: 'note', text: 'Each cell is a participant\'s middle stance on the theme, then how many claims they made on it. The right column labels the theme: agreement when everyone who took a position leaned the same way, dissonance when some leaned supportive and others sceptical.' }, { t: 'svg', ...stanceGrid(d) }])

  if (opts.mix && d.pos.stanceCodes.length) add('mix', 'Stance mix by theme', [
    { t: 'p', tone: 'note', text: `Every claim with a stance${f ? ` from ${f.label}` : ''}, supportive to the left of the line and sceptical to the right; neutral is split across it. Numbers are the supportive and sceptical shares.` },
    { t: 'svg', ...stanceMix(d) },
  ])

  if (opts.evidence && d.pos.evidenceCodes.length) add('evidence', 'Evidence behind each theme', [
    { t: 'p', tone: 'note', text: 'The kind of support the speaker gave, strongest first. A grade says where the knowledge comes from (a document, firsthand experience, hearsay, opinion), not whether it is true.' },
    { t: 'svg', ...evidenceBars(d) },
  ])

  if (opts.raised && project.groups.some((g) => g.kind === 'substantive')) add('raised', 'Who raised what', f
    ? [{ t: 'p', tone: 'note', text: `How ${f.label}'s coded claims divide among the code groups, against the average of the other participants. Shares, not counts, so the length of an interview does not decide the picture.` }, { t: 'svg', ...raisedVersus(d, f) }]
    : [{ t: 'p', tone: 'note', text: 'Each cell is the share of that person\'s coded claims in the group, so a long interview does not dominate. Rows are ordered by how many people raised them.' }, { t: 'svg', ...raisedGrid(d) }])

  if (opts.perspectives) {
    const persp = perspectives(project, null)
    const rows = persp ? persp.rows.filter((r) => !f || f.sourceIds.includes(r.source.id)) : []
    if (persp && rows.length) add('perspectives', 'Hopes, worries and conditions', [
      { t: 'p', tone: 'note', text: `From the question “${persp.prompt.title}”, put to each interview separately and answered by ${persp.models.join(', ')} from the full transcript. Quotes were checked against the transcript${f ? '' : '; the full report has them'}.` },
      { t: 'cards', cards: rows.map((r) => answerCard(f ? f.label : peopleOf(project).find((p) => p.sourceIds.includes(r.source.id))?.label ?? r.source.name, r.answer.text, !f)) },
    ])
  }

  if (opts.through && d.pos.stanceCodes.length) add('through', 'Stance through each interview', [
    { t: 'p', tone: 'note', text: 'Each dot is a claim, placed by how far into the transcript it starts and by its stance; the line is a running average of 15 claims. The interview follows the guide, so a sceptical run usually means the questions turned to barriers or risks.' },
    f ? { t: 'svg', ...stanceThrough(d, f, true) } : { t: 'svgs', charts: d.people.map((p) => stanceThrough(d, p, false)) },
  ])

  if (opts.themes && d.pos.rows.length) add('themes', 'Themes through each interview', [
    { t: 'p', tone: 'note', text: `Where each theme came up, from the start of the interview to the end; darker means more coded claims.${f ? '' : ` Rows are the themes: ${d.pos.rows.map((r) => r.title).join(' · ')}.`}` },
    f ? { t: 'svg', ...themesThrough(d, f, true) } : { t: 'svgs', charts: d.people.map((p) => themesThrough(d, p, false)) },
  ])

  if (opts.coverage && project.guide.length) add('coverage', 'Interview guide coverage', [
    { t: 'p', tone: 'note', text: '“Not asked” is kept apart from “asked, no view”, so a missing code is not read as a missing opinion.' },
    { t: 'svg', ...coverageGrid(d) },
  ])

  if (opts.pairs) {
    const pairs = codePairs(d)
    if (pairs) add('pairs', 'Codes that travel together', [{ t: 'p', tone: 'note', text: 'Pairs of topic codes most often applied to the same passage, by strength: shared passages over passages with either code (0 never together, 1 always). Useful for spotting ideas people link, such as a barrier and the gap it causes.' }, { t: 'svg', ...pairs }])
  }

  if (opts.quotes) {
    const quotes = themeQuotes(d)
    if (quotes.length) add('quotes', f ? `${f.label}, theme by theme` : 'One quote per theme', [
      { t: 'p', tone: 'note', text: f ? 'The framework summary for each theme, shortened, with one of the quotes pinned as its evidence.' : 'One of the quotes pinned as evidence for each theme, taken in turn from different participants.' },
      { t: 'quotes', quotes },
    ])
  }

  if (opts.asides) {
    const side = asides(project)
    if (side.length) {
      if (f) {
        const items = side.flatMap((q) => {
          const mine = q.rows.filter((r) => f.sourceIds.includes(r.source.id)).flatMap((r) => r.items)
          if (!mine.length) return []
          return [q.sensitive ? `${q.prompt.title}: ${mine.length} (not quoted; check before quoting anything near them)` : `${q.prompt.title}: ${mine.slice(0, 3).map((it) => cut(it.note, 140)).join(' · ')}${mine.length > 3 ? ` (+${mine.length - 3} more)` : ''}`]
        })
        if (items.length) add('asides', 'Asides', [{ t: 'p', tone: 'note', text: 'Passages outside the topic questions, kept apart from the charts above.' }, { t: 'list', items }])
      } else add('asides', 'Asides', [{ t: 'p', tone: 'note', text: 'Passages outside the topic questions (remarks to the interviewer, advice, promises, the participant\'s own stake), counted per interview. They are kept apart from the charts above; the off-the-record question is counts only.' }, { t: 'svg', ...asidesGrid(d, side) }])
    }
  }

  if (opts.open) add('open', project.signoff ? 'Limitations' : 'Open items', [{ t: 'list', items: limitations(f ? { ...project, sources: scopedSources, coverage: project.coverage.filter((c) => f.sourceIds.includes(c.sourceId)), restricted: project.restricted.filter((r) => f.sourceIds.includes(r.sourceId)) } : project) }])

  const scopeText = f ? `One participant: ${f.label}` : `All ${plural(project.sources.length, 'interview')} together`
  return {
    title: project.name,
    subtitle: project.question,
    meta: `Visual brief · ${scopeText} · generated ${generatedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`,
    status: reportStatus(project),
    anonymised: project.anonymise && project.names.some((e) => e.mask),
    sections,
  }
}

// ---------------------------------------------------------------------------
// HTML

const CSS = `
:root{--ink:${INK};--muted:${MUTED};--line:#dedcd4;--soft:${SOFT};--accent:${ACCENT}}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:15px/1.5 ${FONT}}
main{max-width:62rem;margin:0 auto;padding:2.2rem 1rem 4rem}
h1{font-size:1.7rem;line-height:1.25;margin:0 0 .4rem;text-wrap:balance}
h2{font-size:1.2rem;margin:2.4rem 0 .5rem;padding-top:1rem;border-top:1px solid var(--line)}
p{margin:.45rem 0}.lede{font-size:1.05rem;max-width:46rem}
.meta,.note{color:var(--muted);font-size:.86rem}
.status{background:#fbf0d9;border-radius:6px;padding:.55rem .8rem;margin:.9rem 0;color:#6b4700;font-size:.9rem}.status.final{background:#e3f2e6;color:#1f5c2d}
nav.toc{display:flex;flex-wrap:wrap;gap:.3rem .9rem;margin:1rem 0 0;font-size:.85rem}nav.toc a{color:var(--accent);text-decoration:none}nav.toc a:hover{text-decoration:underline}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.6rem;margin:.8rem 0}
.tile{border:1px solid var(--line);border-radius:8px;padding:.6rem .8rem}.tile b{display:block;font-size:1.6rem;line-height:1.2}.tile span{color:var(--muted);font-size:.8rem}
ul{padding-left:1.2rem;margin:.4rem 0}li{margin:.2rem 0}
figure{margin:.6rem 0;overflow-x:auto}figure svg{display:block;max-width:100%;height:auto}
.multi{display:grid;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));gap:1rem 1.5rem;margin:.6rem 0}.multi svg{display:block;width:100%;height:auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.8rem}
.card{border:1px solid var(--line);border-radius:8px;padding:.7rem .9rem;break-inside:avoid;font-size:.9rem}
.card h3{margin:0 0 .3rem;font-size:1rem}.card h4{margin:.55rem 0 .15rem;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.card ul{padding-left:1rem}.tag{display:inline-block;border-radius:4px;padding:0 .4rem;font-size:.78rem;font-weight:500;background:#e2f0ee;color:#1f6f6b;margin-left:.3rem;vertical-align:1px}
.quotes{display:grid;gap:.7rem}.q{border-left:3px solid var(--accent);padding:.15rem 0 .15rem .8rem;break-inside:avoid}
.q h3{margin:0;font-size:.82rem;color:var(--muted);font-weight:600}.q blockquote{margin:.2rem 0;font:1rem/1.45 Georgia,"Iowan Old Style",serif}.q small{color:var(--muted);font-size:.8rem}.q p{font-size:.9rem;margin:.2rem 0}
@media print{main{padding:0;max-width:none}nav.toc{display:none}h2{break-after:avoid}figure,.card,.q,.tile{break-inside:avoid}body{font-size:10.5pt}}
`

function blockHTML(b: Block): string {
  switch (b.t) {
    case 'p': return `<p class="${b.tone ?? ''}">${esc(b.text)}</p>`
    case 'list': return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    case 'tiles': return `<div class="tiles">${b.tiles.map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`
    case 'svg': return `<figure>${b.svg}</figure>`
    case 'svgs': return `<div class="multi">${b.charts.map((c) => `<figure>${c.svg}</figure>`).join('')}</div>`
    case 'cards': return `<div class="cards">${b.cards.map((c) => `<div class="card"><h3>${esc(c.title)}${c.tag ? `<span class="tag">${esc(c.tag)}</span>` : ''}</h3>${c.lead ? `<p>${esc(c.lead)}</p>` : ''}${c.parts.map((p) => `${p.heading ? `<h4>${esc(p.heading)}</h4>` : ''}${p.items.length > 1 || p.heading ? `<ul>${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p>${esc(p.items[0] ?? '')}</p>`}`).join('')}</div>`).join('')}</div>`
    case 'quotes': return `<div class="quotes">${b.quotes.map((q) => `<div class="q"><h3>${esc(q.title)}</h3>${q.summary ? `<p>${esc(q.summary)}</p>` : ''}<blockquote>“${esc(q.text)}”</blockquote><small>${esc(q.cite)}</small></div>`).join('')}</div>`
  }
}

export function visualReportHTML(project: Project, opts: VisualOptions = DEFAULT_VISUAL, scope: Scope = ALL, generatedAt = new Date()): string {
  const v = visualBrief(project, opts, scope, generatedAt)
  const body = [
    `<h1>${esc(v.title)}</h1>`,
    v.subtitle ? `<p class="lede">${esc(v.subtitle)}</p>` : '',
    `<p class="meta">${esc(v.meta)}</p>`,
    v.anonymised ? '<p class="note">Names are anonymised: masked names are replaced by stand-ins such as [R01] or [Person 1].</p>' : '',
    `<p class="status${project.signoff ? ' final' : ''}">${esc(v.status)}</p>`,
    `<nav class="toc" aria-label="Sections">${v.sections.map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join('')}</nav>`,
    ...v.sections.map((s) => `<section id="${s.id}"><h2>${esc(s.title)}</h2>${s.blocks.map(blockHTML).join('\n')}</section>`),
    '<p class="note" style="margin-top:2.5rem">Hover over any cell or bar for its numbers. Made with Research Weave from the coded study; the full report has the tables and every quote.</p>',
  ].join('\n')
  return forExport(project, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.title)} — visual brief</title><style>${CSS}</style></head><body><main>${body}</main></body></html>`, { html: true })
}
