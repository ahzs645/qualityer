import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, FileText, FileType2, Package, Share2, Trash2, Upload } from 'lucide-react'
import type { JsonObject, RecipeToCompleteItem } from 'document-kit/recipe'
import type { Project } from '../../lib/types'
import { download, slug } from '../../lib/model'
import { setReportRecipes } from '../../lib/actions'
import { editOwn, exportRecipe, importRecipe, ownCopy, recipeList, recipeOptions, removeOwn } from '../../lib/kit/documents'
import { Button, Input, Panel, Select, cx } from '../../components/ui'

// Word and PDF through document-kit: the recipe to use (shipped or the study's own), downloads for the chosen
// participant or everyone, a zip of all of them, and a study's own recipes (copy, change, share, import, delete).

export interface DocumentsProps {
  project: Project
  recipeId: string
  onRecipe: (id: string) => void
  /** Laid over the recipe's options: the screen's section checkboxes, when the recipe is the one for the chosen format. */
  overlay: JsonObject | undefined
  busy: string | null
  onWord: () => void
  onPdf: () => void
  onZip: () => void
  toComplete: RecipeToCompleteItem[] | null
  onError: (message: string) => void
}

const SHOW_LABEL: Record<string, string> = {
  glance: 'At a glance', sources: 'Sources', coverage: 'Guide coverage', perspectives: 'Perspectives', asides: 'Asides', framework: 'Framework',
  profile: 'Cases by domain', codes: 'Code counts', figures: 'Flagged figures', ai: 'AI and review', open: 'Open items or limitations', memos: 'Memos',
  codebook: 'Codebook', toComplete: 'Left to complete', headlines: 'Headlines', stance: 'Where people stand', mix: 'Stance mix', evidence: 'Evidence',
  raised: 'Who raised what', through: 'Stance through interviews', themes: 'Themes through interviews', pairs: 'Code pairs', quotes: 'Quotes per theme',
}

