import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { FileUp, FolderOpen, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { ProjectSummary } from '../lib/types'
import { deleteProject, listProjects } from '../lib/storage'
import { createProject } from '../lib/store'
import { emptyProject } from '../lib/model'
import { demoProject } from '../lib/demo'
import { importProjectFile } from '../lib/importers'
import { Badge, Button, Dialog, Empty, Field, IconButton, Input } from '../components/ui'
import { Logo } from '../components/Logo'

export const Route = createFileRoute('/')({
  component: Projects,
})

function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => listProjects().then(setProjects).catch((e) => setError(String(e)))
  useEffect(() => { void refresh() }, [])

  const open = (id: string) => navigate({ to: '/p/$projectId', params: { projectId: id } })

  async function onImport(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(`Reading ${file.name}…`)
    setError(null)
    try {
      const { project } = await importProjectFile(file)
      await createProject(project)
      await open(project.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <span className="hidden text-xs text-muted sm:block">Projects are stored in this browser. Export to keep a copy.</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your studies</h1>
            <p className="mt-1 text-sm text-muted">Code interview transcripts against a codebook, check coverage of your guide, and build a framework matrix.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()}>Import</Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>New study</Button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".qda,.zip,.json,.sqlite,.db,.md"
          onChange={(e) => onImport(e.target.files)}
        />

        {busy && <p className="mb-4 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">{busy}</p>}
        {error && <p role="alert" className="mb-4 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

        {projects === null ? null : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface">
            <Empty
              icon={<FolderOpen size={28} />}
              title="No studies yet"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button icon={<Sparkles size={15} />} onClick={async () => { const p = demoProject(); await createProject(p); await open(p.id) }}>Open the demo study</Button>
                  <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>New study</Button>
                </div>
              }
            >
              Start a study, or import a QualCoder project (<code>.qda</code> folder zipped, or its <code>data.qda</code>) or a Research Weave export.
            </Empty>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {projects.map((p) => (
              <li key={p.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(p.id)}>
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span>{p.sources} {p.sources === 1 ? 'source' : 'sources'}</span>
                    <span>{p.codings} codings</span>
                    <span>Edited {new Date(p.updatedAt).toLocaleString()}</span>
                  </div>
                </button>
                <IconButton
                  label={`Delete ${p.name}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                  onClick={async () => {
                    if (!confirm(`Delete “${p.name}” and its snapshots from this browser? This can't be undone.`)) return
                    await deleteProject(p.id)
                    void refresh()
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        {projects && projects.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Want to look around first?{' '}
            <button type="button" className="text-accent underline" onClick={async () => { const p = demoProject(); await createProject(p); await open(p.id) }}>
              Open the demo study
            </button>
          </p>
        )}

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ['Imports', 'QualCoder projects, Research Weave exports, transcripts (.txt, .srt, .vtt, Whisper JSON) and Markdown interview guides.'],
            ['Codebook rules', 'Declare “exactly one evidence grade per claim” or “every cost-benefit flag needs an extraction row” and see violations as you code.'],
            ['Safe changes', 'Undo any edit. Snapshots are taken before bulk changes like transcript corrections, and can be restored.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-line bg-surface p-4">
              <Badge tone="accent">{t}</Badge>
              <p className="mt-2 text-sm text-muted">{d}</p>
            </div>
          ))}
        </section>
      </main>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New study"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={async () => {
                const p = emptyProject(name.trim())
                await createProject(p)
                setCreating(false)
                await open(p.id)
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Study name">{(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional hub feasibility interviews" />}</Field>
      </Dialog>
    </div>
  )
}
