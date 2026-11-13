import { z } from 'zod'
import type { AskAnswer, AskEvidence, AskPrompt, NameEntry, Project, Source } from '../types'
import { formatTime, now, uid } from '../model'
import { findNames } from '../names'
import { locateQuote, turnsOf, xml, hash } from './pipeline'

// Ask across interviews: one question, put to every interview separately, so
// the answers can be read side by side. Each answer has to point to verbatim
// evidence, which is checked against the transcript in the browser, as for AI
// coding. Questions keep their versions so a prompt can be refined and the
// answers of two versions compared.

export const AskResponseSchema = z.object({
  answer: z.string(),
  not_addressed: z.boolean(),
  evidence: z.array(z.object({ turn_id: z.string(), quote: z.string() })),
})
export type AskResponse = z.infer<typeof AskResponseSchema>

export const ASK_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'not_addressed', 'evidence'],
  properties: {
    answer: { type: 'string', description: 'The answer for this interview, in plain prose or short bullet points. Cite turns like [T0042].' },
    not_addressed: { type: 'boolean', description: 'True when the interview does not address the question at all' },
    evidence: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['turn_id', 'quote'],
        properties: {
          turn_id: { type: 'string', description: 'Turn id, e.g. T0042' },
          quote: { type: 'string', description: 'Verbatim words from that turn that support the answer' },
        },
      },
    },
  },
} as const

/** Starting points for common questions; a researcher edits them before running. */
export const ASK_TEMPLATES: { title: string; text: string }[] = [
  {
    title: 'Feelings and views about the proposal',
    text: 'How does this participant feel about the proposal overall, and why? Describe their main hopes, worries and conditions, and say where they are enthusiastic, cautious or sceptical. Keep to what they said.',
  },
  {
    title: 'Biggest barrier, in their words',
    text: 'What does this participant see as the single biggest barrier, and what do they think would remove it?',
  },
  {
    title: 'Where they disagree',
    text: 'Where does this participant disagree with the interviewer, with the framing of a question, or with the proposal as described? If they never disagree, say so.',
  },
  {
    title: 'Five-point summary',
    text: 'Summarise this interview in five bullet points a colleague could read in a minute: who is speaking (by role), their main points, and anything surprising.',
  },
]

const SYSTEM = (project: Project) => `You are helping a qualitative researcher read interview transcripts. You will be given ONE interview from a study and a question about it.

Study: ${project.name}
${project.question ? `Research question: ${project.question}\n` : ''}
How to answer:
- Answer for this interview only, from what was said in it. Do not bring in other interviews or outside knowledge.
- Distinguish what the participant said from your interpretation; mark interpretation as such ("this suggests…").
- Support each point with evidence: quotes copied word for word from a single turn (keep fillers and repetitions; no ellipses, no joining turns), with that turn's id. Quote the participant, not the interviewer, unless the question is about the interviewer.
- Cite turns in the answer like [T0042].
- If the interview does not address the question, set not_addressed to true and say briefly what the interview covers instead. Never invent an answer.
- Names may have been replaced with stand-ins in square brackets, such as [R01] or [Person 2]; keep them as they are.
- Refer to the participant by their ID or as "they"; do not infer gender from a name or a voice.
- Return JSON matching the schema: {"answer": string, "not_addressed": boolean, "evidence": [{"turn_id": string, "quote": string}]}.`

/**
 * The transcript as the model will see it, with names masked when asked. `map`
 * takes an offset in the masked text back to the source text, so evidence found
 * in the masked text can still link to the transcript.
 */
export function maskedText(text: string, entries: NameEntry[]) {
  const hits = findNames(text, entries.filter((e) => e.mask && e.replacement.trim()))
  let out = ''
  const from: number[] = []
  const to: number[] = []
  let last = 0
  for (const h of hits) {
    for (let i = last; i < h.start; i++) { from.push(i); to.push(i + 1) }
    out += text.slice(last, h.start)
    const r = h.entry.replacement.trim()
    for (let i = 0; i < r.length; i++) { from.push(h.start); to.push(h.end) }
    out += r
    last = h.end
  }
  for (let i = last; i < text.length; i++) { from.push(i); to.push(i + 1) }
  out += text.slice(last)
  return { text: out, start: (o: number) => from[o] ?? text.length, end: (o: number) => to[o - 1] ?? text.length }
}

