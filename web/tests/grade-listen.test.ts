import { describe, expect, it } from 'vitest'
import { emptyProject, newSource, uid } from '../src/lib/model'
import { gradeExamples, gradeTargets, gradeUser, prepareGrades, verifyGrades, DEFAULT_GRADE } from '../src/lib/ai/grade'
import { applySpeakerTrack, listenQueue, parseRTTM, splitSegments, wordAgreement, wordingChecks } from '../src/lib/listen'
import { systemPrompt, userMessage, windowsFor, codeKeys } from '../src/lib/ai/pipeline'
import type { Coding, Project, Segment } from '../src/lib/types'

const SENTENCES = ['We run the lab.', 'I saw the freezer fail.', 'They told me it broke.', 'It could work one day.', 'We signed the agreement.', 'I watched staff leave.']

function study() {
  const p = emptyProject('T')
  p.coder = 'Ana'
  const s = { ...newSource('R1', SENTENCES.join(' ')), attributes: { 'Role level': 'Executive', Empty: '' } }
  p.sources = [s]
  p.groups = [
    { id: 'sub', name: '01 Capacity', kind: 'substantive', color: '#111' },
    { id: 'ev', name: 'E Evidence', kind: 'evidence', color: '#222', description: '1. Owns it? E1.\n2. Saw it? E2.' },
    { id: 'st', name: 'S Stance', kind: 'stance', color: '#333' },
  ]
  const code = (id: string, name: string, groupId: string) => ({ id, name, groupId, parentId: null, color: '#000', definition: '', include: '', exclude: '', anchor: '' })
  p.codes = [code('cap', '01.1  Capacity', 'sub'), code('e1', 'E1  Authority', 'ev'), code('e2', 'E2  Firsthand', 'ev'), code('s3', 'S3  Neutral', 'st'), code('s4', 'S4  Sceptical', 'st')]
  p.rules = [
    { id: 'r1', kind: 'exactly-one', triggerGroupIds: ['sub'], targetGroupId: 'ev', enabled: true },
    { id: 'r2', kind: 'exactly-one', triggerGroupIds: ['sub'], targetGroupId: 'st', enabled: true },
  ]
  const mk = (codeId: string, i: number, extra: Partial<Coding> = {}): Coding => {
    const start = s.text.indexOf(SENTENCES[i])
    return { id: uid(), sourceId: s.id, codeId, start, end: start + SENTENCES[i].length, coder: 'Ana', memo: '', important: false, status: 'accepted', createdAt: '', ...extra }
  }
  const grades = ['e1', 'e2', 'e2', 'e2', 'e1', 'e2']
  p.codings = SENTENCES.flatMap((_, i) => [mk('cap', i), mk(grades[i], i), mk(i % 2 ? 's4' : 's3', i)])
  return { p, s, mk }
}

describe('grade pass', () => {
  const opts = (p: Project) => ({ ...DEFAULT_GRADE, sourceId: p.sources[0].id, reference: 'Ana' })

  it('holds out the later claims and teaches only from the earlier ones', () => {
    const { p, s } = study()
    const { targets, teach } = gradeTargets(p, opts(p))
    expect(targets.map((t) => s.text.slice(t.start, t.end))).toEqual(SENTENCES.slice(3))
    expect(targets.map((t) => t.key)).toEqual(['K001', 'K002', 'K003'])
    expect(teach.map((t) => s.text.slice(t.claim.start, t.claim.end))).toEqual(SENTENCES.slice(0, 3))
  })

  it('puts passages an earlier AI pass got wrong first among the examples', () => {
    const { p, mk } = study()
    p.codings.push(mk('e1', 2, { coder: 'AI', origin: { runId: 'old', match: 'exact' }, status: 'suggested' }))
    const { teach, choice } = gradeTargets(p, opts(p))
    const ex = gradeExamples(p, teach, choice, 1).filter((e) => e.codeId === 'e2')
    expect(ex).toEqual([{ codeId: 'e2', text: SENTENCES[2], contrast: 'E1 Authority' }])
  })

  it('sends the respondent, the decision rule and the examples, and never the held-out answers', () => {
    const { p, s } = study()
    const { system, windows, run } = prepareGrades(p, opts(p))
    expect(system).toContain('<how_to_choose>1. Owns it? E1.')
    expect(system).toContain(`<example>${SENTENCES[0]}</example>`)
    for (const held of SENTENCES.slice(3)) expect(system).not.toContain(held)
    expect(windows[0].user).toContain('Role level: Executive')
    expect(windows[0].user).not.toContain('Empty:')
    expect(windows[0].user).toContain(`<passage>${SENTENCES[3]}</passage>`)
    expect(run.kind).toBe('grades')
    expect(run.comparisonOnly).toBe(true)
    expect(gradeUser(p, s, [])).toContain('<respondent>')
  })

  it('turns grades into suggestions on the claim, one per group, and rejects the rest', () => {
    const { p } = study()
    const { run } = prepareGrades(p, opts(p))
    const key = (id: string) => Object.entries(run.codeKeys).find(([, v]) => v === id)![0]
    const r = verifyGrades(p, run, [
      { claim_id: 'K001', code_ids: [key('e2'), key('s4')], reason: 'saw it', confidence: 'high' },
      { claim_id: 'K002', code_ids: [key('e1'), key('e2')], reason: '', confidence: 'low' },
      { claim_id: 'K999', code_ids: [key('e1')] },
    ], 'AI #1')
    expect(r.codings.map((c) => [c.codeId, c.status, c.confidence])).toEqual([['e2', 'suggested', 0.9], ['s4', 'suggested', 0.9], ['e1', 'suggested', 0.3]])
    expect(r.codings[0].start).toBe(run.claims!.K001[0])
    expect(r.rejected.map((x) => x.reason)).toEqual(['Two values in one group', 'Unknown claim id'])
  })

  it('grades only claims that lack a grade in ungraded mode', () => {
    const { p, s } = study()
    const start = s.text.indexOf(SENTENCES[1])
    p.codings = p.codings.filter((c) => !(c.start === start && c.codeId !== 'cap'))
    const { targets } = gradeTargets(p, { ...opts(p), mode: 'ungraded' })
    expect(targets.map((t) => s.text.slice(t.start, t.end))).toEqual([SENTENCES[1]])
  })

  it('gives the coding pass the respondent attributes and group rules too', () => {
    const { p, s } = study()
    const w = windowsFor(s, { windowSize: 8, contextTurns: 0, respondentOnly: false })[0]
    expect(userMessage(s, w)).toContain('<respondent>\n  Role level: Executive\n</respondent>')
    expect(systemPrompt(p, p.codes, codeKeys(p.codes).toKey, new Map())).toContain('<how_to_choose group="E Evidence">')
  })
})

