import type { Code, CodeGroup, Coding, Project } from './types'
import { emptyProject, newSource, now, suggestedRules, uid } from './model'

// Entirely synthetic. Names, places and organisations are invented.

const T1 = `RIVERBEND FOOD HUB FEASIBILITY — INTERVIEW R01
Respondent: programme manager, regional food bank (synthetic example)

[00:00]  Speaker 2
Thanks for joining us. In one or two sentences, what part of the local food system do you see from where you sit?

[00:09]  Speaker 1
Mostly the emergency side. We run three pantries and a school snack programme, so I see demand every week, and I see how little cold storage there is in River Bend once you leave the main depot.

[00:31]  Speaker 2
What is happening now that you know of, starting with your own organisation?

[00:36]  Speaker 1
We share a walk-in freezer with the community kitchen on Alder Street. It works because two people trust each other, not because anyone signed anything. If either of them left tomorrow I honestly don't know what would happen to it.

[01:02]  Speaker 1
The farmers' co-op does its own aggregation, but it is seasonal. In winter nothing comes through.

[01:15]  Speaker 2
What is the most consequential thing that can't happen here today because the capacity isn't there?

[01:21]  Speaker 1
We turn down donated produce. Last August we refused about four tonnes of squash because we had nowhere cold to put it. That food went to compost. A shared hub with proper refrigeration would change that overnight.

[01:48]  Speaker 1
I'd guess a hub would need maybe two full-time staff to run the cold chain properly. That's my guess, I haven't costed it.

[02:05]  Speaker 2
What's holding back growth?

[02:08]  Speaker 1
Funding is always annual. You can't plan a building on one-year grants. And the transport — we have one refrigerated van and it's twelve years old.

[02:30]  Speaker 2
If the hub proceeds, what would your organisation realistically contribute?

[02:35]  Speaker 1
That's not really my call. You'd want to ask our executive director about anything with money attached. I can tell you we'd want a say in how the space is scheduled.`

const T2 = `RIVERBEND FOOD HUB FEASIBILITY — INTERVIEW R02
Respondent: owner, mid-sized vegetable farm (synthetic example)

[00:00]  Speaker 2
In one or two sentences, what part of the local food system do you see?

[00:06]  Speaker 1
Production and selling. I grow on forty acres and sell through the co-op, two markets and a box scheme.

[00:20]  Speaker 2
What is happening now that you know of?

[00:24]  Speaker 1
There's more cooperation than people think. Four of us share a wash-and-pack line at the Hollis farm. It's informal but it has run for six years.

[00:45]  Speaker 2
What is the most consequential thing that can't happen here today?

[00:50]  Speaker 1
Selling to the hospital and the schools. They want consistent volume, labelled and chilled, and none of us can do that alone. I think a hub could unlock maybe a third more revenue for small growers, but I'm not sure anyone has the numbers.

[01:18]  Speaker 1
Honestly I'm wary. The last regional project was run from the city and we never saw the benefit. If it's run from River Bend by people who know us, fine.

[01:40]  Speaker 2
What's holding back growth?

[01:44]  Speaker 1
Labour, first. Then cold storage. Then the paperwork for institutional buyers — food safety audits cost more than some of us make in a month.`

