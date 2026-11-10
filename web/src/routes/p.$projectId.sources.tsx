import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { AudioLines, ClipboardPaste, FileText, FileUp, Plus, Trash2 } from 'lucide-react'
import { useProject } from '../lib/store'
import { formatTime, newSource, rawSpeakers, segmentsOf, sourceProgress } from '../lib/model'
import { storeRecording } from '../lib/player'
import { deleteMedia } from '../lib/storage'
import { sourceFromFile } from '../lib/importers'
import { addSources, removeSource, updateSource } from '../lib/actions'
import { Badge, Button, Dialog, Empty, Field, IconButton, Input, PageHeader, Panel, Textarea, pct } from '../components/ui'

export const Route = createFileRoute('/p/$projectId/sources')({ component: Sources })

function Sources() {
  const project = useProject()
  const fileRef = useRef<HTMLInputElement>(null)
  const [paste, setPaste] = useState(false)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newAttr, setNewAttr] = useState('')
  const mediaRef = useRef<HTMLInputElement>(null)
  const [mediaFor, setMediaFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function onMedia(file: File | undefined) {
    if (!file || !mediaFor) return
    setBusy(`Attaching ${file.name}… large recordings can take a minute to analyse.`)
    try {
      const media = await storeRecording(project.id, mediaFor, file)
      updateSource(mediaFor, { media }, 'attach recording')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null); setMediaFor(null)
      if (mediaRef.current) mediaRef.current.value = ''
    }
  }

  const attrKeys = useMemo(() => {
    const keys: string[] = []
    for (const s of project.sources) for (const k of Object.keys(s.attributes)) if (!keys.includes(k)) keys.push(k)
    return keys
  }, [project.sources])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    try {
      const added = await Promise.all([...files].map(sourceFromFile))
      addSources(added)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Sources"
        description="Interview transcripts in this study. Set attributes before coding — an uncoded topic may mean the question was never asked."
        actions={
          <>
            <Button icon={<ClipboardPaste size={15} />} onClick={() => setPaste(true)}>Paste text</Button>
            <Button variant="primary" icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()}>Add files</Button>
          </>
        }
      />
      <input ref={fileRef} type="file" multiple hidden accept=".txt,.md,.srt,.vtt,.json,.docx,.odt,.pdf,.html,.htm,.rtf" onChange={(e) => onFiles(e.target.files)} />
      <input ref={mediaRef} type="file" hidden accept="audio/*,video/*,.m4a,.qta,.mov,.mp3,.wav,.ogg,.webm,.mp4" onChange={(e) => onMedia(e.target.files?.[0])} />
      {busy && <p className="mb-4 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">{busy}</p>}
      {error && <p role="alert" className="mb-4 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

      {project.sources.length === 0 ? (
        <Panel>
          <Empty icon={<FileText size={28} />} title="No transcripts yet" action={<Button variant="primary" icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()}>Add files</Button>}>
            Plain text, SRT/WebVTT subtitles, or Whisper JSON. Lines like <code>[00:05]  Speaker 1</code> or <code>Name: …</code> become speaker turns.
          </Empty>
        </Panel>
      ) : (
        <div className="space-y-5">
          <Panel title="Transcripts" bodyClass="">
            <ul className="divide-y divide-line">
              {project.sources.map((s) => {
                const pr = sourceProgress(project, s)
                const turns = segmentsOf(s).length
                const speakers = rawSpeakers(s).length
                const uncertain = (s.segments ?? []).reduce((n, g) => n + (g.uncertain?.length ?? 0), 0)
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <input
                        defaultValue={s.name}
                        onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && updateSource(s.id, { name: e.target.value.trim() }, 'rename source')}
                        className="w-full rounded bg-transparent px-1 -mx-1 font-medium hover:bg-sunken focus:bg-sunken"
                        aria-label="Source name"
                      />
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                        <span>{s.text.length.toLocaleString()} characters</span>
                        <span>{turns} turns · {speakers} speakers</span>
                        <span>from {s.importedFrom || 'unknown'}</span>
                        {uncertain > 0 && <span className="text-warn">{uncertain} low-confidence words</span>}
                        {s.media && <span className="inline-flex items-center gap-1 text-accent"><AudioLines size={12} />{s.media.name}{s.media.duration ? ` · ${formatTime(s.media.duration)}` : ''}</span>}
                      </div>
                    </div>
                    <Badge tone={s.status === 'done' ? 'good' : s.status === 'new' ? 'neutral' : 'accent'}>{s.status}</Badge>
                    <span className="w-28 text-xs text-muted">{pct(pr.read)} read · {pr.codings} codings</span>
                    {s.media ? (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm(`Detach ${s.media!.name} from this source? The transcript and codes are kept.`)) return
                        await deleteMedia(project.id, s.id); updateSource(s.id, { media: null }, 'detach recording')
                      }}>Detach audio</Button>
                    ) : (
                      <Button size="sm" variant="ghost" icon={<AudioLines size={13} />} onClick={() => { setMediaFor(s.id); mediaRef.current?.click() }}>Attach audio</Button>
                    )}
                    <Link to="/p/$projectId/code" params={{ projectId: project.id }} search={{ source: s.id }}><Button size="sm">Open</Button></Link>
                    <IconButton label={`Remove ${s.name}`} onClick={() => confirm(`Remove “${s.name}” and its ${pr.codings} codings? You can undo this${s.media ? ' (the attached recording is deleted)' : ''}.`) && (removeSource(s.id), s.media && void deleteMedia(project.id, s.id))}>
                      <Trash2 size={15} />
                    </IconButton>
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel
            title="Attributes"
            bodyClass="overflow-x-auto"
            actions={
              <form className="flex gap-1.5" onSubmit={(e) => {
                e.preventDefault()
                const k = newAttr.trim()
                if (!k || attrKeys.includes(k)) return
                for (const s of project.sources) updateSource(s.id, { attributes: { ...s.attributes, [k]: '' } }, 'add attribute')
                setNewAttr('')
              }}>
                <Input value={newAttr} onChange={(e) => setNewAttr(e.target.value)} placeholder="New attribute" className="h-7 w-40 text-xs" />
                <Button size="sm" type="submit" icon={<Plus size={13} />}>Add</Button>
              </form>
            }
          >
            {attrKeys.length === 0 ? (
              <p className="p-4 text-sm text-muted">No attributes yet. Add things like respondent ID, segment, role level or modules administered.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="sticky left-0 bg-surface px-4 py-2 font-medium">Source</th>
                    {attrKeys.map((k) => <th key={k} className="px-2 py-2 font-medium whitespace-nowrap">{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {project.sources.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="sticky left-0 max-w-56 truncate bg-surface px-4 py-1.5 font-medium">{s.name}</td>
                      {attrKeys.map((k) => (
                        <td key={k} className="px-1 py-1">
                          <input
                            defaultValue={s.attributes[k] ?? ''}
                            onBlur={(e) => e.target.value !== (s.attributes[k] ?? '') && updateSource(s.id, { attributes: { ...s.attributes, [k]: e.target.value } }, 'edit attribute')}
                            className="h-7 w-full min-w-28 rounded px-1.5 hover:bg-sunken focus:bg-sunken"
                            aria-label={`${k} for ${s.name}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}

      <Dialog
        open={paste}
        onClose={() => setPaste(false)}
        title="Paste a transcript"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaste(false)}>Cancel</Button>
            <Button variant="primary" disabled={!name.trim() || !text.trim()} onClick={() => {
              addSources([newSource(name.trim(), text.replace(/\r\n?/g, '\n'))])
              setPaste(false); setName(''); setText('')
            }}>Add source</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. R03 — Health authority director" />}</Field>
          <Field label="Transcript" hint="Turns are detected from “[mm:ss]  Speaker” header lines or “Name: text” lines.">
            {(id) => <Textarea id={id} rows={12} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />}
          </Field>
        </div>
      </Dialog>
    </div>
  )
}
