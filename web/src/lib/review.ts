import type { Coding, Project, ReviewAction, ReviewEvent } from './types'
import { comparisonRuns, groupOf, indexBy, now, uid } from './model'
import { update } from './store'

// Reviewer decisions on claims. Every decision is appended to the project's
// review log, so the study keeps what the AI proposed and what a person did
// with it even after a rejected suggestion is deleted.

interface Span { start: number; end: number }

export function reviewEvent(p: Project, action: ReviewAction, c: Pick<Coding, 'sourceId' | 'start' | 'end'> & Partial<Coding>, extra: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    id: uid(), at: now(), by: p.coder, action, sourceId: c.sourceId, start: c.start, end: c.end,
    codingId: c.id ?? null, codeId: c.codeId ?? null, ai: !!c.origin, runId: c.origin?.runId ?? null,
    confidence: c.confidence ?? null,
    priorReviewer: c.status === 'accepted' && c.reviewedBy && c.reviewedBy !== p.coder ? c.reviewedBy : null,
    ...extra,
  }
}

/** Codings on the passage that review acts on: everything except parked comparison suggestions. */
function onSpan(p: Project, sourceId: string, s: Span) {
  const skip = comparisonRuns(p)
  return (c: Coding) => c.sourceId === sourceId && c.start === s.start && c.end === s.end &&
    !(c.status === 'suggested' && c.origin && skip.has(c.origin.runId))
}

const signedOff = (c: Coding, reviewer: string): Coding =>
  c.origin ? { ...c, status: 'accepted', reviewedBy: reviewer } : { ...c, status: 'accepted', coder: reviewer, reviewedBy: reviewer }

/** Accepts every suggestion on the passage and records the reviewer's sign-off on AI codings accepted by someone else. */
export function confirmClaim(sourceId: string, span: Span, note?: string) {
  update('confirm claim', (p) => {
    const hit = onSpan(p, sourceId, span)
    const log: ReviewEvent[] = []
    const codings = p.codings.map((c) => {
      if (!hit(c)) return c
      if (c.status === 'suggested') { log.push(reviewEvent(p, 'accept', c, { note })); return signedOff(c, p.coder) }
      if (c.origin && c.reviewedBy !== p.coder) { log.push(reviewEvent(p, 'confirm', c, { note })); return { ...c, reviewedBy: p.coder } }
      return c
    })
    return log.length ? { ...p, codings, reviewLog: [...p.reviewLog, ...log] } : p
  })
}

/** Removes every AI coding on the passage. Codings a person made stay. */
export function rejectClaim(sourceId: string, span: Span, note?: string) {
  update('reject claim', (p) => {
    const hit = onSpan(p, sourceId, span)
    const gone = p.codings.filter((c) => hit(c) && (c.origin || c.status === 'suggested'))
    if (!gone.length) return p
    const ids = new Set(gone.map((c) => c.id))
    return {
      ...p,
      codings: p.codings.filter((c) => !ids.has(c.id)),
      extractions: p.extractions.filter((e) => !ids.has(e.codingId)),
      reviewLog: [...p.reviewLog, ...gone.map((c) => reviewEvent(p, 'reject', c, { note }))],
    }
  })
}

/**
 * Sets the passage's single value in a choice group (evidence grade, stance).
 * An existing coding in the group is changed in place and becomes the
 * reviewer's; with none, a new one is added.
 */
export function chooseInGroup(sourceId: string, span: Span, groupId: string, codeId: string) {
  update('set grade or stance', (p) => {
    const codes = indexBy(p.codes)
    const groups = indexBy(p.groups)
    const hit = onSpan(p, sourceId, span)
    const cur = p.codings.filter((c) => hit(c) && groupOf(codes.get(c.codeId), codes, groups)?.id === groupId)
    if (!cur.length) {
      const add: Coding = { id: uid(), sourceId, codeId, start: span.start, end: span.end, coder: p.coder, memo: '', important: false, status: 'accepted', createdAt: now(), reviewedBy: p.coder }
      return { ...p, codings: [...p.codings, add], reviewLog: [...p.reviewLog, reviewEvent(p, 'add', add)] }
    }
    const keep = cur.find((c) => c.codeId === codeId) ?? cur[0]
    const extra = new Set(cur.filter((c) => c !== keep).map((c) => c.id))
    if (keep.codeId === codeId && !extra.size && keep.status === 'accepted') return p
    const log: ReviewEvent[] = []
    const codings = p.codings.filter((c) => {
      if (!extra.has(c.id)) return true
      log.push(reviewEvent(p, c.origin ? 'reject' : 'remove', c))
      return false
    }).map((c) => {
      if (c.id !== keep.id) return c
      if (c.codeId === codeId) { log.push(reviewEvent(p, 'accept', c)); return signedOff(c, p.coder) }
      log.push(reviewEvent(p, 'recode', c, { toCodeId: codeId }))
      return { ...c, codeId, status: 'accepted' as const, coder: p.coder, reviewedBy: p.coder }
    })
    return { ...p, codings, reviewLog: [...p.reviewLog, ...log] }
  })
}

