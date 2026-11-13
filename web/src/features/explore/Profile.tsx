import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { Project } from '../../lib/types'
import { buildProfile, cellKey, type ProfileCell } from '../../lib/profile'
import { codesInGroup } from '../../lib/model'
import { Panel, Swatch, cx, pct } from '../../components/ui'
import { choiceColor } from './colors'

/**
 * Domains by cases. Each cell gives the number of coded claims and, as two
 * thin bars, how those claims were graded for evidence and what stance they
 * took, so a domain that rests on opinion in one interview and on firsthand
 * accounts in another is visible before the summaries are written.
 */
export function Profile({ project }: { project: Project }) {
  const profile = useMemo(() => buildProfile(project), [project])
  const [tip, setTip] = useState<string | null>(null)
  const max = Math.max(1, ...[...profile.cells.values()].map((c) => c.claims.length))
  if (!project.cases.length) return <Panel><p className="text-sm text-muted">Add sources to see how each case covers each domain.</p></Panel>

  const cell = (c: ProfileCell | undefined, caseName: string, rowName: string, codeIds: string[], sourceIds: string[], full = false) => {
    if (!c || !c.claims.length) return <td key={caseName} className="border-l border-line px-3 py-2 align-top text-xs text-faint">None coded</td>
    return (
      <td key={caseName} className="border-l border-line px-3 py-2 align-top">
        <div className="flex items-baseline gap-2">
          <Link
            to="/p/$projectId/retrieve" params={{ projectId: project.id }}
            search={{ codes: codeIds.join(',') || undefined, sources: sourceIds.join(',') || undefined }}
            className="text-base font-semibold tabular-nums hover:text-accent" title="Read these passages"
          >{c.claims.length}</Link>
          <span className="text-xs text-muted">claim{c.claims.length === 1 ? '' : 's'}</span>
          <span aria-hidden className="h-1 rounded-full" style={{ width: `${(c.claims.length / max) * 3.5}rem`, background: 'var(--viz-seq)' }} />
          {c.unchecked > 0 && <span className="ml-auto text-[11px] text-warn" title="Share of these claims drafted by AI and not yet checked by you">{pct(c.unchecked)} unchecked</span>}
        </div>
        {c.mixes.map((m) => (
          <div key={m.group.id} className={cx('mt-1.5 grid items-center gap-2', full ? 'grid-cols-[5.75rem_1fr]' : 'grid-cols-[0.75rem_1fr]')}>
            {/* The full group name in the "All domains" row; its letter (E, S) elsewhere, so the columns stay narrow. */}
            <span className="truncate text-[11px] text-faint" title={m.group.name}>{full ? m.group.name.replace(/^[A-Z]{1,2}\s+/, '') : m.group.name.match(/^[A-Z]{1,2}(?=\s)/)?.[0] ?? m.group.name[0]}</span>
            <div className="flex h-2.5 gap-0.5" role="img" aria-label={`${m.group.name}: ${m.parts.filter((p) => p.n).map((p) => `${p.code.name.trim().split(/\s{2,}/)[0]} ${p.n}`).join(', ')}`}>
              {m.parts.map((p, i) => p.n > 0 && (
                <span
                  key={p.code.id} className="h-full rounded-[2px]"
                  style={{ width: `${(p.n / Math.max(1, m.total)) * 100}%`, background: choiceColor(m.group.kind, i, m.parts.length) }}
                  onMouseEnter={() => setTip(`${caseName} · ${rowName} · ${p.code.name.replace(/\s{2,}/, ' ')}: ${p.n} of ${m.total} claims (${pct(p.n / m.total)})`)}
                />
              ))}
            </div>
          </div>
        ))}
      </td>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface" onMouseLeave={() => setTip(null)}>
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="w-40 px-4 py-2 font-medium">Domain</th>
              {project.cases.map((k) => <th key={k.id} className="border-l border-line px-3 py-2 font-medium">{k.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line bg-sunken/50">
              <th className="px-4 py-2 text-left font-semibold">All domains</th>
              {project.cases.map((k) => cell(profile.totals.get(k.id), k.name, 'All domains', [], k.sourceIds, true))}
            </tr>
            {profile.rows.map((g) => (
              <tr key={g.id} className="border-b border-line last:border-0">
                <th className="px-4 py-2 text-left font-normal"><span className="flex items-center gap-2"><Swatch color={g.color} />{g.name}</span></th>
                {project.cases.map((k) => cell(profile.cells.get(cellKey(k.id, g.id)), k.name, g.name, codesInGroup(project, g.id).map((c) => c.id), k.sourceIds))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="min-h-5 text-xs text-muted" role="status">{tip ?? 'Point at a bar segment for its count. Click a number to read the passages.'}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-xs text-muted">
        {profile.choice.map((g) => (
          <span key={g.id} className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1"><span className="font-medium text-ink">{g.name}</span>
            {project.codes.filter((c) => c.groupId === g.id).map((c, i, all) => <span key={c.id} className="inline-flex items-center gap-1"><Swatch color={choiceColor(g.kind, i, all.length)} />{c.name.replace(/\s{2,}/, ' ')}</span>)}
          </span>
        ))}
      </div>
    </div>
  )
}
