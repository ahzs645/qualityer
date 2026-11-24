import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { demoProject } from '../src/lib/demo'
import { emptyProject, newSource, uid } from '../src/lib/model'
import { peopleOf } from '../src/lib/positions'
import { ALL, scopeProject, scopeSlug } from '../src/lib/scope'
import { DEFAULT_VISUAL, answerCard, visualBrief, visualReportHTML } from '../src/lib/visual-report'
import { visualPdfDefinition } from '../src/lib/visual-pdf'
import { exportNameRisks } from '../src/lib/names'
import { reportHTML, recipeOptions } from '../src/lib/report'
import type { Coding } from '../src/lib/types'

describe('scope: one participant', () => {
  it('keeps only that participant and drops writing about the others', () => {
    const p = demoProject()
    const people = peopleOf(p)
    expect(people.length).toBeGreaterThan(1)
    const one = people[0]
    const s = scopeProject(p, { kind: 'person', personId: one.id })
    expect(s.sources.map((x) => x.id)).toEqual(p.sources.filter((x) => one.sourceIds.includes(x.id)).map((x) => x.id))
    expect(s.codings.every((c) => one.sourceIds.includes(c.sourceId))).toBe(true)
    expect(s.askAnswers.every((a) => one.sourceIds.includes(a.sourceId))).toBe(true)
    expect(s.themes.every((t) => t.interpretation === '')).toBe(true)
    expect(s.memos.every((m) => m.sourceId && one.sourceIds.includes(m.sourceId))).toBe(true)
    expect(s.name).toContain(one.label)
    expect(scopeProject(p, ALL)).toBe(p)
    expect(scopeSlug(p, ALL)).toBe('all-interviews')
    // The written report for one participant names no other participant's interview.
    const html = reportHTML(s, recipeOptions('standard'))
    for (const other of people.slice(1)) expect(html).not.toContain(`<b>${other.label}</b>`)
  })
})

describe('visual brief', () => {
  it('draws every chart for all interviews and for one participant', () => {
    const p = demoProject()
    const all = visualBrief(p)
    expect(all.meta).toContain('All')
    const ids = all.sections.map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['glance', 'stance', 'mix', 'evidence', 'raised', 'through', 'themes']))
    const person = peopleOf(p)[0]
    const one = visualBrief(p, DEFAULT_VISUAL, { kind: 'person', personId: person.id })
    expect(one.meta).toContain(person.label)
    // The one-participant stance chart does not name the other participants.
    const stance = one.sections.find((s) => s.id === 'stance')!.blocks.find((b) => b.t === 'svg')
    for (const other of peopleOf(p).slice(1)) expect(stance && 'svg' in stance ? stance.svg : '').not.toContain(`>${other.label}<`)
    const html = visualReportHTML(p)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/NaN|undefined/)
  })

  it('leaves out sections that are switched off', () => {
    const p = demoProject()
    const v = visualBrief(p, { ...DEFAULT_VISUAL, mix: false, coverage: false })
    expect(v.sections.some((s) => s.id === 'mix' || s.id === 'coverage')).toBe(false)
  })

  it('builds a PDF definition with the charts as SVG', () => {
    const def = visualPdfDefinition(demoProject())
    const flat = JSON.stringify(def.content)
    expect(flat).toContain('<svg')
    expect(flat).not.toMatch(/NaN/)
  })

  it('keeps off-the-record wording out of the brief', () => {
    const p = emptyProject('P')
    const a = newSource('R1', 'The hub would help us greatly. Please keep this secret between us.')
    p.sources = [a]
    p.groups = [{ id: 'sub', name: '01 Capacity', kind: 'substantive', color: '#000' }]
    p.codes = [{ id: 'c', name: 'c', groupId: 'sub', parentId: null, color: '#000', definition: '', include: '', exclude: '', anchor: '' }]
    p.themes = [{ id: 't', title: '01 Capacity', codeIds: ['c'], interpretation: '' }]
    const coding: Coding = { id: uid(), sourceId: a.id, codeId: 'c', start: 31, end: 66, coder: 'X', memo: '', important: false, status: 'accepted', createdAt: '' }
    p.codings = [coding]
    p.cases = [{ id: 'k', name: 'R1', sourceIds: [a.id], attributes: {} }]
    p.cells = [{ caseId: 'k', themeId: 't', summary: '', pinned: [coding.id] }]
    p.restricted = [{ id: 'r', sourceId: a.id, start: 31, end: 66, reason: 'asked', by: 'X', at: '' }]
    expect(visualReportHTML(p)).not.toContain('secret between us')
  })
})

