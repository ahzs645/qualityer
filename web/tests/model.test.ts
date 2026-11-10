import { describe, expect, it } from 'vitest'
import {
  agreement, checkRules, editSource, emptyProject, findCorrections, newSource, parseTurns,
  remapper, snapToSentence, snapToWords, splitDefinition, suggestedRules, uid,
} from '../src/lib/model'
import { codePointToUtf16, parseGuideMarkdown, parseSubtitles, parseWhisperJSON } from '../src/lib/importers'
import { mergeCodebookCSV, parseCSV } from '../src/lib/codebook-io'
import { demoProject } from '../src/lib/demo'
import type { Coding, Project } from '../src/lib/types'

const coding = (_p: Project, sourceId: string, codeId: string, start: number, end: number, coder = 'A'): Coding =>
  ({ id: uid(), sourceId, codeId, start, end, coder, memo: '', important: false, status: 'accepted', createdAt: '' })

describe('parseTurns', () => {
  it('reads "[mm:ss]  Speaker" headers and keeps a preamble', () => {
    const text = 'TITLE\nnotes\n\n[00:05]  Speaker 1\nHello there.\n\n[01:02:03]  Speaker 2\nHi.'
    const turns = parseTurns(text)
    expect(turns.map((t) => t.speaker)).toEqual(['', 'Speaker 1', 'Speaker 2'])
    expect(turns[1].time).toBe(5)
    expect(turns[2].time).toBe(3723)
    expect(text.slice(turns[1].start, turns[1].end)).toBe('[00:05]  Speaker 1\nHello there.')
  })

  it('reads "Name: text" lines', () => {
    const turns = parseTurns('Interviewer: one\nRespondent: two\nInterviewer: three')
    expect(turns.map((t) => t.speaker)).toEqual(['Interviewer', 'Respondent', 'Interviewer'])
  })

  it('falls back to paragraphs', () => {
    expect(parseTurns('para one\n\npara two').length).toBe(2)
  })
})

describe('rules', () => {
  it('flags spans missing an evidence grade and flag codings without extraction rows', () => {
    const p = demoProject()
    const v = checkRules(p)
    const messages = v.map((x) => x.message)
    expect(messages).toContain('Missing E Evidence grade')
    expect(messages.some((m) => m.includes('no extraction row'))).toBe(true)
    // "Labour, first. Then cold storage." carries two evidence grades.
    expect(messages).toContain('2 E Evidence grade codes on one span')
  })

  it('suggests rules from group kinds', () => {
    const p = demoProject()
    const kinds = suggestedRules(p.groups).map((r) => r.kind).sort()
    expect(kinds).toEqual(['at-most-one', 'exactly-one', 'requires-extraction'])
  })
})

describe('corrections keep anchors', () => {
  it('moves codings after and around an edit', () => {
    const p = emptyProject()
    const s = newSource('s', 'Smyth is great. Smyth again.')
    p.sources = [s]
    p.codings = [coding(p, s.id, 'c', 17, 29)] // "Smyth again."
    p.glossary = [{ id: 'g', find: 'Smyth', replace: 'Jon Smith', wholeWord: true, caseSensitive: true }]
    const edits = findCorrections(s.text, p.glossary)
    expect(edits.length).toBe(2)
    const next = editSource(p, s.id, edits)
    const text = next.sources[0].text
    const c = next.codings[0]
    expect(text.slice(c.start, c.end)).toBe('Jon Smith again.')
  })

  it('respects whole-word matching', () => {
    expect(findCorrections('Carti Cartier', [{ id: 'x', find: 'Carti', replace: 'Carrier', wholeWord: true, caseSensitive: false }]).length).toBe(1)
  })

  it('snaps offsets inside a replaced range outward', () => {
    const map = remapper([{ start: 2, end: 6, text: 'ab' }])
    expect(map(4, 'start')).toBe(2)
    expect(map(4, 'end')).toBe(4)
    expect(map(8, 'start')).toBe(6)
  })
})

