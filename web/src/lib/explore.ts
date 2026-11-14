import type { Project } from './types'

/** Number of distinct spans where two codes overlap, for every code pair. */
export function cooccurrence(project: Project, sourceIds?: string[]) {
  const accepted = project.codings.filter((c) => c.status === 'accepted' && (!sourceIds || sourceIds.includes(c.sourceId)))
  const bySource = new Map<string, typeof accepted>()
  for (const c of accepted) {
    if (!bySource.has(c.sourceId)) bySource.set(c.sourceId, [])
    bySource.get(c.sourceId)!.push(c)
  }
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  for (const list of bySource.values()) {
    list.sort((a, b) => a.start - b.start)
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].start < list[i].end; j++) {
        const a = list[i], b = list[j]
        if (a.codeId === b.codeId) continue
        const [x, y] = a.codeId < b.codeId ? [a.codeId, b.codeId] : [b.codeId, a.codeId]
        const spanKey = `${x}|${y}|${a.sourceId}|${Math.max(a.start, b.start)}`
        if (seen.has(spanKey)) continue
        seen.add(spanKey)
        counts.set(`${x}|${y}`, (counts.get(`${x}|${y}`) ?? 0) + 1)
      }
    }
  }
  return counts
}

/** Distinct coded spans per code: the n in a c-coefficient. */
export function codeSpans(project: Project) {
  const seen = new Map<string, Set<string>>()
  for (const c of project.codings) if (c.status === 'accepted') {
    if (!seen.has(c.codeId)) seen.set(c.codeId, new Set())
    seen.get(c.codeId)!.add(`${c.sourceId}:${c.start}:${c.end}`)
  }
  return new Map([...seen].map(([k, v]) => [k, v.size]))
}

/**
 * ATLAS.ti's c-coefficient: shared passages over passages carrying either code,
 * n12 / (n1 + n2 - n12). 0 = never together, 1 = always together. It keeps
 * codes applied everywhere from dominating the way raw counts let them.
 */
export const cCoefficient = (n12: number, n1: number, n2: number) => (n1 + n2 - n12 > 0 ? n12 / (n1 + n2 - n12) : 0)

/** For every code pair, how many participants (sources) have at least one passage where the two overlap. */
export function cooccurrencePeople(project: Project) {
  const out = new Map<string, number>()
  for (const s of project.sources) for (const k of cooccurrence(project, [s.id]).keys()) out.set(k, (out.get(k) ?? 0) + 1)
  return out
}

const STOP = new Set(`a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just know like me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves um uh yeah okay ok mean sort kind really think going get got thing things lot also well right one two actually maybe something there's that's it's i'm we're they're don't can't you're i've we've gonna want say said see much way even still need make go
probably might whatever terms part able good different first time could would should may must many lots little bit pretty quite basically obviously certainly definitely absolutely exactly sure yes come comes coming came take takes taking took put puts look looking looks give gives given use used using new old big small great every anything everything nothing someone somebody anyone anybody everyone everybody already always never often sometimes else around back another other others whether though although however because since etc point points case cases fact example examples part parts side sides type types level levels area areas`.split(/\s+/))

/** Two-word phrases ("prince george", "lab space") in a set of passages, skipping pairs with a common word. */
export function topPhrases(texts: string[], n = 25) {
  const counts = new Map<string, number>()
  for (const t of texts) {
    for (const sentence of t.toLowerCase().split(/[.?!;:,()\n]+/)) {
      const ws = (sentence.match(/[\p{L}][\p{L}'’-]{1,}/gu) ?? []).map((w) => w.replace(/[’']s$/, ''))
      for (let i = 0; i + 1 < ws.length; i++) {
        const [a, b] = [ws[i], ws[i + 1]]
        if (STOP.has(a) || STOP.has(b) || a.length < 3 || b.length < 3 || a === b) continue
        const k = `${a} ${b}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
  }
  return [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n)
}

/** Most frequent content words in a set of passages, excluding a stop list. */
export function topTerms(texts: string[], n = 25) {
  const counts = new Map<string, number>()
  for (const t of texts) {
    for (const w of t.toLowerCase().match(/[\p{L}][\p{L}'’-]{2,}/gu) ?? []) {
      const word = w.replace(/[’']s$/, '')
      if (STOP.has(word) || word.length < 3) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n)
}