/** Changes one coding's code. The coding becomes the reviewer's; the log keeps what was proposed. */
export function recodeCoding(id: string, codeId: string, note?: string) {
  update('change code', (p) => {
    const c = p.codings.find((x) => x.id === id)
    if (!c || c.codeId === codeId) return p
    return {
      ...p,
      codings: p.codings.map((x) => (x.id === id ? { ...x, codeId, status: 'accepted' as const, coder: p.coder, reviewedBy: p.coder } : x)),
      reviewLog: [...p.reviewLog, reviewEvent(p, 'recode', c, { toCodeId: codeId, note })],
    }
  })
}

export function removeReviewed(id: string, note?: string) {
  update('remove code from claim', (p) => {
    const c = p.codings.find((x) => x.id === id)
    if (!c) return p
    return {
      ...p,
      codings: p.codings.filter((x) => x.id !== id),
      extractions: p.extractions.filter((e) => e.codingId !== id),
      reviewLog: [...p.reviewLog, reviewEvent(p, c.origin ? 'reject' : 'remove', c, { note })],
    }
  })
}

export function addToClaim(sourceId: string, span: Span, codeId: string) {
  update('add code to claim', (p) => {
    const hit = onSpan(p, sourceId, span)
    if (p.codings.some((c) => hit(c) && c.codeId === codeId)) return p
    const add: Coding = { id: uid(), sourceId, codeId, start: span.start, end: span.end, coder: p.coder, memo: '', important: false, status: 'accepted', createdAt: now(), reviewedBy: p.coder }
    return { ...p, codings: [...p.codings, add], reviewLog: [...p.reviewLog, reviewEvent(p, 'add', add)] }
  })
}

/** Moves the passage's boundaries, taking its codings and any off-the-record mark with it. */
export function respanClaim(sourceId: string, from: Span, to: Span) {
  if (to.end <= to.start || (from.start === to.start && from.end === to.end)) return
  update('adjust passage', (p) => {
    const hit = onSpan(p, sourceId, from)
    if (!p.codings.some(hit)) return p
    return {
      ...p,
      codings: p.codings.map((c) => (hit(c) ? { ...c, start: to.start, end: to.end } : c)),
      restricted: p.restricted.map((r) => (r.sourceId === sourceId && r.start === from.start && r.end === from.end ? { ...r, ...to } : r)),
      reviewLog: [...p.reviewLog, reviewEvent(p, 'respan', { sourceId, ...to }, { ai: p.codings.some((c) => hit(c) && c.origin), note: `${from.start}–${from.end} → ${to.start}–${to.end}` })],
    }
  })
}

/** One note per claim, stored on each of its codings (the convention QualCoder imports follow). */
export function setClaimNote(sourceId: string, span: Span, memo: string) {
  update('edit claim note', (p) => {
    const hit = onSpan(p, sourceId, span)
    if (!p.codings.some((c) => hit(c) && c.memo !== memo)) return p
    return { ...p, codings: p.codings.map((c) => (hit(c) ? { ...c, memo } : c)) }
  })
}

/** Marks a passage as off the record (or clears the mark). Its wording is then withheld from reports and exports. */
export function setRestricted(sourceId: string, span: Span, reason: string | null) {
  update(reason == null ? 'clear off-the-record mark' : 'mark off the record', (p) => {
    const same = (r: { sourceId: string; start: number; end: number }) => r.sourceId === sourceId && r.start === span.start && r.end === span.end
    const cur = p.restricted.find(same)
    if (reason == null) {
      if (!cur) return p
      return { ...p, restricted: p.restricted.filter((r) => r !== cur), reviewLog: [...p.reviewLog, reviewEvent(p, 'unrestrict', { sourceId, ...span })] }
    }
    if (cur) return cur.reason === reason ? p : { ...p, restricted: p.restricted.map((r) => (r === cur ? { ...r, reason } : r)) }
    return {
      ...p,
      restricted: [...p.restricted, { id: uid(), sourceId, start: span.start, end: span.end, reason, by: p.coder, at: now() }],
      reviewLog: [...p.reviewLog, reviewEvent(p, 'restrict', { sourceId, ...span }, { note: reason })],
    }
  })
}

/**
 * Takes one passage from a comparison-only pass into the coding: every
 * suggestion that pass made on it is accepted and signed off, and can then be
 * adjusted like any other AI-coded claim.
 */
export function adoptClaim(sourceId: string, span: Span, runId: string) {
  update('adopt AI claim', (p) => {
    const hit = (c: Coding) => c.sourceId === sourceId && c.start === span.start && c.end === span.end && c.origin?.runId === runId && c.status === 'suggested'
    const log = p.codings.filter(hit).map((c) => reviewEvent(p, 'accept', c, { note: 'Adopted from a comparison-only pass' }))
    if (!log.length) return p
    return { ...p, codings: p.codings.map((c) => (hit(c) ? signedOff(c, p.coder) : c)), reviewLog: [...p.reviewLog, ...log] }
  })
}

/** Keeps an AI pass for comparison only (or returns it to the review queue). */
export function setComparisonOnly(runId: string, comparisonOnly: boolean) {
  update(comparisonOnly ? 'keep pass for comparison only' : 'return pass to review', (p) => ({
    ...p, aiRuns: p.aiRuns.map((r) => (r.id === runId ? { ...r, comparisonOnly } : r)),
  }))
}