/** The request for one interview: respondent sheet, every turn with its id, then the question. */
export function askMessage(project: Project, source: Source, prompt: AskPrompt) {
  const names = prompt.maskNames ? project.names : []
  const mask = (t: string) => (names.length ? maskedText(t, names).text : t)
  const turns = turnsOf(source)
  // With scope "respondent", interviewer turns are shortened to what is needed to follow the conversation.
  const lines = turns
    .map((t) => {
      const body = mask(source.text.slice(t.start, t.end).trim())
      const shown = prompt.scope === 'respondent' && t.role === 'interviewer' ? body.slice(0, 400) : body
      return `<turn id="${t.id}" speaker="${xml(mask(t.speaker))}"${t.role !== 'unknown' ? ` role="${t.role}"` : ''}${t.time != null ? ` time="${formatTime(t.time)}"` : ''}>${xml(shown)}</turn>`
    })
  const attrs = Object.entries(source.attributes).filter(([, v]) => v.trim()).map(([k, v]) => `  ${xml(k)}: ${xml(mask(v))}`).join('\n')
  return `Interview: ${xml(mask(source.name))}
${attrs ? `<respondent>\n${attrs}\n</respondent>\n` : ''}
<transcript>
${lines.join('\n')}
</transcript>

<question>
${xml(prompt.text.trim())}
</question>`
}

export function askSystem(project: Project) { return SYSTEM(project) }

/** Checks each piece of evidence against the transcript the model saw. */
export function verifyAnswer(project: Project, source: Source, prompt: AskPrompt, raw: AskResponse, model: string): AskAnswer {
  const turns = new Map(turnsOf(source).map((t) => [t.id, t]))
  const masked = prompt.maskNames ? maskedText(source.text, project.names) : null
  const evidence: AskEvidence[] = raw.evidence.map((e) => {
    const t = turns.get(e.turn_id.trim())
    if (!t) return { turnId: e.turn_id, quote: e.quote, match: 'not-found' as const }
    if (!masked) {
      const m = locateQuote(source.text, t, e.quote)
      return 'reason' in m ? { turnId: t.id, quote: e.quote, match: 'not-found' as const } : { turnId: t.id, quote: e.quote, start: m.start, end: m.end, match: m.match }
    }
    // Find the turn in the masked text, look for the quote there, and map back.
    const before = maskedText(source.text.slice(0, t.start), project.names).text.length
    const len = maskedText(source.text.slice(t.start, t.end), project.names).text.length
    const m = locateQuote(masked.text, { start: before, end: before + len }, e.quote)
    return 'reason' in m ? { turnId: t.id, quote: e.quote, match: 'not-found' as const } : { turnId: t.id, quote: e.quote, start: masked.start(m.start), end: masked.end(m.end), match: m.match }
  })
  return { id: uid(), promptId: prompt.id, sourceId: source.id, text: raw.answer.trim(), evidence, notAddressed: raw.not_addressed, model, at: now(), rating: null, reviewNote: '' }
}

// ---------------------------------------------------------------------------
// Agent hand-off

export interface AskPack {
  format: 'research-weave-ask-pack'
  version: 1
  promptId: string
  question: string
  instructions: string
  system: string
  response_schema: typeof ASK_JSON_SCHEMA
  requests: { id: string; interview: string; user: string }[]
}

export interface AskResponses {
  format: 'research-weave-ask-responses'
  promptId: string
  model?: string
  responses: ({ id: string } & AskResponse)[]
}

export function askPack(project: Project, prompt: AskPrompt, sourceIds: string[]): AskPack {
  const sources = project.sources.filter((s) => sourceIds.includes(s.id))
  return {
    format: 'research-weave-ask-pack', version: 1, promptId: prompt.id, question: prompt.text,
    instructions: 'For each request, act on `system` as your instructions and `user` as the input, and answer as JSON matching response_schema. Collect the answers as {"format":"research-weave-ask-responses","promptId":<promptId>,"model":<your model>,"responses":[{"id":<request id>,"answer":…,"not_addressed":…,"evidence":[…]}]}. Quotes must be copied verbatim from the named turn.',
    system: SYSTEM(project), response_schema: ASK_JSON_SCHEMA,
    requests: sources.map((s) => ({ id: s.id, interview: prompt.maskNames ? maskedText(s.name, project.names).text : s.name, user: askMessage(project, s, prompt) })),
  }
}

/** Reads hand-off answers; returns the verified answers and the ids that could not be read. */
export function readAskResponses(project: Project, data: AskResponses): { answers: AskAnswer[]; failed: string[] } {
  const prompt = project.asks.find((a) => a.id === data.promptId)
  if (!prompt) throw new Error('These answers belong to a question that is not in this study.')
  const answers: AskAnswer[] = []
  const failed: string[] = []
  for (const r of data.responses ?? []) {
    const source = project.sources.find((s) => s.id === r.id)
    const parsed = AskResponseSchema.safeParse(r)
    if (!source || !parsed.success) { failed.push(r.id); continue }
    answers.push(verifyAnswer(project, source, prompt, parsed.data, data.model || 'agent'))
  }
  return { answers, failed }
}

