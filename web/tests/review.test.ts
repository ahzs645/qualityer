import { beforeEach, describe, expect, it } from 'vitest'
import { checkRules, editSource, emptyProject, newSource, pendingSuggestions, quotable, uid, WITHHELD } from '../src/lib/model'
import { buildClaims, choiceGroups, codeKey, stepEdge, summariseDecisions } from '../src/lib/claims'
import { compare } from '../src/lib/compare'
import { buildProfile, cellKey } from '../src/lib/profile'
import { claimsCSV, reportHTML, reportMarkdown } from '../src/lib/report'
import { adoptClaim, chooseInGroup, confirmClaim, recodeCoding, rejectClaim, respanClaim, setComparisonOnly, setRestricted } from '../src/lib/review'
import { acceptSuggestions, rejectSuggestions } from '../src/lib/actions'
import { store } from '../src/lib/store'
import type { AiRun, Coding, Project } from '../src/lib/types'

const TEXT = 'Interviewer: What exists now?\nRespondent: We have a small lab. It is hard to keep staff here. I think a hub would help.\nInterviewer: Thanks.'
const at = (needle: string): [number, number] => { const i = TEXT.indexOf(needle); return [i, i + needle.length] }

function run(id: string, sourceId: string): AiRun {
  return { id, startedAt: '2026-01-01T00:00:00Z', finishedAt: null, provider: 'agent', model: 'test-model', promptHash: '', codebookHash: '', sourceIds: [sourceId], codeIds: [], windows: 1, completed: 1, failed: [], suggestions: 0, repaired: 0, rejected: [], notes: '', codeKeys: {}, options: { windowSize: 8, contextTurns: 1, respondentOnly: true, effort: 'low' } }
}

/** A study with one source, a substantive group, evidence and stance groups, and one AI pass. */
function study() {
  const p = emptyProject('Test')
  p.coder = 'Reviewer'
  const s = newSource('R1', TEXT)
  p.sources = [s]
  p.cases = [{ id: 'case', name: 'R1', sourceIds: [s.id], attributes: {} }]
  p.groups = [
    { id: 'sub', name: '01 Capacity', kind: 'substantive', color: '#111' },
    { id: 'ev', name: 'E Evidence', kind: 'evidence', color: '#222' },
    { id: 'st', name: 'S Stance', kind: 'stance', color: '#333' },
  ]
  const code = (id: string, name: string, groupId: string) => ({ id, name, groupId, parentId: null, color: '#000', definition: '', include: '', exclude: '', anchor: '' })
  p.codes = [code('lab', '01.1  Lab', 'sub'), code('staff', '01.2  Staff', 'sub'), code('e2', 'E2  Firsthand', 'ev'), code('e4', 'E4  Opinion', 'ev'), code('s3', 'S3  Neutral', 'st'), code('s4', 'S4  Sceptical', 'st')]
  p.rules = [
    { id: 'r1', kind: 'exactly-one', triggerGroupIds: ['sub'], targetGroupId: 'ev', enabled: true },
    { id: 'r2', kind: 'exactly-one', triggerGroupIds: ['sub'], targetGroupId: 'st', enabled: true },
  ]
  p.aiRuns = [run('run', s.id)]
  const ai = (codeId: string, span: [number, number], extra: Partial<Coding> = {}): Coding => ({
    id: uid(), sourceId: s.id, codeId, start: span[0], end: span[1], coder: 'AI · test', memo: '', important: false, status: 'suggested', createdAt: '', confidence: 0.6, origin: { runId: 'run', match: 'exact' }, ...extra,
  })
  const lab = at('We have a small lab.')
  const staff = at('It is hard to keep staff here.')
  p.codings = [ai('lab', lab), ai('e4', lab), ai('s3', lab), ai('staff', staff, { confidence: 0.9 }), ai('e2', staff, { confidence: 0.9 })]
  return { p, s, lab, staff }
}

const open = (p: Project) => store.setState(() => ({ project: p, saving: 'idle', error: null, past: [], future: [], lastChange: null }))
const project = () => store.state.project!

