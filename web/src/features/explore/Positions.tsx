import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { Project } from '../../lib/types'
import { buildPositions, VERDICT_HELP, VERDICT_LABEL, verdictOf, type Person, type PersonOnTheme, type Positions as Data, type ThemeRow, type Verdict } from '../../lib/positions'
import { Panel, Select, Swatch, cx } from '../../components/ui'
import { choiceColor } from './colors'

const short = (name: string) => name.trim().split(/\s{2,}/).join(' ')
const key = (name: string) => name.trim().split(/\s+/)[0]

/** One floating tooltip per chart, placed next to the mark under the pointer. */
export function useTip() {
  const box = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null)
  const show = (e: { currentTarget: Element }, body: ReactNode) => {
    const r = e.currentTarget.getBoundingClientRect()
    const o = box.current?.getBoundingClientRect()
    if (!o) return
    setTip({ x: r.left + r.width / 2 - o.left, y: r.top - o.top, body })
  }
  const layer = tip && (
    <div role="tooltip" className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg" style={{ left: Math.max(130, tip.x), top: tip.y - 6 }}>
      {tip.body}
    </div>
  )
  return { box, show, hide: () => setTip(null), layer }
}

/**
 * Where each participant stands on each theme, what kind of evidence they gave,
 * and whether groups of participants agree. The unit is the person, never the
 * passage, so someone who talked longer does not count for more.
 */
export function Positions({ project }: { project: Project }) {
  const data = useMemo(() => buildPositions(project), [project])
  if (!data.stanceCodes.length && !data.evidenceCodes.length) {
    return <Panel><p className="text-sm text-muted">These charts need a stance group or an evidence-grade group in the codebook.</p></Panel>
  }
  return (
    <div className="space-y-5">
      {data.stanceCodes.length > 0 && <StanceByTheme project={project} data={data} />}
      {data.stanceCodes.length > 0 && <GroupAgreement project={project} data={data} />}
      {data.evidenceCodes.length > 0 && <EvidenceByTheme project={project} data={data} />}
      {data.stanceCodes.length > 0 && <StanceThroughInterview project={project} data={data} />}
    </div>
  )
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const tone: Record<Verdict, string> = {
    agreement: 'border-line-strong bg-surface text-ink',
    partial: 'border-line-strong bg-surface text-ink',
    dissonance: 'border-ink bg-surface font-semibold text-ink',
    single: 'border-dashed border-line-strong text-muted',
    descriptive: 'border-dashed border-line-strong text-muted',
    silence: 'border-transparent text-faint',
  }
  return <span title={VERDICT_HELP[verdict]} className={cx('inline-block rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap', tone[verdict])}>{VERDICT_LABEL[verdict]}</span>
}

const pos = (i: number, n: number) => `${((i + 0.5) / n) * 100}%`

function Absent({ p }: { p: PersonOnTheme; linked?: boolean }) {
  return <span className="text-[10px] text-faint italic">{p.absent === 'not-asked' ? 'not asked' : 'not raised'}</span>
}