describe('listening', () => {
  it('measures how much of a passage a second transcription confirms', () => {
    expect(wordAgreement('We have, we have zero microscopes.', 'we have zero microscopes here')).toBe(4 / 6)
    expect(wordAgreement('the irrelevance to the north', 'their relevance to the north')).toBe(3 / 5)
    expect(wordAgreement('', 'anything')).toBe(1)
  })

  it('reads a second transcription by time and orders the queue by risk', () => {
    const { p, s } = study()
    const offs = SENTENCES.map((x) => s.text.indexOf(x))
    const segments: Segment[] = [{ start: 0, end: s.text.length, speaker: 'A', time: 0, words: offs.map((o, i) => [o, i * 10] as [number, number]) }]
    const src = { ...s, segments }
    const proj = { ...p, sources: [src] }
    const whisper = { segments: SENTENCES.map((x, i) => ({ start: i * 10 + 2, end: i * 10 + 6, text: i === 4 ? 'We sang the agreement.' : x })) }
    const checks = wordingChecks(proj, src, whisper, 'big')
    expect(checks).toHaveLength(6)
    const bad = checks.find((c) => c.start === offs[4])!
    expect(bad.agreement).toBe(0.75)
    const q = listenQueue({ ...proj, wordingChecks: checks, cells: [{ caseId: 'c', themeId: 't', summary: '', pinned: [proj.codings[0].id] }] }, src.id)
    expect(q.slice(0, 2).map((i) => src.text.slice(i.claim.start, i.claim.end))).toEqual([SENTENCES[0], SENTENCES[4]])
    expect(q[0].reasons).toEqual(['quoted as key evidence'])
    expect(wordingChecks(proj, src, [{ start: offs[1], end: offs[1] + 5, second: 'I saw' }])[0].agreement).toBe(1)
  })

  it('splits a turn around a passage and lays a speaker track over word timings', () => {
    const text = 'So what exists now? We have a lab and a freezer. Good.'
    const ws = [...text.matchAll(/\S+/g)].map((m, i) => [m.index!, i] as [number, number])
    const s = { ...newSource('R', text), segments: [{ start: 0, end: text.length, speaker: 'R', time: 0, words: ws }] as Segment[] }
    const q = text.indexOf('We have')
    const split = splitSegments(s, 0, q - 1, 'I')!
    expect(split.map((g) => [g.speaker, text.slice(g.start, g.end)])).toEqual([['I', 'So what exists now?'], ['R', 'We have a lab and a freezer. Good.']])
    expect(split[1].time).toBe(4)
    expect(splitSegments(s, 5, text.length + 4, 'I')).toBeNull()

    const track = parseRTTM('SPEAKER rec 1 0.0 3.5 <NA> <NA> S_INT <NA> <NA>\nSPEAKER rec 1 3.5 20 <NA> <NA> S_RESP <NA> <NA>\njunk')
    expect(track).toEqual([{ start: 0, end: 3.5, speaker: 'S_INT' }, { start: 3.5, end: 23.5, speaker: 'S_RESP' }])
    const laid = applySpeakerTrack(s, track)
    expect(laid.segments.map((g) => [g.speaker, text.slice(g.start, g.end)])).toEqual([['S_INT', 'So what exists now?'], ['S_RESP', 'We have a lab and a freezer. Good.']])
    expect([laid.splits, laid.changed]).toEqual([1, 2])
  })
})