export function demoProject(): Project {
  const p = emptyProject('Riverbend food hub (demo)')
  p.question = 'Is a shared food hub in Riverbend feasible, and what should it do first?'
  p.method = 'Framework Method — deductive codebook with inductive additions'
  p.coder = 'Demo researcher'

  const g = (name: string, kind: CodeGroup['kind'], color: string): CodeGroup => ({ id: uid(), name, kind, color })
  const gCap = g('01 Capacity now', 'substantive', '#2f7d78')
  const gGap = g('02 Gaps and barriers', 'substantive', '#c2573a')
  const gHub = g('03 Hub design', 'substantive', '#5b5fc7')
  const gE = g('E Evidence grade', 'evidence', '#7a4fa3')
  const gS = g('S Stance', 'stance', '#b8892c')
  const gCB = g('CB Cost-benefit flags', 'flag', '#4f8a3c')
  const gP = g('P Process', 'process', '#6b7280')
  p.groups = [gCap, gGap, gHub, gE, gS, gCB, gP]

  const c = (group: CodeGroup, name: string, definition: string, include = '', exclude = '', anchor = ''): Code =>
    ({ id: uid(), name, groupId: group.id, parentId: null, color: group.color, definition, include, exclude, anchor })
  const codes = {
    infra: c(gCap, '01.1 Shared infrastructure', 'Physical assets used by more than one organisation.', 'Freezers, kitchens, wash lines, vehicles that are shared.', 'Assets owned and used by one organisation only.', '“We share a walk-in freezer with the community kitchen.”'),
    informal: c(gCap, '01.2 Informal arrangements', 'Collaboration that depends on relationships rather than agreements.', 'Handshake deals, goodwill, key individuals.', 'Signed agreements — code 03.2.', '“It works because two people trust each other.”'),
    cold: c(gGap, '02.1 Cold chain', 'Missing or inadequate refrigeration, storage or refrigerated transport.', '', 'General funding complaints with no link to cold chain.', '“We had nowhere cold to put it.”'),
    funding: c(gGap, '02.2 Funding model', 'How money arrives and how that limits planning.', 'Grant cycles, annual funding, capital vs operating.', '', '“You can’t plan a building on one-year grants.”'),
    institutional: c(gGap, '02.3 Institutional market access', 'Barriers to selling to hospitals, schools and other institutions.', 'Volume, labelling, audits.', '', ''),
    labour: c(gGap, '02.4 Labour', 'Availability and cost of workers.', '', '', ''),
    governance: c(gHub, '03.1 Local control', 'Who runs the hub and from where.', '', '', '“If it’s run from River Bend by people who know us, fine.”'),
    scheduling: c(gHub, '03.2 Access and scheduling', 'How shared space and equipment would be allocated.', '', '', ''),
    e1: c(gE, 'E1 Documented', 'Claim backed by a document or figure the respondent can supply.'),
    e2: c(gE, 'E2 Firsthand experience', 'Respondent saw or did this themselves.'),
    e3: c(gE, 'E3 Hearsay', 'Respondent reports what others have said.'),
    e4: c(gE, 'E4 Opinion or estimate', 'A judgment, guess or hypothetical.'),
    s1: c(gS, 'S1 Supportive', 'Expresses support for the hub.'),
    s2: c(gS, 'S2 Conditional', 'Support depends on stated conditions.'),
    s3: c(gS, 'S3 Neutral / descriptive', 'Describes without taking a position.'),
    s4: c(gS, 'S4 Sceptical', 'Doubts feasibility or benefit.'),
    cbWaste: c(gCB, 'CB.1 Avoided waste', 'A quantity of food lost that a hub could save.', '', '', '“about four tonnes of squash”'),
    cbJobs: c(gCB, 'CB.2 Jobs / FTE', 'A count of staff or jobs.'),
    cbRevenue: c(gCB, 'CB.3 Revenue estimate', 'An estimate of income gained or lost.'),
    referral: c(gP, 'P.1 Referral', 'Respondent points to someone better placed to answer.'),
  }
  p.codes = Object.values(codes)
  p.rules = suggestedRules(p.groups)

  const s1 = newSource('R01 — Food bank programme manager', T1, 'Synthetic demo')
  const s2 = newSource('R02 — Vegetable farm owner', T2, 'Synthetic demo')
  s1.attributes = { 'Respondent ID': 'R01', Segment: 'Food access', 'Modules administered': 'Core only', 'Transcript reviewed': 'Pending' }
  s2.attributes = { 'Respondent ID': 'R02', Segment: 'Producers', 'Modules administered': 'Core only', 'Transcript reviewed': 'Pending' }
  for (const s of [s1, s2]) {
    s.speakers = [
      { raw: 'Speaker 1', name: s === s1 ? 'R01' : 'R02', role: 'respondent' },
      { raw: 'Speaker 2', name: 'Interviewer', role: 'interviewer' },
    ]
    s.status = 'coding'
  }
  s1.readTo = Math.floor(T1.length * 0.7)
  p.sources = [s1, s2]

  const codings: Coding[] = []
  const at = (src: typeof s1, phrase: string, ...cs: Code[]) => {
    const start = src.text.indexOf(phrase)
    if (start < 0) throw new Error('Demo phrase missing: ' + phrase)
    for (const code of cs) {
      codings.push({ id: uid(), sourceId: src.id, codeId: code.id, start, end: start + phrase.length, coder: p.coder, memo: '', important: false, status: 'accepted', createdAt: now() })
    }
  }
  at(s1, 'We share a walk-in freezer with the community kitchen on Alder Street.', codes.infra, codes.e2, codes.s3)
  at(s1, "It works because two people trust each other, not because anyone signed anything. If either of them left tomorrow I honestly don't know what would happen to it.", codes.informal, codes.e2, codes.s4)
  at(s1, 'Last August we refused about four tonnes of squash because we had nowhere cold to put it.', codes.cold, codes.cbWaste, codes.e2)
  at(s1, 'A shared hub with proper refrigeration would change that overnight.', codes.cold, codes.e4, codes.s1)
  // Deliberately incomplete: missing an evidence grade, and a CB flag without an extraction row.
  at(s1, "I'd guess a hub would need maybe two full-time staff to run the cold chain properly.", codes.cbJobs, codes.labour)
  at(s1, "Funding is always annual. You can't plan a building on one-year grants.", codes.funding, codes.e2, codes.s3)
  at(s1, "You'd want to ask our executive director about anything with money attached.", codes.referral)
  at(s2, 'Four of us share a wash-and-pack line at the Hollis farm.', codes.infra, codes.e2, codes.s3)
  at(s2, "It's informal but it has run for six years.", codes.informal, codes.e2, codes.s3)
  at(s2, 'Selling to the hospital and the schools. They want consistent volume, labelled and chilled, and none of us can do that alone.', codes.institutional, codes.e2, codes.s3)
  at(s2, 'I think a hub could unlock maybe a third more revenue for small growers', codes.cbRevenue, codes.institutional, codes.e4, codes.s1)
  at(s2, "If it's run from River Bend by people who know us, fine.", codes.governance, codes.e4, codes.s2)
  at(s2, 'Labour, first. Then cold storage.', codes.labour, codes.cold, codes.e2, codes.e4)
  // A second coder's pass on R02, for the agreement view.
  const second = (phrase: string, code: Code) => {
    const start = s2.text.indexOf(phrase)
    codings.push({ id: uid(), sourceId: s2.id, codeId: code.id, start, end: start + phrase.length, coder: 'Second coder', memo: '', important: false, status: 'accepted', createdAt: now() })
  }
  second('Four of us share a wash-and-pack line at the Hollis farm.', codes.infra)
  second("It's informal but it has run for six years.", codes.informal)
  second('They want consistent volume, labelled and chilled', codes.institutional)
  second("If it's run from River Bend by people who know us", codes.governance)
  second('Labour, first.', codes.labour)
  // An AI-style suggestion awaiting review.
  const sug = s2.text.indexOf('food safety audits cost more than some of us make in a month')
  codings.push({ id: uid(), sourceId: s2.id, codeId: codes.institutional.id, start: sug, end: sug + 59, coder: 'Assistant', memo: 'Suggested: audit costs as a barrier to institutional buyers.', important: false, status: 'suggested', createdAt: now() })
  p.codings = codings
  const waste = codings.find((x) => x.codeId === codes.cbWaste.id)!
  p.extractions = [{ id: uid(), codingId: waste.id, values: { Figure: '4', Unit: 'tonnes of squash / year', Basis: 'Respondent recall, one season' } }]

  p.guide = [
    { id: uid(), key: 'C1', title: 'Vantage', prompt: 'In one or two sentences: what part of the local food system do you see from where you sit?', probes: [], module: '', minutes: 2, codeIds: [] },
    { id: uid(), key: 'C2', title: 'What exists now', prompt: 'What is actually happening that you know of? Start with your own organisation.', probes: ['Where does it physically sit?', 'Is it in a formal mandate or does it depend on individuals?'], module: '', minutes: 8, codeIds: [codes.infra.id, codes.informal.id] },
    { id: uid(), key: 'C3', title: 'The consequential gap', prompt: "What is the most consequential thing that can't happen here today?", probes: ['People, money, equipment, space, or data?'], module: '', minutes: 7, codeIds: [codes.cold.id, codes.institutional.id] },
    { id: uid(), key: 'C4', title: 'Barriers, ranked', prompt: "What's holding back growth?", probes: ['Top three, in order?'], module: '', minutes: 6, codeIds: [codes.funding.id, codes.labour.id] },
    { id: uid(), key: 'C5', title: 'Participation', prompt: 'What would your organisation realistically contribute?', probes: ['What would you need in return?', 'Who decides, and when?'], module: '', minutes: 5, codeIds: [codes.scheduling.id] },
    { id: uid(), key: 'M1', title: 'Governance', prompt: 'Who should run the hub, and how should decisions be made?', probes: [], module: 'M1 Governance', minutes: 5, codeIds: [codes.governance.id] },
  ]
  const mark = (src: typeof s1, key: string, status: Project['coverage'][number]['status'], note = '') =>
    p.coverage.push({ sourceId: src.id, questionId: p.guide.find((q) => q.key === key)!.id, status, note, start: null, end: null })
  mark(s1, 'C1', 'answered'); mark(s1, 'C2', 'answered'); mark(s1, 'C3', 'answered'); mark(s1, 'C4', 'answered')
  mark(s1, 'C5', 'no-view', 'Deferred to executive director.'); mark(s1, 'M1', 'not-asked')
  mark(s2, 'C1', 'answered'); mark(s2, 'C2', 'answered'); mark(s2, 'C3', 'answered'); mark(s2, 'C4', 'partial', 'Ranked labour, storage, paperwork; no funding probe.')
  mark(s2, 'C5', 'not-asked', 'Ran out of time.')

  p.glossary = [
    { id: uid(), find: 'River Bend', replace: 'Riverbend', wholeWord: true, caseSensitive: true },
  ]
  p.cases = [
    { id: uid(), name: 'R01 Food bank', sourceIds: [s1.id], attributes: { Segment: 'Food access' } },
    { id: uid(), name: 'R02 Farm', sourceIds: [s2.id], attributes: { Segment: 'Producers' } },
  ]
  p.themes = [
    { id: uid(), title: 'Cold chain is the binding constraint', codeIds: [codes.cold.id, codes.cbWaste.id], interpretation: '' },
    { id: uid(), title: 'Collaboration exists but is fragile', codeIds: [codes.infra.id, codes.informal.id], interpretation: '' },
    { id: uid(), title: 'Who the hub is for', codeIds: [codes.governance.id, codes.institutional.id], interpretation: '' },
  ]
  p.cells = [{ caseId: p.cases[0].id, themeId: p.themes[0].id, summary: 'Refuses donated produce for lack of cold storage; sees refrigeration as the single fix.', pinned: [] }]
  p.memos = [
    { id: uid(), title: 'Coder protocol', kind: 'journal', body: 'Code claim-level spans (one sentence or clause).\nEvery substantive claim gets exactly one evidence grade.\nStance only where a position is expressed.\nLog new code ideas as candidates; do not add codes mid-interview.', sourceId: null, codeId: null, start: null, end: null, author: p.coder, updatedAt: now() },
    { id: uid(), title: 'Fragility of informal sharing', kind: 'memo', body: 'Both respondents describe shared assets that rest on personal trust. Worth asking R03 what happens when a key person leaves.', sourceId: null, codeId: codes.informal.id, start: null, end: null, author: p.coder, updatedAt: now() },
  ]
  const cand = s2.text.indexOf('The last regional project was run from the city and we never saw the benefit.')
  p.candidates = [
    { id: uid(), name: 'Past project distrust', rationale: 'Scepticism grounded in a previous externally run initiative — not quite 03.1 Local control.', sourceId: s2.id, start: cand, end: cand + 77, status: 'open', resolution: '', proposedBy: p.coder, createdAt: now() },
  ]
  return p
}
