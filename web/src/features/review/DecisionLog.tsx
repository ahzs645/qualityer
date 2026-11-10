import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { Project, ReviewAction } from '../../lib/types'
import { download, formatTime, indexBy, quotable, slug, timeAt, toCSV } from '../../lib/model'
import { summariseDecisions } from '../../lib/claims'
import { useProject } from '../../lib/store'
import { Badge, Button, Empty, Panel, Select, Stat, pct } from '../../components/ui'

const ACTION_LABEL: Record<ReviewAction, string> = {
  accept: 'Accepted', confirm: 'Confirmed', recode: 'Changed code', reject: 'Rejected', add: 'Added', remove: 'Removed',
  respan: 'Moved boundaries', restrict: 'Marked off the record', unrestrict: 'Cleared off the record',
}
const ACTION_TONE: Record<ReviewAction, 'good' | 'accent' | 'bad' | 'warn' | 'neutral'> = {
  accept: 'good', confirm: 'good', recode: 'accent', reject: 'bad', add: 'accent', remove: 'bad', respan: 'neutral', restrict: 'warn', unrestrict: 'neutral',
}

export function decisionLogCSV(project: Project) {
  const codes = indexBy(project.codes)
  const sources = indexBy(project.sources)
  const rows: (string | number)[][] = [['When', 'Reviewer', 'Decision', 'Source', 'Time', 'Code', 'Changed to', 'From AI', 'AI confidence', 'Previously accepted by', 'Note', 'Passage', 'Start', 'End']]
  for (const e of project.reviewLog) {
    const s = sources.get(e.sourceId)
    rows.push([
      e.at, e.by, ACTION_LABEL[e.action], s?.name ?? '', s ? formatTime(timeAt(s, e.start)) : '',
      e.codeId ? codes.get(e.codeId)?.name ?? '(deleted code)' : '', e.toCodeId ? codes.get(e.toCodeId)?.name ?? '(deleted code)' : '',
      e.ai ? 'yes' : '', e.confidence ?? '', e.priorReviewer ?? '', e.note ?? '', quotable(project, s, e.start, e.end), e.start, e.end,
    ])
  }
  return '﻿' + toCSV(rows)
}

export function DecisionLog() {
  const project = useProject()
  const [sourceId, setSourceId] = useState('')
  const [action, setAction] = useState('')
  const [limit, setLimit] = useState(150)
  const codes = useMemo(() => indexBy(project.codes), [project.codes])
  const sources = useMemo(() => indexBy(project.sources), [project.sources])
  const summary = useMemo(() => summariseDecisions(project, sourceId || undefined), [project.reviewLog, sourceId])
  const rows = useMemo(() => project.reviewLog.filter((e) => (!sourceId || e.sourceId === sourceId) && (!action || e.action === action)).reverse(), [project.reviewLog, sourceId, action])

  if (!project.reviewLog.length) {
    return <Panel><Empty title="No review decisions yet">Each time you accept, change or reject a coding it is recorded here, with what the AI proposed. Rejected suggestions are deleted from the coding, so this log is where they remain visible.</Empty></Panel>
  }
  const share = (n: number) => (summary.total ? pct(n / summary.total) : '—')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-8 max-w-64" aria-label="Source">
          <option value="">All sources</option>
          {project.sources.filter((s) => project.reviewLog.some((e) => e.sourceId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="h-8" aria-label="Decision">
          <option value="">All decisions</option>
          {(Object.keys(ACTION_LABEL) as ReviewAction[]).filter((a) => project.reviewLog.some((e) => e.action === a)).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
        </Select>
        <Button size="sm" className="ml-auto" icon={<Download size={13} />} onClick={() => download(`${slug(project.name)}-review-decisions.csv`, decisionLogCSV(project), 'text/csv')}>Decision log (CSV)</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="AI codings decided" value={summary.total} sub="counting the last decision on each" />
        <Stat label="Kept as proposed" value={share(summary.kept)} sub={`${summary.kept} codings`} tone="good" />
        <Stat label="Code changed" value={share(summary.recoded)} sub={`${summary.recoded} codings`} />
        <Stat label="Rejected" value={share(summary.rejected)} sub={`${summary.rejected} codings · ${summary.added} added by reviewers`} />
      </div>
      <Panel bodyClass="p-0" title={`${rows.length} decisions, newest first`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Decision</th><th className="px-2 py-2 font-medium">Code</th><th className="px-2 py-2 font-medium">Passage</th><th className="px-4 py-2 font-medium">By</th></tr></thead>
            <tbody>
              {rows.slice(0, limit).map((e) => {
                const s = sources.get(e.sourceId)
                return (
                  <tr key={e.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap"><Badge tone={ACTION_TONE[e.action]}>{ACTION_LABEL[e.action]}</Badge>{e.ai && <span className="ml-1.5 text-xs text-faint">AI</span>}</td>
                    <td className="max-w-64 px-2 py-2">
                      {e.codeId ? codes.get(e.codeId)?.name ?? '(deleted code)' : ''}
                      {e.toCodeId && <span className="text-muted"> → <span className="font-medium text-ink">{codes.get(e.toCodeId)?.name ?? '(deleted code)'}</span></span>}
                      {e.note && <div className="text-xs text-muted">{e.note}</div>}
                    </td>
                    <td className="max-w-md px-2 py-2">
                      <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: e.sourceId, at: e.start, end: e.end }} className="line-clamp-2 font-serif text-[13.5px] text-muted hover:text-accent">{quotable(project, s, e.start, e.end)}</Link>
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap text-muted">{e.by}<div className="text-faint">{new Date(e.at).toLocaleString()}</div>{e.priorReviewer && <div className="text-faint">after {e.priorReviewer}</div>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length > limit && <div className="border-t border-line p-3 text-center"><Button size="sm" variant="ghost" onClick={() => setLimit(limit + 300)}>Show more</Button></div>}
      </Panel>
    </div>
  )
}