function StanceByTheme({ project, data }: { project: Project; data: Data }) {
  const { box, show, hide, layer } = useTip()
  const navigate = useNavigate()
  const n = data.stanceCodes.length
  const lane = data.people.length > 8 ? 'h-2.5' : 'h-4'
  const open = (row: ThemeRow, person: Person) => navigate({ to: '/p/$projectId/retrieve', params: { projectId: project.id }, search: { codes: row.codeIds.join(','), sources: person.sourceIds.join(',') } })
  const describe = (row: ThemeRow, p: PersonOnTheme) => (
    <>
      <div className="font-semibold">{p.person.label} · {row.title}</div>
      <div className="mt-1 text-muted">{p.claims.length} claim{p.claims.length === 1 ? '' : 's'}{p.stances.length < p.claims.length ? `, ${p.stances.length} with a stance` : ''}</div>
      {p.median !== null && <div className="mt-1">Middle position: <b>{short(data.stanceCodes[Math.round(p.median)].name)}</b></div>}
      {p.stances.length > 0 && <div className="mt-0.5 tabular-nums text-muted">{data.stanceCodes.map((c, i) => [key(c.name), p.stances.filter((x) => x === i).length] as const).filter(([, k]) => k).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>}
      {p.unchecked > 0 && <div className="mt-1 text-warn">{p.unchecked} AI-drafted, not yet checked by you</div>}
      <div className="mt-1 text-faint">Click to read the passages</div>
    </>
  )
  return (
    <Panel title="Where people stand, theme by theme" actions={<span className="text-xs text-muted">one row per participant · large dot = middle position · small dots = every step they used</span>}>
      <div ref={box} className="relative overflow-x-auto" onMouseLeave={hide}>
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-[13rem_1fr_9rem] items-end border-b border-line px-4 py-2 text-[11px] text-muted">
            <span>Theme</span>
            <div className="relative ml-10 h-8">
              {data.stanceCodes.map((c, i) => (
                <span key={c.id} className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center text-center leading-tight" style={{ left: pos(i, n) }}>
                  <span className="font-medium text-ink">{key(c.name)}</span>
                  <span className="max-w-[6rem] truncate">{short(c.name).replace(/^\S+\s+/, '').split(' / ')[0]}</span>
                </span>
              ))}
            </div>
            <span className="pl-3">Across people</span>
          </div>
          {data.rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[13rem_1fr_9rem] items-center border-b border-line px-4 py-2 last:border-0">
              <Link to="/p/$projectId/framework" params={{ projectId: project.id }} className="pr-3 text-sm leading-snug hover:text-accent" title="Open the framework">{row.title}</Link>
              <div className="space-y-0.5">
                {row.people.map((p) => (
                  <div key={p.person.id} className="grid grid-cols-[2.5rem_1fr] items-center">
                    <span className="truncate text-[10px] text-muted tabular-nums">{p.person.label}</span>
                    <div className={cx('relative', lane)}>
                      {/* Recessive guides at each step of the scale, with the neutral middle slightly shaded. */}
                      {data.stanceCodes.map((c, i) => <span key={c.id} aria-hidden className={cx('absolute inset-y-0 w-px', i === (n - 1) / 2 ? 'bg-line-strong' : 'bg-line')} style={{ left: pos(i, n) }} />)}
                      {p.claims.length === 0 ? <span className="absolute inset-y-0 left-1 flex items-center bg-surface pr-1"><Absent p={p} linked={data.guideLinked} /></span> : p.median === null ? (
                        <span className="absolute inset-y-0 left-1 flex items-center bg-surface pr-1 text-[10px] text-faint italic">{p.claims.length} claims, no stance</span>
                      ) : (
                        <>
                          {p.min !== p.max && <span aria-hidden className="absolute top-1/2 h-px -translate-y-1/2 bg-line-strong" style={{ left: pos(p.min!, n), width: `${((p.max! - p.min!) / n) * 100}%` }} />}
                          {/* Every step the person used, darker for more of their claims. */}
                          {data.stanceCodes.map((c, i) => {
                            const k = p.stances.filter((x) => x === i).length
                            return k > 0 && <span key={c.id} aria-hidden className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" style={{ left: pos(i, n), opacity: 0.25 + 0.6 * (k / p.stances.length) }} />
                          })}
                          <button
                            type="button"
                            aria-label={`${p.person.label} on ${row.title}: ${short(data.stanceCodes[Math.round(p.median)].name)}, ${p.claims.length} claims`}
                            onMouseEnter={(e) => show(e, describe(row, p))} onFocus={(e) => show(e, describe(row, p))} onBlur={hide}
                            onClick={() => open(row, p.person)}
                            className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                            style={{ left: `${((p.median + 0.5) / n) * 100}%` }}
                          >
                            <span
                              className="block size-2.5 rounded-full ring-2 ring-surface"
                              style={p.unchecked ? { border: `2px solid ${choiceColor('stance', Math.round(p.median), n)}`, background: 'var(--surface)' } : { background: choiceColor('stance', Math.round(p.median), n) }}
                            />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pl-3">
                <VerdictChip verdict={row.verdict} />
                <div className="mt-1 text-[11px] text-muted">{row.raised} of {row.people.length} raised it</div>
              </div>
            </div>
          ))}
        </div>
        {layer}
      </div>
      <Caveat>
        Each dot is one participant's middle position on the theme, as coded from what they said. It is not a measured attitude, and the spread is not a sample distribution.
        The label on the right is a suggestion (after Farmer et al.'s convergence coding): neutral or descriptive claims count as no position.
        {!data.guideLinked && ' Link guide questions to codes on the Guide screen to tell "not asked" apart from "not raised".'}
        {' '}A hollow dot includes AI-drafted claims you have not checked.
      </Caveat>
    </Panel>
  )
}

function attributesOf(project: Project, person: Person): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of person.sourceIds) Object.assign(out, project.sources.find((s) => s.id === id)?.attributes ?? {})
  Object.assign(out, project.cases.find((k) => k.id === person.id)?.attributes ?? {})
  return out
}

/** Convergence within and between groups of participants, for one attribute. */
function GroupAgreement({ project, data }: { project: Project; data: Data }) {
  const attrs = useMemo(() => new Map(data.people.map((p) => [p.id, attributesOf(project, p)])), [project, data.people])
  const choices = useMemo(() => {
    const names = [...new Set([...attrs.values()].flatMap((a) => Object.keys(a)))]
    // Worth grouping by: at least two values, and not one value per person (that is just the participant list again).
    return names.filter((name) => {
      const values = new Set([...attrs.values()].map((a) => a[name]?.trim()).filter(Boolean))
      return values.size >= 2 && values.size < data.people.length && !/\b(id|date|duration|min|status|reviewed|consent)\b/i.test(name)
    })
  }, [attrs, data.people.length])
  const [attr, setAttr] = useState('')
  const by = choices.includes(attr) ? attr : choices[0] ?? ''
  const { box, show, hide, layer } = useTip()
  const n = data.stanceCodes.length
  if (!by) return null
  const groups = new Map<string, Person[]>()
  for (const p of data.people) {
    const v = attrs.get(p.id)?.[by]?.trim() || 'Not recorded'
    groups.set(v, [...(groups.get(v) ?? []), p])
  }
  const cols = [...groups].sort((a, b) => (a[0] === 'Not recorded' ? 1 : b[0] === 'Not recorded' ? -1 : a[0].localeCompare(b[0])))
  const middle = (p: PersonOnTheme) => (p.claims.length ? p.median ?? (n - 1) / 2 : null)
  return (
    <Panel
      title="Do groups of participants agree?"
      actions={<label className="flex items-center gap-2 text-xs text-muted">Group by
        <Select value={by} onChange={(e) => setAttr(e.target.value)} className="h-7 text-xs" aria-label="Group participants by">{choices.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
      </label>}
    >
      <div ref={box} className="relative overflow-x-auto" onMouseLeave={hide}>
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="w-52 px-4 py-2 font-medium">Theme</th>
              {cols.map(([v, ps]) => <th key={v} className="border-l border-line px-3 py-2 font-medium">{v} <span className="font-normal text-faint">({ps.length} {ps.length === 1 ? 'person' : 'people'})</span></th>)}
              <th className="w-36 border-l border-line px-3 py-2 font-medium">Between groups</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const of = (ps: Person[]) => row.people.filter((p) => ps.some((q) => q.id === p.person.id))
              // Between groups: each group's middle position, so a large group counts once.
              const groupMiddles = cols.map(([, ps]) => {
                const ms = of(ps).map(middle).filter((m): m is number => m !== null)
                return ms.length ? ms.sort((a, b) => a - b)[Math.floor((ms.length - 1) / 2)] : null
              })
              const between = cols.length >= 2 ? verdictOf(groupMiddles, n) : 'silence'
              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <th className="px-4 py-2 text-left font-normal leading-snug">{row.title}</th>
                  {cols.map(([v, ps]) => {
                    const mine = of(ps)
                    const verdict = verdictOf(mine.map(middle), n)
                    return (
                      <td key={v} className="border-l border-line px-3 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <MiniScale n={n} people={mine} onHover={(e, p) => show(e, <><b>{p.person.label}</b> · {v}<div className="text-muted">{short(data.stanceCodes[Math.round(p.median!)].name)}, {p.claims.length} claims</div></>)} />
                          <span className="text-[11px] text-muted">{ps.length > 1 ? VERDICT_LABEL[verdict] : mine[0]?.claims.length ? 'one person' : 'not raised'}</span>
                        </div>
                      </td>
                    )
                  })}
                  <td className="border-l border-line px-3 py-2"><VerdictChip verdict={between} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {layer}
      </div>
      <Caveat>
        Agreement is judged from coded stance, not counts, and a group's position is its middle member's. A group of one or two people cannot show a group difference: read these as leads to check in the transcripts.
      </Caveat>
    </Panel>
  )
}

function MiniScale({ n, people, onHover }: { n: number; people: PersonOnTheme[]; onHover: (e: { currentTarget: Element }, p: PersonOnTheme) => void }) {
  const placed = people.filter((p) => p.median !== null)
  return (
    <div className="relative h-4 w-24 shrink-0" role="img" aria-label={placed.map((p) => `${p.person.label} at step ${Math.round(p.median!) + 1} of ${n}`).join(', ') || 'No positions'}>
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
      <span aria-hidden className="absolute top-0.5 bottom-0.5 w-px bg-line-strong" style={{ left: '50%' }} />
      {placed.map((p, i) => (
        <span
          key={p.person.id} onMouseEnter={(e) => onHover(e, p)}
          className="absolute size-2.5 -translate-x-1/2 rounded-full ring-2 ring-surface"
          style={{ left: `${((p.median! + 0.5) / n) * 100}%`, top: `${i % 2 ? 1 : 5}px`, background: choiceColor('stance', Math.round(p.median!), n) }}
        />
      ))}
    </div>
  )
}

/** Unit chart: one square per claim, by person, ordered strongest evidence first. */
function EvidenceByTheme({ project, data }: { project: Project; data: Data }) {
  const { box, show, hide, layer } = useTip()
  const navigate = useNavigate()
  const g = data.evidenceCodes
  const strongNames = g.slice(0, 2).map((c) => key(c.name)).join(' or ')
  return (
    <Panel title="What evidence sits behind each theme" actions={<span className="text-xs text-muted">one square per claim · strongest first</span>}>
      <div ref={box} className="relative overflow-x-auto" onMouseLeave={hide}>
        <table className="w-full min-w-[44rem] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="w-52 px-4 py-2 font-medium">Theme</th>
              {data.people.map((p) => <th key={p.id} className="border-l border-line px-3 py-2 font-medium">{p.label}</th>)}
              <th className="w-40 border-l border-line px-3 py-2 font-medium">People</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <th className="px-4 py-2 text-left font-normal leading-snug">{row.title}</th>
                {row.people.map((p) => {
                  const order = p.claims.map((c, i) => ({ c, g: p.grades[i] })).sort((a, b) => (a.g < 0 ? 99 : a.g) - (b.g < 0 ? 99 : b.g) || a.c.start - b.c.start)
                  return (
                    <td key={p.person.id} className="border-l border-line px-3 py-2 align-top">
                      {p.claims.length === 0 ? <Absent p={p} linked={data.guideLinked} /> : (
                        <div className="flex flex-wrap gap-0.5" role="list" aria-label={`${p.person.label}: ${p.claims.length} claims`}>
                          {order.map(({ c, g: grade }) => {
                            const text = project.sources.find((s) => s.id === c.sourceId)?.text.slice(c.start, c.end) ?? ''
                            const body = (
                              <>
                                <div className="font-semibold">{p.person.label} · {grade >= 0 ? short(g[grade].name) : 'No evidence grade'}</div>
                                <div className="mt-1 line-clamp-4 text-muted">“{text.length > 260 ? `${text.slice(0, 260)}…` : text}”</div>
                                {c.state === 'unchecked' && <div className="mt-1 text-warn">AI-drafted, not yet checked by you</div>}
                              </>
                            )
                            return (
                              <button
                                key={c.key} type="button" role="listitem"
                                aria-label={`${grade >= 0 ? short(g[grade].name) : 'Ungraded'}: ${text.slice(0, 80)}`}
                                onMouseEnter={(e) => show(e, body)} onFocus={(e) => show(e, body)} onBlur={hide}
                                onClick={() => navigate({ to: '/p/$projectId/code', params: { projectId: project.id }, search: { source: c.sourceId, at: c.start, end: c.end } })}
                                className="size-2.5 rounded-[2px] outline-offset-1"
                                style={{ background: grade >= 0 ? choiceColor('evidence', grade, g.length) : 'var(--line-strong)', opacity: c.state === 'unchecked' ? 0.45 : 1 }}
                              />
                            )
                          })}
                        </div>
                      )}
                    </td>
                  )
                })}
                <td className="border-l border-line px-3 py-2 text-xs text-muted">
                  <b className="text-ink">{row.raised} of {row.people.length}</b> people raised it{row.raised ? <><br /><b className="text-ink">{row.strong}</b> gave {strongNames} support</> : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {layer}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted">
        {g.map((c, i) => <span key={c.id} className="inline-flex items-center gap-1.5"><Swatch color={choiceColor('evidence', i, g.length)} />{short(c.name)}</span>)}
        <span className="inline-flex items-center gap-1.5"><Swatch color="var(--line-strong)" />No grade</span>
      </div>
      <Caveat>
        The grade is the kind of support the speaker gave (a document, firsthand experience, hearsay, opinion), not whether it is true. More squares means more passages, not more people: read the People column for people. Faded squares are AI-drafted claims you have not checked.
      </Caveat>
    </Panel>
  )
}

export function Caveat({ children }: { children: ReactNode }) {
  return <p className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-muted">{children}</p>
}

/**
 * Small multiples: one panel per participant, the interview's course on x
 * (how far through the transcript a claim starts) and stance on y. Shared
 * scales, so panels can be compared.
 */
function StanceThroughInterview({ project, data }: { project: Project; data: Data }) {
  const { box, show, hide, layer } = useTip()
  const navigate = useNavigate()
  const n = data.stanceCodes.length
  const stanceAt = new Map(data.stanceCodes.map((c, i) => [c.id, i]))
  const W = 320, H = 120, L = 26, R = 6, T = 6, B = 16
  const panels = data.people.map((person) => {
    const seen = new Set<string>()
    const points = data.rows.flatMap((r) => r.people.find((p) => p.person.id === person.id)?.claims ?? []).filter((c) => !seen.has(c.key) && seen.add(c.key)).flatMap((c) => {
      const st = c.codings.map((x) => stanceAt.get(x.codeId)).find((i) => i !== undefined)
      const len = project.sources.find((s) => s.id === c.sourceId)?.text.length || 1
      return st === undefined ? [] : [{ c, st, at: c.start / len, theme: data.rows.find((r) => r.codeIds.some((id) => c.codings.some((x) => x.codeId === id)))?.title ?? '' }]
    }).sort((a, b) => a.at - b.at)
    return { person, points }
  })
  const x = (at: number) => L + at * (W - L - R)
  const y = (st: number) => T + (st / Math.max(1, n - 1)) * (H - T - B)
  return (
    <Panel title="Stance through each interview" actions={<span className="text-xs text-muted">x = how far into the transcript · y = stance · dot = claim · line = running average</span>}>
      <div ref={box} className="relative grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2" onMouseLeave={hide}>
        {panels.map(({ person, points }) => (
          <figure key={person.id}>
            <figcaption className="mb-1 text-xs font-semibold">{person.label} <span className="font-normal text-muted">· {points.length} claims with a stance</span></figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${person.label}: stance of ${points.length} claims in interview order`}>
              {data.stanceCodes.map((c, i) => (
                <g key={c.id}>
                  <line x1={L} x2={W - R} y1={y(i)} y2={y(i)} stroke="var(--viz-grid)" strokeWidth={i === (n - 1) / 2 ? 1.5 : 1} />
                  <text x={L - 4} y={y(i) + 3} textAnchor="end" fontSize="8" fill="var(--muted)">{key(c.name)}</text>
                </g>
              ))}
              {['start', 'middle', 'end'].map((t, i) => <text key={t} x={x(i / 2)} y={H - 3} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="8" fill="var(--muted)">{t}</text>)}
              {points.length > 4 && <polyline fill="none" stroke="var(--ink)" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round" points={running(points.map((p) => p.st)).map((v, i) => `${x(points[i].at)},${y(v)}`).join(' ')} />}
              {points.map((p) => (
                <circle
                  key={p.c.key} cx={x(p.at)} cy={y(p.st)} r={2.8} fill={choiceColor('stance', p.st, n)} fillOpacity={0.85} stroke="var(--surface)" strokeWidth="0.75"
                  className="cursor-pointer"
                  onMouseEnter={(e) => show(e, <><div className="font-semibold">{person.label} · {short(data.stanceCodes[p.st].name)}</div><div className="text-muted">{p.theme}</div><div className="mt-1 line-clamp-3 text-muted">“{(project.sources.find((s) => s.id === p.c.sourceId)?.text.slice(p.c.start, p.c.end) ?? '').slice(0, 220)}”</div></>)}
                  onClick={() => navigate({ to: '/p/$projectId/code', params: { projectId: project.id }, search: { source: p.c.sourceId, at: p.c.start, end: p.c.end } })}
                />
              ))}
            </svg>
          </figure>
        ))}
        {layer}
      </div>
      <Caveat>
        The line averages the nearest {RUN} claims, so it shows drift rather than single remarks. The order follows the interview, and the interview follows the guide: a run of sceptical claims usually means the questions turned to barriers or risks, not that the person changed their mind.
      </Caveat>
    </Panel>
  )
}

const RUN = 15

/** Centred running mean over a window of RUN values (shorter at the ends). */
export function running(xs: number[], w = RUN): number[] {
  const h = Math.floor(w / 2)
  return xs.map((_, i) => {
    const part = xs.slice(Math.max(0, i - h), i + h + 1)
    return part.reduce((a, b) => a + b, 0) / part.length
  })
}
