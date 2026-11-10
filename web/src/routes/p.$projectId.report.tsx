import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useProject } from '../lib/store'
import { download, slug } from '../lib/model'
import { DEFAULT_REPORT, REPORT_SECTIONS, claimsCSV, reportHTML, reportMarkdown, type ReportOptions } from '../lib/report'
import { decisionLogCSV } from '../features/review/DecisionLog'
import { Button, PageHeader, Panel } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/report')({ component: Report })

function Report() {
  const project = useProject()
  const [opts, setOpts] = useState<ReportOptions>(DEFAULT_REPORT)
  const frame = useRef<HTMLIFrameElement>(null)
  const html = useMemo(() => reportHTML(project, opts), [project, opts])
  const base = slug(project.name)

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Report"
        description="The study as one document: coverage, the framework matrix with its quotes, how each case covers each domain, what the AI did and what review changed, and what is still open. Wording from passages marked off the record is withheld."
        actions={<>
          <Button icon={<Printer size={15} />} onClick={() => frame.current?.contentWindow?.print()}>Print or save as PDF</Button>
          <Button variant="primary" icon={<Download size={15} />} onClick={() => download(`${base}-report.html`, html, 'text/html')}>Download report</Button>
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-4">
          <Panel title="Sections">
            <ul className="space-y-1.5">
              {REPORT_SECTIONS.map(([id, label]) => (
                <li key={id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opts[id]} onChange={(e) => setOpts({ ...opts, [id]: e.target.checked })} />{label}</label></li>
              ))}
            </ul>
          </Panel>
          <Panel title="Other formats">
            <div className="flex flex-col items-start gap-2">
              <Button size="sm" icon={<Download size={13} />} onClick={() => download(`${base}-report.md`, reportMarkdown(project, opts), 'text/markdown')}>Report as Markdown</Button>
              <Button size="sm" icon={<Download size={13} />} onClick={() => download(`${base}-claims.csv`, claimsCSV(project), 'text/csv')}>Claims table (CSV)</Button>
              <Button size="sm" icon={<Download size={13} />} disabled={!project.reviewLog.length} onClick={() => download(`${base}-review-decisions.csv`, decisionLogCSV(project), 'text/csv')}>Review decisions (CSV)</Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              The claims table has one row per coded passage, with its codes, evidence grade, stance, review state and note. The framework matrix exports from <Link to="/p/$projectId/framework" params={{ projectId: project.id }} className="text-accent hover:underline">Framework</Link>, coded passages from <Link to="/p/$projectId/retrieve" params={{ projectId: project.id }} className="text-accent hover:underline">Retrieve</Link>, and the whole study from <Link to="/p/$projectId/settings" params={{ projectId: project.id }} className="text-accent hover:underline">Settings</Link>.
            </p>
          </Panel>
        </aside>
        <iframe ref={frame} title="Report preview" srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-[calc(100vh-11rem)] w-full rounded-lg border border-line bg-white" />
      </div>
    </div>
  )
}