describe('answer cards', () => {
  const text = [
    'Overall: supportive with conditions. R9 backs the hub but worries about money [T0001].',
    '',
    'Hopes:',
    '- Jobs that stay in the region: "we keep our graduates" [T0002].',
    '- That people "could actually take part in research" [T0003].',
    '',
    'Worries:',
    '- Funding: "money is the top one" [T0004].',
    '',
    'Their own role: would advise; this suggests a light role.',
  ].join('\n')

  it('reads the label, lead and headed lists', () => {
    const c = answerCard('R9', text, false)
    expect(c.tag).toBe('supportive with conditions')
    expect(c.lead).toBe('R9 backs the hub but worries about money.')
    expect(c.parts.map((p) => p.heading)).toEqual(['Hopes', 'Worries', 'Their own role'])
    expect(c.parts[0].items[0]).toContain('we keep our graduates')
  })

  it('keeps labels and drops their quotes in brief, but keeps items whose quote is the sentence', () => {
    const c = answerCard('R9', text, true)
    expect(c.parts[0].items).toEqual(['Jobs that stay in the region', 'That people "could actually take part in research".'])
    expect(c.parts[1].items).toEqual(['Funding'])
    expect(c.parts[2].items[0]).toBe('would advise.')
  })
})

describe('names that anonymised exports would miss', () => {
  it('flags the short form of a masked person that is not a spelling of its own', () => {
    const p = emptyProject('P')
    p.sources = [newSource('R1', 'I spoke with Jo Ames last year, and later Jo told me it would work.')]
    p.names = [{ id: 'n', name: 'Jo Ames', variants: [], kind: 'person', replacement: '[Person 1]', mask: true, caseSensitive: true, note: '' }]
    p.anonymise = true
    expect(exportNameRisks(p).leaks.map((c) => c.text)).toEqual(['Jo'])
    p.names[0].variants = ['Jo']
    expect(exportNameRisks(p).leaks).toEqual([])
  })
})

describe('export everything', () => {
  it('zips all interviews and each participant', async () => {
    // pdfmake is not needed for the HTML parts; stub the PDF builders.
    const { vi } = await import('vitest')
    vi.doMock('../src/lib/visual-pdf', () => ({ visualPdfBlob: async () => new Blob(['%PDF']) }))
    vi.doMock('../src/lib/report-pdf', () => ({ reportPdfBlob: async () => new Blob(['%PDF']) }))
    const { exportAllZip } = await import('../src/lib/export-all')
    const p = demoProject()
    const zip = unzipSync(await exportAllZip(p, 'visual', DEFAULT_VISUAL, recipeOptions('standard')))
    const names = Object.keys(zip)
    expect(names.filter((n) => n.endsWith('-visual.html'))).toHaveLength(1 + peopleOf(p).length)
    expect(names.some((n) => n.startsWith('0-all-interviews/'))).toBe(true)
    expect(strFromU8(zip['README.txt'])).toContain('one participant')
    const written = unzipSync(await exportAllZip(p, 'written', DEFAULT_VISUAL, recipeOptions('summary')))
    expect(Object.keys(written).filter((n) => n.endsWith('-claims.csv'))).toHaveLength(1 + peopleOf(p).length)
  })
})