export function Documents({ project, recipeId, onRecipe, overlay, busy, onWord, onPdf, onZip, toComplete, onError }: DocumentsProps) {
  const list = useMemo(() => recipeList(project), [project])
  const current = list.find((r) => r.id === recipeId) ?? list[0]
  const file = useRef<HTMLInputElement>(null)
  const act = (fn: () => void) => { try { fn() } catch (e) { onError(e instanceof Error ? e.message : String(e)) } }

  const copy = () => act(() => {
    const name = prompt('Name for your copy of this recipe', `${current.name} (your copy)`)
    if (!name?.trim()) return
    const { recipes, id } = ownCopy(project, current.id, name.trim())
    setReportRecipes(recipes, `copy recipe ${current.name}`)
    onRecipe(id)
  })
  const remove = () => act(() => {
    if (!confirm(`Delete your recipe “${current.name}”? Documents already made from it are not affected.`)) return
    setReportRecipes(removeOwn(project, current.id), `delete recipe ${current.name}`)
    onRecipe(current.basedOn && list.some((r) => r.id === current.basedOn) ? current.basedOn : 'rw-standard')
  })
  const share = () => act(() => download(`${slug(current.name)}.recipe.json`, exportRecipe(project, current.id), 'application/json'))
  const load = async (f: File | undefined) => {
    if (!f) return
    try {
      const { recipes, id } = importRecipe(project, await f.text())
      setReportRecipes(recipes, `import recipe ${f.name}`)
      onRecipe(id)
    } catch (e) { onError(`The recipe could not be imported: ${e instanceof Error ? e.message : String(e)}`) }
    if (file.current) file.current.value = ''
  }

  return (
    <Panel title="Word and PDF" bodyClass="space-y-3 p-3 text-sm">
      <p className="text-xs text-muted">Built with document-kit from a recipe: Word files you can edit, and PDFs laid out from them.</p>
      <label className="block">
        <span className="text-xs font-medium text-muted">Recipe</span>
        <Select value={current.id} onChange={(e) => onRecipe(e.target.value)} className="mt-1 h-8 w-full text-xs" aria-label="Document recipe">
          <optgroup label="Research Weave">{list.filter((r) => !r.own).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
          {list.some((r) => r.own) && <optgroup label="This study's own">{list.filter((r) => r.own).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>}
        </Select>
        <span className="mt-1 block text-xs text-muted">{current.description}{overlay ? ' Sections follow the checkboxes on this screen.' : ''}</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" icon={<FileType2 size={13} />} disabled={!!busy} onClick={onWord}>Word</Button>
        <Button size="sm" icon={<FileText size={13} />} disabled={!!busy} onClick={onPdf}>PDF</Button>
        <Button size="sm" icon={<Package size={13} />} disabled={!!busy} onClick={onZip}>Everyone + each (.zip)</Button>
      </div>
      {busy && <p className="text-xs text-muted" role="status">{busy}</p>}
      {toComplete && (
        <div className={cx('rounded-md px-2.5 py-2 text-xs', toComplete.length ? 'bg-warn-soft text-warn' : 'bg-good-soft text-good')}>
          {toComplete.length ? (
            <>
              <b>{toComplete.length} left to complete</b> in the last document:
              <ul className="mt-1 list-disc pl-4">{toComplete.slice(0, 6).map((t, i) => <li key={i}>{t.what}{t.heading ? ` (under “${t.heading}”)` : ''}</li>)}</ul>
              {toComplete.length > 6 && <span>and {toComplete.length - 6} more.</span>}
            </>
          ) : 'Nothing is left blank in the last document.'}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
        <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={copy}>Make my own</Button>
        <Button size="sm" variant="ghost" icon={<Share2 size={13} />} onClick={share}>Share recipe</Button>
        <Button size="sm" variant="ghost" icon={<Upload size={13} />} onClick={() => file.current?.click()}>Import recipe</Button>
        {current.own && <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={remove}>Delete</Button>}
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => load(e.target.files?.[0])} aria-label="Recipe file" />
      </div>
      {current.own && <OwnRecipe project={project} recipeId={current.id} name={current.name} onError={onError} />}
    </Panel>
  )
}

/** The settings of a study's own recipe: its name, the label it prints, quotes per cell and which sections it shows. */
function OwnRecipe({ project, recipeId, name, onError }: { project: Project; recipeId: string; name: string; onError: (m: string) => void }) {
  const options = useMemo(() => { try { return recipeOptions(project, recipeId) } catch { return {} as JsonObject } }, [project, recipeId])
  const show = (options.show ?? {}) as Record<string, boolean>
  const [title, setTitle] = useState(name)
  useEffect(() => setTitle(name), [name])
  const save = (change: { name?: string; options?: JsonObject }, label: string) => {
    try { setReportRecipes(editOwn(project, recipeId, change), label) } catch (e) { onError(e instanceof Error ? e.message : String(e)) }
  }
  const setOption = (key: string, value: unknown, label: string) => save({ options: { ...options, [key]: value } as JsonObject }, label)
  return (
    <div className="space-y-2 rounded-md bg-sunken p-2.5">
      <p className="text-xs font-semibold">Your recipe</p>
      <label className="block text-xs">Name
        <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== name && save({ name: title.trim() }, 'rename recipe')} className="mt-1 h-8 text-xs" />
      </label>
      {'label' in options && (
        <label className="block text-xs">Printed as
          <Input defaultValue={String(options.label ?? '')} key={`${recipeId}-label`} onBlur={(e) => e.target.value !== options.label && setOption('label', e.target.value, 'change recipe label')} className="mt-1 h-8 text-xs" />
        </label>
      )}
      {'quotesPerCell' in options && (
        <label className="flex items-center gap-2 text-xs">Quotes per framework cell
          <Select value={String(Math.min(Number(options.quotesPerCell), 99))} onChange={(e) => setOption('quotesPerCell', Number(e.target.value), 'change quotes per cell')} className="h-7 text-xs">
            {[0, 1, 2, 3, 99].map((n) => <option key={n} value={n}>{n === 99 ? 'all' : n}</option>)}
          </Select>
        </label>
      )}
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
        {Object.keys(show).map((k) => (
          <li key={k}><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!show[k]} onChange={(e) => setOption('show', { ...show, [k]: e.target.checked }, `${e.target.checked ? 'show' : 'hide'} ${SHOW_LABEL[k] ?? k}`)} />{SHOW_LABEL[k] ?? k}</label></li>
        ))}
      </ul>
      <p className="text-[11px] text-muted">Saved with the study. Share it as a file for another study or a colleague.</p>
    </div>
  )
}

/** The document's pages as pictures, the same layout the PDF gets. */
export function PagePreview({ pages, glyphDefs, building }: { pages: string[] | null; glyphDefs: string | null; building: boolean }) {
  return (
    <div className="h-[calc(100vh-11rem)] overflow-auto rounded-lg border border-line bg-sunken p-4" aria-busy={building}>
      {building && !pages && <p className="text-sm text-muted">Laying out the document…</p>}
      {glyphDefs && <div aria-hidden dangerouslySetInnerHTML={{ __html: glyphDefs }} />}
      <div className={cx('mx-auto flex max-w-4xl flex-col gap-4', building && 'opacity-60')}>
        {pages?.map((svg, i) => <div key={i} className="shadow-sm [&>svg]:h-auto [&>svg]:w-full" aria-label={`Page ${i + 1}`} dangerouslySetInnerHTML={{ __html: svg }} />)}
      </div>
    </div>
  )
}

