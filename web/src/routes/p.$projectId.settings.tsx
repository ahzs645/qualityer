import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Camera, Download, RotateCcw, Trash2 } from 'lucide-react'
import type { Snapshot } from '../lib/types'
import { closeProject, restoreSnapshot, snapshot, useProject } from '../lib/store'
import { deleteProject, deleteSnapshot, listSnapshots } from '../lib/storage'
import { coders, download, slug } from '../lib/model'
import { setProject } from '../lib/actions'
import { Button, Field, IconButton, Input, PageHeader, Panel, Textarea } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/settings')({ component: Settings })

function Settings() {
  const project = useProject()
  const navigate = useNavigate()
  const [snaps, setSnaps] = useState<Omit<Snapshot, 'data'>[]>([])
  const [label, setLabel] = useState('')
  const refresh = () => listSnapshots(project.id).then(setSnaps)
  useEffect(() => { void refresh() }, [project.id, project.updatedAt])

  const blur = (k: 'name' | 'question' | 'method' | 'coder') => (e: { target: { value: string } }) => {
    const v = e.target.value.trim()
    if (v !== project[k] && (k !== 'name' || v) && (k !== 'coder' || v)) setProject(`edit ${k}`, { [k]: v })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader title="Settings & export" />
      <div className="space-y-5">
        <Panel title="Study">
          <div className="space-y-3">
            <Field label="Name">{(id) => <Input id={id} defaultValue={project.name} onBlur={blur('name')} />}</Field>
            <Field label="Research question">{(id) => <Textarea id={id} rows={2} defaultValue={project.question} onBlur={blur('question')} />}</Field>
            <Field label="Method and scope" hint="E.g. Framework Method, deductive codebook v1.1 with inductive additions; calibration interview coded by two researchers.">
              {(id) => <Textarea id={id} rows={3} defaultValue={project.method} onBlur={blur('method')} />}
            </Field>
          </div>
        </Panel>

        <Panel title="You">
          <Field label="Coder name" hint={`New codings are attributed to this name. Coders in this project: ${coders(project).join(', ') || 'none yet'}. Use a different name on a second pass to measure agreement.`}>
            {(id) => <Input id={id} defaultValue={project.coder} onBlur={blur('coder')} className="max-w-xs" list="coder-names" />}
          </Field>
          <datalist id="coder-names">{coders(project).map((c) => <option key={c} value={c} />)}</datalist>
        </Panel>

        <Panel title="Snapshots" bodyClass="p-0">
          <p className="border-b border-line px-4 py-2 text-xs text-muted">Named copies of the whole study, kept in this browser. One is taken automatically before bulk changes (applying corrections, merging codes, restoring).</p>
          <form className="flex gap-2 border-b border-line p-3" onSubmit={async (e) => { e.preventDefault(); await snapshot(label.trim() || 'Manual snapshot'); setLabel(''); void refresh() }}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Before reconciliation meeting" />
            <Button type="submit" icon={<Camera size={14} />}>Take snapshot</Button>
          </form>
          {snaps.length === 0 ? <p className="px-4 py-3 text-sm text-muted">No snapshots yet.</p> : (
            <ul className="divide-y divide-line">
              {snaps.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted">{new Date(s.createdAt).toLocaleString()}</div>
                  </div>
                  <Button size="sm" icon={<RotateCcw size={13} />} onClick={async () => {
                    if (!confirm(`Restore “${s.label}”? The current state is snapshotted first.`)) return
                    await restoreSnapshot(s.id); void refresh()
                  }}>Restore</Button>
                  <IconButton label="Delete snapshot" onClick={async () => { await deleteSnapshot(s.id); void refresh() }}><Trash2 size={14} /></IconButton>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Export">
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download size={15} />} onClick={() => download(`${slug(project.name)}.research-weave.json`, JSON.stringify(project), 'application/json')}>Whole study (JSON)</Button>
            <Button icon={<Download size={15} />} onClick={async () => {
              const { exportQDPX } = await import('../lib/refi')
              download(`${slug(project.name)}.qdpx`, exportQDPX(project) as BlobPart, 'application/zip')
            }} title="For NVivo, ATLAS.ti, MAXQDA, QualCoder and other REFI-QDA tools">REFI-QDA project (.qdpx)</Button>
          </div>
          <p className="mt-2 text-xs text-muted">The JSON file re-imports into Research Weave on any browser. The .qdpx carries sources, codes, codings, cases, attributes and memos to other QDA software (recordings are not included). Codebook (CSV, REFI-QDA) is exported from the Codebook page, coded passages from Retrieve, and the matrix from Framework.</p>
        </Panel>

        {project.importNotes.length > 0 && (
          <Panel title="Import notes">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{project.importNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </Panel>
        )}

        <Panel title="Danger zone">
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => {
            if (!confirm(`Delete “${project.name}” and all its snapshots from this browser? Export first if you need a copy. This can't be undone.`)) return
            const id = project.id
            closeProject()
            await deleteProject(id)
            await navigate({ to: '/' })
          }}>Delete this study</Button>
        </Panel>
      </div>
    </div>
  )
}