describe('claims', () => {
  it('groups codings on one passage and reports what the rules still need', () => {
    const { p, lab, staff } = study()
    const claims = buildClaims(p)
    expect(claims.map((c) => [c.start, c.codings.length, c.state])).toEqual([[lab[0], 3, 'pending'], [staff[0], 2, 'pending']])
    expect(claims[0].issues).toEqual([])
    expect(claims[1].issues).toEqual(['Missing S Stance'])
    expect(claims[1].confidence).toBe(0.9)
  })

  it('leaves comparison-only passes out of the queue but keeps them for comparison', () => {
    const { p } = study()
    p.aiRuns[0].comparisonOnly = true
    expect(buildClaims(p)).toEqual([])
    expect(pendingSuggestions(p)).toEqual([])
    expect(buildClaims(p, { includeComparison: true }).length).toBe(2)
  })

  it('lists single-choice groups from the rules', () => {
    const { p } = study()
    expect(choiceGroups(p).map((g) => [g.group.id, g.required, g.codes.length])).toEqual([['ev', true, 2], ['st', true, 2]])
  })

  it('shortens numbered code names and steps passage edges by a word', () => {
    expect(codeKey('03.2.4  Peer review dynamics')).toBe('03.2.4')
    expect(codeKey('E2  Firsthand experience')).toBe('E2')
    expect(codeKey('CB.9  Timeline / duration')).toBe('CB.9')
    const t = 'one two three four'
    expect(stepEdge(t, 4, 'start', -1, 0, t.length)).toBe(0)
    expect(stepEdge(t, 4, 'start', 1, 0, t.length)).toBe(8)
    expect(stepEdge(t, 7, 'end', 1, 0, t.length)).toBe(13)
    expect(stepEdge(t, 13, 'end', -1, 0, t.length)).toBe(7)
    expect(stepEdge(t, 4, 'start', -1, 4, t.length)).toBe(4)
  })
})

describe('review decisions', () => {
  let ctx: ReturnType<typeof study>
  beforeEach(() => { ctx = study(); open(ctx.p) })
  const span = (s: [number, number]) => ({ start: s[0], end: s[1] })

  it('confirming a claim accepts its suggestions, signs it off and logs each coding', () => {
    confirmClaim(ctx.s.id, span(ctx.lab))
    const claim = buildClaims(project())[0]
    expect(claim.state).toBe('checked')
    expect(claim.codings.every((c) => c.status === 'accepted' && c.reviewedBy === 'Reviewer' && c.coder === 'AI · test')).toBe(true)
    expect(project().reviewLog.map((e) => e.action)).toEqual(['accept', 'accept', 'accept'])
    expect(project().reviewLog[0]).toMatchObject({ by: 'Reviewer', ai: true, runId: 'run', confidence: 0.6 })
  })

  it('treats codings accepted by someone else as unchecked until this reviewer confirms them', () => {
    open({ ...ctx.p, codings: ctx.p.codings.map((c) => ({ ...c, status: 'accepted' as const, reviewedBy: 'Assistant' })) })
    expect(buildClaims(project()).map((c) => c.state)).toEqual(['unchecked', 'unchecked'])
    confirmClaim(ctx.s.id, span(ctx.staff))
    expect(buildClaims(project()).map((c) => c.state)).toEqual(['unchecked', 'checked'])
    expect(project().reviewLog.map((e) => [e.action, e.priorReviewer])).toEqual([['confirm', 'Assistant'], ['confirm', 'Assistant']])
  })

  it('changing a grade keeps the AI proposal in the log and makes the coding the reviewer\'s', () => {
    chooseInGroup(ctx.s.id, span(ctx.lab), 'ev', 'e2')
    const c = project().codings.find((x) => x.start === ctx.lab[0] && x.codeId === 'e2')!
    expect(c).toMatchObject({ status: 'accepted', coder: 'Reviewer', reviewedBy: 'Reviewer' })
    expect(c.origin?.runId).toBe('run')
    expect(project().reviewLog.at(-1)).toMatchObject({ action: 'recode', codeId: 'e4', toCodeId: 'e2', ai: true })
    confirmClaim(ctx.s.id, span(ctx.lab))
    const sum = summariseDecisions(project())
    expect([sum.total, sum.kept, sum.recoded, sum.rejected]).toEqual([3, 2, 1, 0])
    expect(sum.changes).toEqual([{ fromId: 'e4', toId: 'e2', n: 1 }])
    expect(sum.byBand.medium).toEqual({ kept: 2, recoded: 1, rejected: 0 })
  })

  it('adds a missing choice as the reviewer\'s own coding', () => {
    chooseInGroup(ctx.s.id, span(ctx.staff), 'st', 's4')
    const added = project().codings.find((x) => x.codeId === 's4')!
    expect(added).toMatchObject({ coder: 'Reviewer', status: 'accepted' })
    expect(added.origin).toBeUndefined()
    expect(project().reviewLog.at(-1)).toMatchObject({ action: 'add', ai: false })
    expect(buildClaims(project())[1].issues).toEqual([])
  })

  it('rejecting a claim deletes the AI codings and keeps the reason', () => {
    rejectClaim(ctx.s.id, span(ctx.staff), 'Not a claim')
    expect(project().codings.some((c) => c.start === ctx.staff[0])).toBe(false)
    expect(project().reviewLog.map((e) => [e.action, e.codeId, e.note])).toEqual([['reject', 'staff', 'Not a claim'], ['reject', 'e2', 'Not a claim']])
    expect(summariseDecisions(project()).rejected).toBe(2)
  })

  it('counts a coding once however often it is revisited', () => {
    const id = ctx.p.codings[0].id
    acceptSuggestions([id])
    recodeCoding(id, 'staff')
    recodeCoding(id, 'lab')
    const sum = summariseDecisions(project())
    expect([sum.total, sum.kept, sum.recoded]).toEqual([1, 1, 0])
    rejectSuggestions([id])
    expect(summariseDecisions(project()).rejected).toBe(1)
  })

  it('moves a passage with its codings and its off-the-record mark', () => {
    setRestricted(ctx.s.id, span(ctx.lab), 'Off the record')
    const wider = { start: ctx.lab[0], end: ctx.staff[1] }
    respanClaim(ctx.s.id, span(ctx.lab), wider)
    expect(project().codings.filter((c) => c.start === wider.start && c.end === wider.end).length).toBe(3)
    expect(project().restricted[0]).toMatchObject(wider)
    expect(project().reviewLog.at(-1)?.action).toBe('respan')
  })

  it('adopts one passage from a comparison-only pass and leaves the rest parked', () => {
    setComparisonOnly('run', true)
    adoptClaim(ctx.s.id, span(ctx.staff), 'run')
    const claims = buildClaims(project())
    expect(claims.map((c) => [c.start, c.state, c.codings.length])).toEqual([[ctx.staff[0], 'checked', 2]])
    expect(pendingSuggestions(project()).length).toBe(0)
    expect(project().codings.filter((c) => c.status === 'suggested').length).toBe(3)
    expect(project().reviewLog.map((e) => e.action)).toEqual(['accept', 'accept'])
  })

  it('parks and returns a pass', () => {
    setComparisonOnly('run', true)
    expect(pendingSuggestions(project()).length).toBe(0)
    setComparisonOnly('run', false)
    expect(pendingSuggestions(project()).length).toBe(5)
  })
})

