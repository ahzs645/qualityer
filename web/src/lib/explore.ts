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

const STOP = new Set(`a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just know like me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves um uh yeah okay ok mean sort kind really think going get got thing things lot also well right one two actually maybe something there's that's it's i'm we're they're don't can't you're i've we've gonna want say said see much way even still need make go`.split(/\s+/))

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
