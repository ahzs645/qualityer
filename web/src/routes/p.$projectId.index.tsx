import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { AlertTriangle, ArrowRight, ClipboardList, FileText, Lightbulb, SpellCheck, Sparkles } from 'lucide-react'
import { useProject } from '../lib/store'
import { checkRules, findCorrections, pendingSuggestions, saturation, sourceProgress } from '../lib/model'
import { Badge, Button, Empty, PageHeader, Panel, Progress, Stat, pct } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/')({ component: Overview })

function Overview() {
  const project = useProject()
  const pid = project.id
  const violations = useMemo(() => checkRules(project), [project])
  const suggestions = pendingSuggestions(project).length
  const openCandidates = project.candidates.filter((c) => c.status === 'open').length
  const glossaryHits = useMemo(
    () => project.sources.reduce((n, s) => n + findCorrections(s.text, project.glossary).length, 0),
    [project.sources, project.glossary],
  )
  const unmarked = project.guide.length
    ? project.sources.reduce(
        (n, s) => n + project.guide.filter((q) => !project.coverage.some((c) => c.sourceId === s.id && c.questionId === q.id && c.status !== 'unmarked')).length,
        0,
      )
    : 0
  const accepted = project.codings.filter((c) => c.status === 'accepted')
  const usedCodes = new Set(accepted.map((c) => c.codeId)).size
  const sat = useMemo(() => saturation(project), [project])
  const maxFresh = Math.max(1, ...sat.map((s) => s.fresh))

  const todo = [
    violations.length > 0 && { icon: AlertTriangle, tone: 'bad' as const, text: `${violations.length} codebook rule ${violations.length === 1 ? 'issue' : 'issues'}`, to: '/p/$projectId/review' as const, search: { tab: 'rules' } },
    suggestions > 0 && { icon: Sparkles, tone: 'accent' as const, text: `${suggestions} suggested ${suggestions === 1 ? 'coding' : 'codings'} to accept or reject`, to: '/p/$projectId/review' as const, search: { tab: 'suggestions' } },
    glossaryHits > 0 && { icon: SpellCheck, tone: 'warn' as const, text: `${glossaryHits} transcript corrections ready to apply`, to: '/p/$projectId/review' as const, search: { tab: 'transcript' } },
    unmarked > 0 && { icon: ClipboardList, tone: 'warn' as const, text: `${unmarked} guide questions not yet marked across sources`, to: '/p/$projectId/guide' as const, search: {} },
    openCandidates > 0 && { icon: Lightbulb, tone: 'accent' as const, text: `${openCandidates} candidate ${openCandidates === 1 ? 'code' : 'codes'} waiting for reconciliation`, to: '/p/$projectId/review' as const, search: { tab: 'candidates' } },
  ].filter(Boolean) as { icon: typeof AlertTriangle; tone: 'bad' | 'warn' | 'accent'; text: string; to: '/p/$projectId/review' | '/p/$projectId/guide'; search: Record<string, string> }[]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Overview"
        description={project.question ? <span className="text-ink">{project.question}</span> : <>No research question yet. <Link to="/p/$projectId/settings" params={{ projectId: pid }} className="text-accent underline">Add one</Link> so the analysis has a stated starting point.</>}
        actions={
          <Link to="/p/$projectId/code" params={{ projectId: pid }}><Button variant="primary" icon={<ArrowRight size={15} />}>Continue coding</Button></Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sources" value={project.sources.length} sub={`${project.sources.filter((s) => s.status === 'done').length} marked done`} />
        <Stat label="Codings" value={accepted.length} sub={`${usedCodes} of ${project.codes.length} codes used`} />
        <Stat label="Rule issues" value={violations.length} tone={violations.length ? 'bad' : 'good'} sub={project.rules.filter((r) => r.enabled).length + ' rules active'} />
        <Stat label="Awaiting decision" value={suggestions + openCandidates} tone={suggestions + openCandidates ? 'warn' : undefined} sub="suggestions and candidate codes" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Panel title="Sources" bodyClass="" actions={<Link to="/p/$projectId/sources" params={{ projectId: pid }} className="text-sm text-accent">Manage</Link>}>
          {project.sources.length === 0 ? (
            <Empty icon={<FileText size={26} />} title="No sources yet" action={<Link to="/p/$projectId/sources" params={{ projectId: pid }}><Button variant="primary">Add a transcript</Button></Link>}>
              Add interview transcripts to start reading and coding.
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="w-28 px-3 py-2 font-medium">Read</th>
                    <th className="w-28 px-3 py-2 font-medium">Coded</th>
                    <th className="px-3 py-2 text-right font-medium">Codings</th>
                    <th className="px-3 py-2 text-right font-medium">Guide</th>
                    <th className="px-4 py-2 text-right font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {project.sources.map((s) => {
                    const pr = sourceProgress(project, s)
                    const issues = violations.filter((v) => v.sourceId === s.id).length
                    return (
                      <tr key={s.id} className="border-b border-line last:border-0 hover:bg-sunken/50">
                        <td className="px-4 py-2.5">
                          <Link to="/p/$projectId/code" params={{ projectId: pid }} search={{ source: s.id }} className="font-medium hover:text-accent">{s.name}</Link>
                          <div className="text-xs text-muted capitalize">{s.status}</div>
                        </td>
                        <td className="px-3"><Progress value={pr.read} label="Read" /><span className="text-xs text-muted">{pct(pr.read)}</span></td>
                        <td className="px-3"><Progress value={pr.coded} tone="good" label="Coded" /><span className="text-xs text-muted">{pct(pr.coded)} of text</span></td>
                        <td className="px-3 text-right tabular-nums">{pr.codings}{pr.suggested ? <span className="text-muted"> +{pr.suggested}</span> : null}</td>
                        <td className="px-3 text-right tabular-nums">{project.guide.length ? `${pr.guideMarked}/${project.guide.length}` : '—'}</td>
                        <td className="px-4 text-right">{issues ? <Badge tone="bad">{issues}</Badge> : <Badge tone="good">0</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Needs attention" bodyClass="p-2">
            {todo.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">Nothing outstanding.</p>
            ) : (
              <ul>
                {todo.map((t) => (
                  <li key={t.text}>
                    <Link to={t.to} params={{ projectId: pid }} search={t.search as never} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-sunken">
                      <t.icon size={16} className={t.tone === 'bad' ? 'text-bad' : t.tone === 'warn' ? 'text-warn' : 'text-accent'} />
                      <span className="flex-1">{t.text}</span>
                      <ArrowRight size={14} className="text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {sat.length > 0 && (
            <Panel title="New codes per interview">
              <div className="flex h-32 items-end gap-2" role="img" aria-label="Bar chart of codes first used in each source">
                {sat.map((s) => (
                  <div key={s.source.id} className="flex flex-1 flex-col items-center gap-1" title={`${s.source.name}: ${s.fresh} new, ${s.used} used`}>
                    <span className="text-xs tabular-nums text-muted">{s.fresh}</span>
                    <div className="w-full max-w-10 rounded-t bg-accent" style={{ height: `${(s.fresh / maxFresh) * 72 + 2}px` }} />
                    <span className="max-w-full truncate text-[11px] text-muted">{s.source.attributes['Respondent ID']?.trim() || s.source.name.split(' — ')[0]}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Codes first applied in each source, in source order. A run of low bars suggests the codebook is stabilising — it is not, by itself, evidence of saturation.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
