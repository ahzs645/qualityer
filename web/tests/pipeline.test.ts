import { describe, expect, it } from 'vitest'
import { locateQuote, turnsOf, verifyWindow, windowsFor, codeKeys, systemPrompt, userMessage } from '../src/lib/ai/pipeline'
import { cooccurrence, topTerms } from '../src/lib/explore'
import { demoProject } from '../src/lib/demo'
import { offsetAt, timeAt, timeRange } from '../src/lib/model'
import { parseWhisperJSON } from '../src/lib/importers'
import { newSource } from '../src/lib/model'

describe('quote verification', () => {
  const text = 'Um, so we, we refused about four tonnes of squash. It went to “compost”.'
  const turn = { start: 0, end: text.length }
  it('finds exact quotes despite case, whitespace and curly quotes', () => {
    const m = locateQuote(text, turn, 'we refused about   four tonnes of SQUASH')
    expect('start' in m && text.slice(m.start, m.end)).toBe('we refused about four tonnes of squash')
    const q = locateQuote(text, turn, 'It went to "compost"')
    expect('match' in q && q.match).toBe('exact')
  })
  it('repairs a tidied quote and flags it', () => {
    const m = locateQuote(text, turn, 'we refused about four tons of squash')
    expect('match' in m && m.match).toBe('repaired')
  })
  it('rejects invented or ellipsised quotes', () => {
    expect('reason' in locateQuote(text, turn, 'the hub would solve everything')).toBe(true)
    expect('reason' in locateQuote(text, turn, 'we refused … squash')).toBe(true)
  })
})

describe('windows and prompts', () => {
  const p = demoProject()
  const s = p.sources[0]
  it('assigns stable turn ids and skips interviewer turns as targets', () => {
    const turns = turnsOf(s)
    expect(turns[0].id).toBe('T0001')
    const w = windowsFor(s, { windowSize: 4, contextTurns: 1, respondentOnly: true })
    expect(w.every((x) => x.targets.every((t) => t.role !== 'interviewer'))).toBe(true)
    expect(userMessage(s, w[0])).toContain('<target_turns>')
  })
  it('builds a codebook prompt with keys, criteria and rules', () => {
    const { toKey } = codeKeys(p.codes)
    const sys = systemPrompt(p, p.codes, toKey, new Map())
    expect(sys).toContain('<code id="C001"')
    expect(sys).toContain('<include id="inc">')
    expect(sys).toMatch(/exactly one E Evidence grade code/)
  })
  it('turns raw output into suggestions and logs rejections', () => {
    const { toKey, toId } = codeKeys(p.codes)
    const w = windowsFor(s, { windowSize: 40, contextTurns: 0, respondentOnly: true })[0]
    const turn = w.targets.find((t) => s.text.slice(t.start, t.end).includes('squash'))!
    const cold = p.codes.find((c) => c.name.startsWith('02.1'))!
    const r = verifyWindow({ ...p, codings: [] }, s, w, [
      { code_id: toKey.get(cold.id)!, turn_id: turn.id, quote: 'we had nowhere cold to put it', rationale: 'storage', criterion: 'include', confidence: 'high' },
      { code_id: 'C999', turn_id: turn.id, quote: 'squash', rationale: '', criterion: '', confidence: 'low' },
      { code_id: toKey.get(cold.id)!, turn_id: 'T9999', quote: 'squash', rationale: '', criterion: '', confidence: 'low' },
    ], toId, { id: 'run', coder: 'AI' })
    expect(r.codings).toHaveLength(1)
    expect(r.codings[0].status).toBe('suggested')
    expect(r.codings[0].confidence).toBe(0.9)
    expect(r.rejected.map((x) => x.reason)).toEqual(['Unknown code id', 'Turn T9999 is not a target turn'])
  })

  it('keeps a suggestion an earlier pass also made, and skips only its own repeats', () => {
    const p = demoProject()
    const s = p.sources[0]
    const cold = p.codes.find((c) => c.name.startsWith('02.1'))!
    const { toKey, toId } = codeKeys(p.codes)
    const w = windowsFor(s, { windowSize: 40, contextTurns: 0, respondentOnly: true })[0]
    const turn = w.targets.find((t) => s.text.slice(t.start, t.end).includes('squash'))!
    const raw = [{ code_id: toKey.get(cold.id)!, turn_id: turn.id, quote: 'we had nowhere cold to put it', rationale: '', criterion: '', confidence: 'medium' as const }]
    const first = verifyWindow({ ...p, codings: [] }, s, w, raw, toId, { id: 'run-1', coder: 'AI #1' })
    const withFirst = { ...p, codings: first.codings }
    expect(verifyWindow(withFirst, s, w, raw, toId, { id: 'run-2', coder: 'AI #2' }).codings).toHaveLength(1)
    expect(verifyWindow(withFirst, s, w, raw, toId, { id: 'run-1', coder: 'AI #1' }).codings).toHaveLength(0)
  })
})

describe('word timings', () => {
  it('maps offsets to times and back', () => {
    const { text, segments } = parseWhisperJSON({ segments: [{ text: ' Hello there friend', start: 10, words: [{ word: ' Hello', start: 10 }, { word: ' there', start: 10.5 }, { word: ' friend', start: 11 }] }] })
    const s = { ...newSource('s', text), segments }
    expect(timeAt(s, text.indexOf('friend'))).toBe(11)
    expect(offsetAt(s, 10.6)).toBe(text.indexOf('there'))
    expect(timeRange(s, 0, text.indexOf('friend'))).toEqual([10, 11])
  })
})

describe('explore', () => {
  it('counts code co-occurrence once per overlapping span', () => {
    const p = demoProject()
    const counts = cooccurrence(p)
    expect([...counts.values()].every((n) => n > 0)).toBe(true)
    expect(counts.size).toBeGreaterThan(3)
  })
  it('ranks content words', () => {
    expect(topTerms(['cold storage and cold rooms', 'the cold chain'])[0]).toEqual(['cold', 3])
  })
})