describe('off the record', () => {
  it('withholds the wording from quotes, the report and the claims table, and follows transcript edits', () => {
    const { p, s, lab } = study()
    open(p)
    confirmClaim(s.id, { start: lab[0], end: lab[1] })
    setRestricted(s.id, { start: lab[0], end: lab[1] }, 'Off the record')
    let cur = project()
    expect(quotable(cur, s, lab[0], lab[1])).toBe(WITHHELD)
    expect(quotable(cur, s, lab[0] + 3, lab[1] + 9)).toBe(WITHHELD)
    cur = { ...cur, themes: [{ id: 't', title: '01 Capacity', codeIds: ['lab'], interpretation: '' }], cells: [{ caseId: 'case', themeId: 't', summary: 'Has a lab.', pinned: [cur.codings[0].id] }] }
    for (const out of [reportHTML(cur), reportMarkdown(cur), claimsCSV(cur)]) {
      expect(out).not.toContain('small lab')
      expect(out).toContain('withheld')
    }
    const moved = editSource(cur, s.id, [{ start: 0, end: 11, text: 'Q' }])
    expect(moved.restricted[0].start).toBe(lab[0] - 10)
    expect(moved.reviewLog[0].start).toBe(lab[0] - 10)
    expect(checkRules(moved).length).toBe(0)
  })
})

describe('compare and profile', () => {
  it('scores an AI pass against a person and tabulates grade disagreements', () => {
    const { p, s, lab, staff } = study()
    const human = (codeId: string, span: [number, number]): Coding => ({ id: uid(), sourceId: s.id, codeId, start: span[0], end: span[1], coder: 'Ana', memo: '', important: false, status: 'accepted', createdAt: '' })
    const part: [number, number] = [lab[0] + 3, lab[1]]
    const ref = [human('lab', part), human('e2', part), human('s3', part), human('lab', at('a hub would help'))]
    const result = compare(p, ref, p.codings, ['ev', 'st'])
    expect(result.byKind.substantive).toMatchObject({ recall: 0.5, precision: 0.5, ref: 2, other: 2 })
    const ev = result.confusions[0]
    expect(ev.counts.get('e2')?.get('e4')).toBe(1)
    expect(ev.counts.get('')?.get('e2')).toBe(1)
    expect([ev.agree, ev.compared]).toEqual([0, 1])
    expect(result.confusions[1].agree).toBe(1)
    expect(result.otherOnly.map((c) => c.codeId).sort()).toEqual(['e2', 'e4', 'staff'])
    expect(staff[0]).toBeGreaterThan(lab[0])
  })

  it('profiles each case by domain with its evidence and stance mix', () => {
    const { p } = study()
    p.codings = p.codings.map((c) => ({ ...c, status: 'accepted' as const, reviewedBy: 'Assistant' }))
    const cell = buildProfile(p).cells.get(cellKey('case', 'sub'))!
    expect(cell.claims.length).toBe(2)
    expect(cell.mixes[0].parts.map((x) => x.n)).toEqual([1, 1])
    expect(cell.mixes[1].parts.map((x) => x.n)).toEqual([1, 0])
    expect(cell.unchecked).toBe(1)
  })
})