describe('agreement', () => {
  it('is perfect for identical coding and lower for partial overlap', () => {
    const p = emptyProject()
    const s = newSource('s', 'x'.repeat(100))
    p.sources = [s]
    p.codes = [{ id: 'c', name: 'C', groupId: null, parentId: null, color: '#000', definition: '', include: '', exclude: '', anchor: '' }]
    p.codings = [coding(p, s.id, 'c', 10, 30, 'A'), coding(p, s.id, 'c', 10, 30, 'B')]
    expect(agreement(p, 'A', 'B', [s.id]).byCode[0].kappa).toBeCloseTo(1)
    p.codings = [coding(p, s.id, 'c', 10, 30, 'A'), coding(p, s.id, 'c', 20, 40, 'B')]
    const r = agreement(p, 'A', 'B', [s.id]).byCode[0]
    expect(r.percent).toBeCloseTo(10 / 30)
    expect(r.kappa!).toBeLessThan(0.6)
  })
})

describe('selection snapping', () => {
  const t = 'First claim here. Second claim, with more! Third.'
  it('extends partial words', () => {
    const [a, b] = snapToWords(t, 2, 9)
    expect(t.slice(a, b)).toBe('First claim')
  })
  it('extends to the sentence', () => {
    const [a, b] = snapToSentence(t, 22, 26)
    expect(t.slice(a, b)).toBe('Second claim, with more!')
  })
})

describe('imports', () => {
  it('splits QualCoder-style codebook memos', () => {
    const d = splitDefinition('Any shared asset.\n\nINCLUDE: Named facilities.\n\nEXCLUDE: Aspirations.\n\nANCHOR: "We share a freezer."')
    expect(d).toEqual({ definition: 'Any shared asset.', include: 'Named facilities.', exclude: 'Aspirations.', anchor: '"We share a freezer."' })
  })

  it('converts code-point offsets to UTF-16', () => {
    const f = codePointToUtf16('a😀b')
    expect(f(2)).toBe(3)
  })

  it('parses a Markdown interview guide with core questions and modules', () => {
    const md = `# Core questions\n\n## C1 — Role · 2 min\n\n> What do you see?\n\n## C2 — Current activity · 8 min\n\n> What's happening?\n\n**Probes:**\n\n- Where?\n- Who?\n\n# Modules\n\n## M1 — Governance\n\n**a.** Who decides?`
    const g = parseGuideMarkdown(md)
    expect(g.map((q) => q.key)).toEqual(['C1', 'C2', 'M1'])
    expect(g[0].minutes).toBe(2)
    expect(g[1].probes).toEqual(['Where?', 'Who?'])
    expect(g[1].module).toBe('')
    expect(g[2].module).toBe('M1 Governance')
  })

  it('parses SRT and merges consecutive cues from one speaker', () => {
    const { text, segments } = parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\nAnn: Hello\n\n2\n00:00:02,000 --> 00:00:03,000\nAnn: again\n\n3\n00:00:04,500 --> 00:00:05,000\nBo: Hi')
    expect(segments.length).toBe(2)
    expect(text.slice(segments[0].start, segments[0].end)).toBe('Hello again')
    expect(segments[1].time).toBe(4.5)
  })

  it('marks low-probability Whisper words', () => {
    const { text, segments } = parseWhisperJSON({ segments: [{ text: ' Smyth is here', start: 1, speaker: 'S1', words: [{ word: ' Smyth', probability: 0.2 }, { word: ' is', probability: 0.99 }] }] })
    const [a, b] = segments[0].uncertain![0]
    expect(text.slice(a, b)).toBe('Smyth')
  })

  it('round-trips a codebook CSV', () => {
    const rows = parseCSV('Code,Group,Definition\n"A, b",E Evidence,"says ""hi"""\n')
    expect(rows[1]).toEqual(['A, b', 'E Evidence', 'says "hi"'])
    const r = mergeCodebookCSV(emptyProject(), 'Code,Group,Definition,Parent\nParent code,Domain,,\nChild,Domain,d,Parent code\n')
    expect(r.added).toBe(2)
    const child = r.project.codes.find((c) => c.name === 'Child')!
    expect(r.project.codes.find((c) => c.id === child.parentId)?.name).toBe('Parent code')
  })
})
