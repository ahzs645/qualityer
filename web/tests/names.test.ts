import { describe, expect, it } from 'vitest'
import { emptyProject, newSource } from '../src/lib/model'
import { findNames, forExport, guessKind, maskNames, nameCandidates, nameCounts, nextReplacement } from '../src/lib/names'
import { claimsCSV, reportHTML, reportMarkdown } from '../src/lib/report'
import type { NameEntry } from '../src/lib/types'

const entry = (name: string, extra: Partial<NameEntry> = {}): NameEntry => ({
  id: name, name, variants: [], kind: 'person', replacement: `[${name.split(' ')[0]}]`, mask: true, caseSensitive: true, note: '', ...extra,
})

describe('finding and masking names', () => {
  it('prefers the longest spelling and matches whole words only', () => {
    const jo = entry('Jo Ames', { variants: ['Jo', 'Dr. Ames'], replacement: '[R01]' })
    const text = "Jo Ames said Jo's lab and Dr. Ames agreed; Joanne did not."
    expect(findNames(text, [jo]).map((h) => h.text)).toEqual(['Jo Ames', 'Jo', 'Dr. Ames'])
    expect(maskNames(text, [jo])).toBe("[R01] said [R01]'s lab and [R01] agreed; Joanne did not.")
    // A title is optional: "Dr. Lena Ortiz" also covers "Lena Ortiz", so the surname is not left behind.
    const wa = entry('Dr. Lena Ortiz', { variants: ['Lena'], replacement: '[Person 1]' })
    expect(maskNames('Lena Ortiz and Lena', [wa])).toBe('[Person 1] and [Person 1]')
  })

  it('respects capitals when asked, and either apostrophe', () => {
    const moss = entry('Moss', { replacement: '[R01]' })
    expect(maskNames('Dr Moss found moss.', [moss])).toBe('Dr [R01] found moss.')
    expect(maskNames('Dr Moss found moss.', [{ ...moss, caseSensitive: false }])).toBe('Dr [R01] found [R01].')
    const nation = entry("Lheidli T'enneh", { kind: 'organisation', replacement: '[a First Nation]' })
    expect(maskNames('with Lheidli T’enneh and Lheidli  T\'enneh', [nation])).toBe('with [a First Nation] and [a First Nation]')
  })

  it('leaves unmasked names alone, and masks escaped names in HTML', () => {
    const org = entry('Smith & Co', { kind: 'organisation', replacement: '[a firm]' })
    expect(maskNames('Smith &amp; Co hired', [org], { html: true })).toBe('[a firm] hired')
    expect(maskNames('Smith & Co hired', [{ ...org, mask: false }])).toBe('Smith & Co hired')
  })

  it('counts mentions per source and numbers stand-ins', () => {
    const p = emptyProject('N')
    const a = newSource('R01', 'Jo met Jo.'), b = newSource('R02', 'No one.')
    p.sources = [a, b]
    p.names = [entry('Jo', { replacement: '[Person 2]' })]
    expect(nameCounts(p).get('Jo')?.get(a.id)).toBe(2)
    expect(nameCounts(p).get('Jo')?.get(b.id)).toBeUndefined()
    expect(nextReplacement(p, 'person')).toBe('[Person 3]')
    expect(nextReplacement(p, 'place')).toBe('[Place 1]')
  })
})

describe('suggesting names', () => {
  it('finds names mid-sentence, skips sentence starters, and uses the source title', () => {
    const p = emptyProject('N')
    const s = { ...newSource('R01 — Lab head (Jo Ames)', 'So we asked Priya Natarajan about it. Then the lab moved to Fort Ross Lake. Northern Wellness Foundation paid. Well, Jo Ames agreed.'), attributes: { 'Respondent ID': 'R01' } }
    p.sources = [s]
    const c = nameCandidates(p)
    const by = new Map(c.map((x) => [x.text, x]))
    expect(by.get('Jo Ames')?.replacement).toBe('[R01]')
    expect(by.get('Jo Ames')?.kind).toBe('person')
    expect(by.get('Priya Natarajan')?.kind).toBe('person')
    expect(by.get('Fort Ross Lake')?.kind).toBe('place')
    expect(by.get('Northern Wellness Foundation')?.kind).toBe('organisation')
    expect(by.has('So')).toBe(false)
    expect(by.has('Then')).toBe(false)
    expect(by.has('Well')).toBe(false)
    // Registered and dismissed names are not suggested again.
    p.names = [entry('Jo Ames')]
    p.notNames = ['Priya Natarajan']
    const again = nameCandidates(p).map((x) => x.text)
    expect(again).not.toContain('Jo Ames')
    expect(again).not.toContain('Priya Natarajan')
  })

  it('guesses kinds from words and context', () => {
    expect(guessKind('UNHS')).toBe('organisation')
    expect(guessKind('Dr. Lee')).toBe('person')
    expect(guessKind('Ashby', ['we moved to ', 'back in '])).toBe('place')
    expect(guessKind('Ashby', ['said ', 'and '])).toBe('other')
  })
})

describe('anonymised exports', () => {
  it('masks names in quotes, source names and summaries only when switched on', () => {
    const p = emptyProject('Anon')
    const s = newSource('R01 — Lab head (Jo Ames)', 'Jo Ames runs the lab with Priya.')
    p.sources = [s]
    p.cases = [{ id: 'k', name: 'R01', sourceIds: [s.id], attributes: {} }]
    p.groups = [{ id: 'g', name: '01 Capacity', kind: 'substantive', color: '#000' }]
    p.codes = [{ id: 'c', name: '01.1  Labs', groupId: 'g', parentId: null, color: '#000', definition: '', include: '', exclude: '', anchor: '' }]
    p.codings = [{ id: 'x', sourceId: s.id, codeId: 'c', start: 0, end: s.text.length, coder: 'A', memo: '', important: false, status: 'accepted', createdAt: '' }]
    p.themes = [{ id: 't', title: '01 Capacity', codeIds: ['c'], interpretation: '' }]
    p.cells = [{ caseId: 'k', themeId: 't', summary: 'Priya keeps the lab going.', pinned: ['x'] }]
    p.names = [entry('Jo Ames', { replacement: '[R01]' }), entry('Priya', { replacement: '[Colleague 1]' })]
    expect(reportMarkdown(p)).toContain('Jo Ames runs the lab')
    p.anonymise = true
    for (const out of [reportHTML(p), reportMarkdown(p), claimsCSV(p)]) {
      expect(out).not.toContain('Jo Ames')
      expect(out).not.toContain('Priya')
      expect(out).toContain('[R01] runs the lab with [Colleague 1].')
    }
    expect(reportMarkdown(p)).toContain('Names are anonymised')
    expect(forExport({ ...p, anonymise: false }, 'Jo Ames')).toBe('Jo Ames')
  })
})
