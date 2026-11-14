import { beforeEach, describe, expect, it } from 'vitest'
import { checkRules, editSource, emptyProject, newSource, pendingSuggestions, quotable, uid, WITHHELD } from '../src/lib/model'
import { buildClaims, choiceGroups, codeKey, stepEdge, summariseDecisions } from '../src/lib/claims'
import { compare } from '../src/lib/compare'
import { buildProfile, cellKey } from '../src/lib/profile'
import { claimsCSV, firstSentences, recipeOptions, reportHTML, reportMarkdown } from '../src/lib/report'
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

describe('cases follow their sources', () => {
  it('renames a one-source case with its source, removes it with its source, and fills gaps', async () => {
    const { addMissingCases, addSources, removeSource, updateSource } = await import('../src/lib/actions')
    const p = emptyProject('Cases')
    open(p)
    const a = newSource('Dr. A interview', 'Text A.')
    const b = newSource('Dr. B interview', 'Text B.')
    addSources([a, b])
    expect(project().cases.map((c) => c.name)).toEqual(['Dr. A interview', 'Dr. B interview'])
    updateSource(a.id, { name: 'R03 — Professor (A)' })
    expect(project().cases[0].name).toBe('R03 — Professor (A)')
    removeSource(b.id)
    expect(project().cases.map((c) => c.name)).toEqual(['R03 — Professor (A)'])
    const c = { ...newSource('R05 — Someone', 'Text C.'), attributes: { 'Respondent ID': 'R05' } }
    store.setState((st) => ({ ...st, project: { ...st.project!, sources: [...st.project!.sources, c] } }))
    addMissingCases()
    expect(project().cases.map((k) => k.name)).toEqual(['R03 — Professor (A)', 'R05'])
    const { moveSource } = await import('../src/lib/actions')
    moveSource(c.id, -1)
    expect(project().cases.map((k) => k.name)).toEqual(['R05', 'R03 — Professor (A)'])
  })
})

describe('report calibration', () => {
  it('compares a pass only with human coding made before it ran', () => {
    const { p, s, lab } = study()
    const human = (createdAt: string): Coding => ({ id: uid(), sourceId: s.id, codeId: 'lab', start: lab[0], end: lab[1], coder: 'Analyst', memo: '', important: false, status: 'accepted', createdAt })
    // A code the reviewer added while reviewing the pass is not a standard to calibrate against.
    const after = { ...p, codings: [...p.codings, human('2026-02-01T00:00:00Z')] }
    expect(reportMarkdown(after, recipeOptions('full'))).not.toContain('### Calibration on')
    const before = { ...p, codings: [...p.codings, human('2025-12-01T00:00:00Z')] }
    expect(reportMarkdown(before, recipeOptions('full'))).toContain('### Calibration on R1')
  })
})

describe('report recipes', () => {
  it('builds a short summary with perspectives and a tabbed full report', () => {
    const { p, s, lab } = study()
    open(p)
    confirmClaim(s.id, { start: lab[0], end: lab[1] })
    const q = { id: 'q', title: 'Feelings', text: 'How do they feel?', version: 2, parentId: null, scope: 'all' as const, maskNames: false, createdAt: '2026-01-01', note: '' }
    const cur = {
      ...project(), asks: [q],
      askAnswers: [{ id: 'a', promptId: 'q', sourceId: s.id, text: 'Overall: supportive with conditions. They want staff.\nHopes:\n- More staff', evidence: [{ turnId: 'T0002', quote: 'We have a small lab.', start: lab[0], end: lab[1], match: 'exact' as const }], notAddressed: false, model: 'test-model', at: '', rating: null, reviewNote: '' }],
      themes: [{ id: 't', title: '01 Capacity', codeIds: ['lab'], interpretation: '' }],
      cells: [{ caseId: 'case', themeId: 't', summary: 'One. Two. Three.', pinned: [project().codings[0].id] }],
    }
    const summary = reportHTML(cur, recipeOptions('summary'))
    expect(summary).toContain('Participant perspectives')
    expect(summary).toContain('<span class="tag no-view">supportive with conditions</span>')
    expect(summary).toContain('<li>More staff</li>')
    expect(summary).toContain('Findings by theme')
    expect(summary).toContain('One. Two. …')
    expect(summary).not.toContain('nav class="tabs"')
    expect(summary).not.toContain('Code counts')
    const full = reportHTML(cur, recipeOptions('full'))
    expect(full).toContain('<nav class="tabs"')
    expect(full).toContain('id="p-perspectives"')
    expect(full).toContain('Code counts')
    expect(reportMarkdown(cur, recipeOptions('summary'))).toContain('## Participant perspectives')
    expect(firstSentences('A. B. C.', 5)).toBe('A. B. C.')
  })
})

describe('sign-off', () => {
  it('blocks while claims are unchecked, then reads as final and names an AI reviewer as such', async () => {
    const { signOffBlockers, reportStatus } = await import('../src/lib/report')
    const { p, s, lab, staff } = study()
    open(p)
    expect(signOffBlockers(project()).join(' ')).toContain('AI suggestions have not been decided')
    confirmClaim(s.id, { start: lab[0], end: lab[1] })
    rejectClaim(s.id, { start: staff[0], end: staff[1] })
    const done = { ...project(), sources: project().sources.map((x) => ({ ...x, status: 'done' as const })) }
    expect(signOffBlockers(done)).toEqual([])
    const signed = { ...done, signoff: { by: 'Claude (acting reviewer)', role: 'ai' as const, at: done.updatedAt, note: 'Checked every claim.' } }
    expect(reportStatus(signed)).toContain('an AI acting as the human reviewer. No person has signed off this analysis')
    const html = reportHTML(signed, recipeOptions('standard'))
    expect(html).toContain('class="status final"')
    expect(html).toContain('<h2>Limitations</h2>')
    expect(reportStatus({ ...signed, signoff: { ...signed.signoff, role: 'person' as const, by: 'A. Analyst' } })).toMatch(/^Final: signed off on .* by A\. Analyst\.$/)
    const later = { ...signed, updatedAt: new Date(Date.parse(signed.signoff.at) + 120_000).toISOString() }
    expect(reportStatus(later)).toContain('edited since')
  })
})