// ---------------------------------------------------------------------------
// Refining a question

export interface Advice { id: string; text: string; addition?: string }

/**
 * Suggestions for the next version of a question, from the question itself and
 * from what its answers and the researcher's ratings show.
 */
export function refineAdvice(prompt: AskPrompt, answers: AskAnswer[]): Advice[] {
  const t = prompt.text.toLowerCase()
  const out: Advice[] = []
  // A new version has no answers yet: what its parent's answers showed is what it should fix.
  const own = answers.filter((a) => a.promptId === prompt.id)
  const fromParent = !own.length && !!prompt.parentId
  const mine = fromParent ? answers.filter((a) => a.promptId === prompt.parentId) : own
  const tag = fromParent ? `From v${prompt.version - 1}'s answers: ` : ''
  if (!/\b(quote|evidence|in their words|cite)\b/.test(t)) out.push({ id: 'evidence', text: 'Ask for the participant\'s own words, so every point can be checked.', addition: 'Back each point with a short verbatim quote.' })
  if (!/(not (address|discuss|mention)|doesn'?t (address|discuss|come up)|if (they|the participant) (never|did not|didn'?t))/.test(t)) out.push({ id: 'absent', text: 'Say what to do when the interview does not cover it, so silence is not filled in.', addition: 'If the interview does not touch on this, say so rather than inferring.' })
  if (!/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten) (bullet|point|sentence|word)s?\b|\bunder \d+ words\b|\bbrief(ly)?\b|\bshort\b/.test(t)) {
    const long = mine.filter((a) => a.text.split(/\s+/).length > 220).length
    out.push({ id: 'length', text: long ? `${tag}${long} of ${mine.length} answers ran past 220 words. Set a length or a format.` : 'Set a length or a format, so answers line up side by side.', addition: 'Answer in at most five bullet points.' })
  }
  if (/\b(and|or)\b.*\?.*\b(and|or)\b.*\?/.test(t) || (t.match(/\?/g)?.length ?? 0) > 2) out.push({ id: 'one-question', text: 'This asks several questions at once; answers tend to cover some and skip others. Split it, or number the parts.' })
  if (/\b(feel|feelings|emotion|attitude|sentiment)\b/.test(t) && !/\b(enthusias|sceptic|skeptic|cautious|support|oppos|scale|label)\b/.test(t)) out.push({ id: 'labels', text: 'For feelings, give the words to choose from, so answers can be compared across interviews.', addition: 'Start with one overall label — supportive, cautiously supportive, mixed, sceptical or opposed — then explain.' })
  if (mine.length) {
    const notFound = mine.reduce((n, a) => n + a.evidence.filter((e) => e.match === 'not-found').length, 0)
    const all = mine.reduce((n, a) => n + a.evidence.length, 0)
    if (all && notFound / all > 0.1) out.push({ id: 'verbatim', text: `${tag}${notFound} of ${all} quotes were not found in the transcript. Insist on exact words from one turn.`, addition: 'Copy quotes exactly, from a single turn, without tidying them.' })
    const bare = mine.filter((a) => !a.notAddressed && a.evidence.length === 0).length
    if (bare) out.push({ id: 'unsupported', text: `${tag}${bare} answer${bare === 1 ? ' has' : 's have'} no evidence at all.` })
    const off = mine.filter((a) => a.rating === 'off' || a.rating === 'partly')
    for (const a of off) if (a.reviewNote.trim()) out.push({ id: `note-${a.id}`, text: `${fromParent ? `On v${prompt.version - 1}, you` : 'You'} noted: “${a.reviewNote.trim()}”` })
  }
  return out
}

export function newPrompt(partial: Partial<AskPrompt> & { title: string; text: string }): AskPrompt {
  return { id: uid(), version: 1, parentId: null, scope: 'all', maskNames: true, createdAt: now(), note: '', ...partial }
}

/** The chain of versions a question belongs to, oldest first. */
export function lineage(asks: AskPrompt[], id: string): AskPrompt[] {
  const byId = new Map(asks.map((a) => [a.id, a]))
  let root = byId.get(id)
  while (root?.parentId && byId.get(root.parentId)) root = byId.get(root.parentId)
  if (!root) return []
  const out: AskPrompt[] = []
  const walk = (p: AskPrompt) => { out.push(p); for (const c of asks.filter((a) => a.parentId === p.id).sort((a, b) => a.version - b.version)) walk(c) }
  walk(root)
  return out.sort((a, b) => a.version - b.version)
}

export const promptHash = (p: AskPrompt) => hash(p.text)
