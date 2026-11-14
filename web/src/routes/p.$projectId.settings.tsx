import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Camera, Download, RotateCcw, Trash2 } from 'lucide-react'
import type { Snapshot } from '../lib/types'
import { closeProject, restoreSnapshot, snapshot, useProject } from '../lib/store'
import { deleteProject, deleteSnapshot, listSnapshots } from '../lib/storage'
import { coders, download, slug } from '../lib/model'
import { mergeCoderFile, setProject } from '../lib/actions'
import { migrate } from '../lib/migrate'
import { reviewerWork, reviewers, takeOverReview } from '../lib/review'
import { Button, Field, IconButton, Input, PageHeader, Panel, Textarea } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/settings')({ component: Settings })

function Settings() {
  const project = useProject()
  const [zipping, setZipping] = useState<string | null>(null)
  const navigate = useNavigate()
  const [snaps, setSnaps] = useState<Omit<Snapshot, 'data'>[]>([])
  const [label, setLabel] = useState('')
  const [mergeMsg, setMergeMsg] = useState<string | null>(null)
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

        <HandOver />

        <Panel title="Team">
          <p className="text-sm text-muted">
            Coding as a team without a server: each person codes their own copy under their own coder name, exports “Whole study (JSON)”, and one person merges the copies here. Use <span className="font-medium text-ink">Only my coding</span> in the Code view to code blind, then compare under Review → Agreement and settle differences together.
          </p>
          <label className="mt-3 inline-flex">
            <span className="inline-flex h-8.5 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-sunken">Merge a colleague's copy…</span>
            <input type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const other = migrate(JSON.parse(await f.text()))
                const r = await mergeCoderFile(other)
                setMergeMsg(`Merged ${r.codings} codings${r.coders.length ? ` by ${r.coders.join(', ')}` : ''}, ${r.memos} memos, ${r.candidates} candidate codes${r.codes ? `, ${r.codes} new codes` : ''}.${r.skippedSources.length ? ` Skipped sources whose text differs: ${r.skippedSources.join(', ')}.` : ''}`)
              } catch (err) { setMergeMsg(err instanceof Error ? err.message : String(err)) }
            }} />
          </label>
          {mergeMsg && <p className="mt-2 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">{mergeMsg}</p>}
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
            {project.sources.some((s) => s.media) && (
              <Button icon={<Download size={15} />} disabled={!!zipping} onClick={async () => {
                setZipping('Packing the study and its recordings…')
                try {
                  const { exportStudyZip } = await import('../lib/bundle')
                  const { bytes, recordings, missing } = await exportStudyZip(project)
                  download(`${slug(project.name)}.research-weave.zip`, bytes as BlobPart, 'application/zip')
                  setZipping(`${recordings} recording${recordings === 1 ? '' : 's'} included${missing.length ? `; not found in this browser: ${missing.join(', ')}` : ''}.`)
                } catch (e) { setZipping(e instanceof Error ? e.message : String(e)) }
              }} title="The study and every attached recording, to move to another browser or keep as a backup">Whole study with recordings (.zip)</Button>
            )}
            <Button icon={<Download size={15} />} onClick={async () => {
              const { exportQDPX } = await import('../lib/refi')
              download(`${slug(project.name)}.qdpx`, exportQDPX(project) as BlobPart, 'application/zip')
            }} title="For NVivo, ATLAS.ti, MAXQDA, QualCoder and other REFI-QDA tools">REFI-QDA project (.qdpx)</Button>
          </div>
          {zipping && <p className="mt-2 text-xs text-accent">{zipping}</p>}
          <p className="mt-2 text-xs text-muted">The JSON file re-imports into Research Weave on any browser, without recordings; the .zip carries the recordings too. The .qdpx carries sources, codes, codings, cases, attributes and memos to other QDA software (recordings are not included). Codebook (CSV, REFI-QDA) is exported from the Codebook page, coded passages from Retrieve, and the matrix from Framework.</p>
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

/** Taking over another reviewer's work: re-check it claim by claim, or endorse it in one step. */
function HandOver() {
  const project = useProject()
  const names = reviewers(project)
  const [from, setFrom] = useState(names[0] ?? '')
  const [to, setTo] = useState('')
  const [done, setDone] = useState<string | null>(null)
  if (!names.length) return null
  const work = reviewerWork(project, from)
  const target = to.trim()
  const ok = !!target && target !== from
  return (
    <Panel title="Hand over review">
      <p className="text-sm text-muted">Take over the review an assistant or a colleague did. The decision log keeps who decided what first; reports name the reviewer now responsible.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="From">{(id) => (
          <select id={id} value={from} onChange={(e) => setFrom(e.target.value)} className="h-8.5 w-full rounded-md border border-line-strong bg-surface px-2 text-sm">
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}</Field>
        <Field label="To">{(id) => <Input id={id} value={to} onChange={(e) => setTo(e.target.value)} placeholder="Your name" />}</Field>
      </div>
      <p className="mt-2 text-xs text-muted">
        {from}: {work.claims} claims checked ({work.codings} AI codings), {work.decisions} logged decisions, {work.summaries} framework summaries carrying their check note{work.signedOff ? ', and the current sign-off' : ''}.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-line p-3">
          <div className="text-sm font-semibold">Re-check it myself</div>
          <p className="mt-1 text-xs text-muted">Every claim {from} checked goes back to “accepted, not checked by you” in Review → AI review. Your confirmations, changes and rejections are logged under your name as you go. Recommended.</p>
          <Button size="sm" variant="primary" className="mt-2" disabled={!ok} onClick={async () => {
            if (!confirm(`Make ${target} the reviewer and put ${work.claims} claims back in the queue?${work.signedOff ? ' The current sign-off is withdrawn.' : ''}`)) return
            await takeOverReview(from, target, 'recheck'); setDone(`${target} is now the reviewer. ${work.claims} claims are waiting in Review → AI review.`)
          }}>Re-check as {target || '…'}</Button>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="text-sm font-semibold">Endorse it in one step</div>
          <p className="mt-1 text-xs text-muted">You take {from}'s decisions on as yours. Each is recorded as endorsed by you, first made by {from}; framework check notes add your endorsement. Only do this if you have read the work.</p>
          <Button size="sm" className="mt-2" disabled={!ok} onClick={async () => {
            if (!confirm(`Endorse all of ${from}'s review as ${target}? Each of the ${work.codings} codings is logged as endorsed by ${target}, first checked by ${from}.${work.signedOff ? ' The current sign-off is withdrawn; sign off yourself on the Report screen.' : ''}`)) return
            await takeOverReview(from, target, 'endorse'); setDone(`${target} has endorsed ${from}'s review. Sign off on the Report screen when ready.`)
          }}>Endorse as {target || '…'}</Button>
        </div>
      </div>
      {done && <p className="mt-3 rounded-md bg-good-soft px-3 py-2 text-sm text-good">{done}</p>}
    </Panel>
  )
}
