import { describe, expect, it } from 'vitest'
import { emptyProject, newSource } from '../src/lib/model'
import { askMessage, askPack, lineage, maskedText, newPrompt, readAskResponses, refineAdvice, verifyAnswer } from '../src/lib/ai/ask'
import type { AskAnswer, NameEntry, Project } from '../src/lib/types'

const TEXT = 'What do you think?\n\nJo Ames told me the lab is too small. We need more space.\n\nThanks.'

function study(): Project {
  const p = emptyProject('Ask')
  p.question = 'Is a hub feasible?'
  const s = newSource('R1 — Lab head (Jo Ames)', TEXT)
  const at = (a: string, speaker: string) => ({ start: TEXT.indexOf(a), end: TEXT.indexOf(a) + a.length, speaker, time: null })
  s.segments = [at('What do you think?', 'I'), at('Jo Ames told me the lab is too small. We need more space.', 'R'), at('Thanks.', 'I')]
  s.speakers = [{ raw: 'I', name: 'Interviewer', role: 'interviewer' }, { raw: 'R', name: 'R1', role: 'respondent' }]
  p.sources = [s]
  const jo: NameEntry = { id: 'jo', name: 'Jo Ames', variants: [], kind: 'person', replacement: '[Person 1]', mask: true, caseSensitive: true, note: '' }
  p.names = [jo]
  return p
}

describe('ask across interviews', () => {
  it('masks names in what is sent and maps offsets back', () => {
    const m = maskedText('Hi Jo Ames, bye.', study().names)
    expect(m.text).toBe('Hi [Person 1], bye.')
    expect(m.start(3)).toBe(3)
    expect(m.end(3 + '[Person 1]'.length)).toBe(10)
    expect(m.start(m.text.indexOf('bye'))).toBe('Hi Jo Ames, '.length)
  })

  it('builds one request per interview with turn ids and the question, names masked', () => {
    const p = study()
    const q = newPrompt({ title: 'Space', text: 'What do they say about space?' })
    const msg = askMessage(p, p.sources[0], q)
    expect(msg).toContain('<turn id="T0002" speaker="R1" role="respondent">[Person 1] told me the lab is too small. We need more space.</turn>')
    expect(msg).toContain('Interview: R1 — Lab head ([Person 1])')
    expect(msg).not.toContain('Jo Ames')
    expect(msg).toContain('<question>\nWhat do they say about space?\n</question>')
    const pack = askPack(p, q, [p.sources[0].id])
    expect(pack.requests).toHaveLength(1)
    expect(pack.system).toContain('Is a hub feasible?')
  })

  it('checks evidence against the masked transcript and links it to the real text', () => {
    const p = study()
    const q = newPrompt({ title: 'Space', text: 'Space?' })
    p.asks = [q]
    const a = verifyAnswer(p, p.sources[0], q, { answer: 'Too small [T0002].', not_addressed: false, evidence: [
      { turn_id: 'T0002', quote: '[Person 1] told me the lab is too small.' },
      { turn_id: 'T0002', quote: 'We need a new building.' },
      { turn_id: 'T0009', quote: 'anything' },
    ] }, 'test')
    expect(a.evidence.map((e) => e.match)).toEqual(['exact', 'not-found', 'not-found'])
    const e = a.evidence[0]
    expect(TEXT.slice(e.start!, e.end!)).toBe('Jo Ames told me the lab is too small.')
    const read = readAskResponses(p, { format: 'research-weave-ask-responses', promptId: q.id, model: 'm', responses: [{ id: p.sources[0].id, answer: 'x', not_addressed: true, evidence: [] }, { id: 'nope', answer: 'x', not_addressed: false, evidence: [] }] })
    expect(read.answers).toHaveLength(1)
    expect(read.answers[0].notAddressed).toBe(true)
    expect(read.failed).toEqual(['nope'])
  })

  it('suggests refinements from the wording, the answers and the ratings', () => {
    const q = newPrompt({ title: 'Feelings', text: 'How do they feel about the hub?' })
    const ids = refineAdvice(q, []).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['evidence', 'absent', 'length', 'labels']))
    const better = newPrompt({ title: 'Feelings', text: 'In at most five bullet points: are they supportive, cautious or sceptical about the hub? Quote them. If the interview does not address this, say so.' })
    expect(refineAdvice(better, []).map((a) => a.id)).toEqual([])
    const answer = (over: Partial<AskAnswer>): AskAnswer => ({ id: 'a', promptId: better.id, sourceId: 's', text: 'x', evidence: [], notAddressed: false, model: '', at: '', rating: null, reviewNote: '', ...over })
    const advice = refineAdvice(better, [answer({ evidence: [{ turnId: 'T1', quote: 'q', match: 'not-found' }], rating: 'off', reviewNote: 'Missed the funding point' })])
    expect(advice.map((a) => a.id)).toContain('verbatim')
    expect(advice.some((a) => a.text.includes('Missed the funding point'))).toBe(true)
  })

  it('keeps versions in order', () => {
    const v1 = newPrompt({ title: 'Q', text: 'a' })
    const v2 = newPrompt({ title: 'Q', text: 'b', version: 2, parentId: v1.id })
    const v3 = newPrompt({ title: 'Q', text: 'c', version: 3, parentId: v2.id })
    expect(lineage([v3, v1, v2], v2.id).map((v) => v.version)).toEqual([1, 2, 3])
  })
})

describe('refining from the previous version', () => {
  it('shows a new version what its parent\'s answers and notes showed', () => {
    const v1 = newPrompt({ title: 'Q', text: 'In five bullet points, quote them; if not discussed, say so.' })
    const v2 = newPrompt({ title: 'Q', text: 'In five bullet points, quote them; if not discussed, say so.', version: 2, parentId: v1.id })
    const a: AskAnswer = { id: 'a', promptId: v1.id, sourceId: 's', text: 'x', evidence: [], notAddressed: false, model: '', at: '', rating: 'partly', reviewNote: 'No common scale' }
    const advice = refineAdvice(v2, [a]).map((x) => x.text)
    expect(advice).toContain('On v1, you noted: “No common scale”')
    expect(advice.some((t) => t.startsWith("From v1's answers: 1 answer has no evidence"))).toBe(true)
  })
})

describe('ask instructions', () => {
  it('asks for they/them rather than guessed pronouns', async () => {
    const { askSystem } = await import('../src/lib/ai/ask')
    expect(askSystem(emptyProject('X'))).toContain('do not infer gender')
  })
})
