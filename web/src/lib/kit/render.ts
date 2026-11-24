import { renderRecipe, type EditTarget, type JsonObject, type RecipeToCompleteItem, type RenderedPart } from 'document-kit/recipe'
import { writeDocx } from 'document-kit/docx'
import { layoutDocx, type FontProvider } from 'document-kit/layout'
import type { Project } from '../types'
import { ALL, scopeKey, type Scope } from '../scope'
import { forExport } from '../names'
import { recipeData, type Rasterize } from './data'
import { compileFor } from './documents'
import { compactPdf } from './pdf-compact'

// From a study to a document: a recipe rendered against the study's data, written as a Word file, and laid out
// as a PDF or page pictures. The layout engine is large, so the Report screen loads this module on demand.

// ---------------------------------------------------------------------------
// From a study to a document

export interface StudyDocument {
  docx: Uint8Array
  /** Blanks and placeholders the document leaves, with the part and heading each is under. */
  toComplete: RecipeToCompleteItem[]
  parts: RenderedPart[]
  recipe: { id: string; name: string }
  edits: DocumentEdits
}

/** The document's editable wording and what became of the study's hand edits for this scope. */
export interface DocumentEdits {
  /** Every value a person can change by hand, in reading order; an edited one carries its edit. */
  targets: EditTarget[]
  /** Edits for this recipe's parts whose place this document no longer prints. */
  orphans: string[]
  /** Edited values whose generated wording has changed since the edit was made. */
  stale: string[]
}

export interface BuildOptions {
  rasterize?: Rasterize
  /** Laid over the recipe's options, as the Report screen's checkboxes. */
  options?: JsonObject
  askId?: string | null
  generatedAt?: Date
  /** Highlight hand-edited wording in the Word file and the PDF (for checking a draft). */
  markEdits?: boolean
}

/** The colour hand edits are marked in when `markEdits` is on. */
export const EDIT_MARK = { highlight: 'cyan' } as const

export async function buildDocument(project: Project, recipeId: string, scope: Scope = ALL, opts: BuildOptions = {}): Promise<StudyDocument> {
  const compiled = compileFor(project, recipeId)
  const data = await recipeData(project, scope, { rasterize: opts.rasterize, askId: opts.askId, generatedAt: opts.generatedAt })
  const saved = project.reportEdits?.[scopeKey(scope)] ?? {}
  // A person's own words are masked like everything else when the study is anonymised.
  const edits = Object.fromEntries(Object.entries(saved).map(([key, e]) => [key, forExport(project, e.text)]))
  const rendered = renderRecipe(compiled, data, { options: opts.options, edits, editSource: 'edited' })
  const docx = await writeDocx(rendered.document, opts.markEdits ? { sourceStyles: { edited: EDIT_MARK } } : {})
  const stale = rendered.edits.targets.filter((t) => t.edited !== undefined && saved[t.key] && saved[t.key].original !== t.original).map((t) => t.key)
  return {
    docx, toComplete: rendered.toComplete, parts: rendered.parts, recipe: { id: compiled.recipe.id, name: compiled.recipe.name },
    edits: { targets: rendered.edits.targets, orphans: rendered.edits.orphans, stale },
  }
}

/** Lays a Word file out once, for a PDF, page pictures or both. */
export async function layOut(docx: Uint8Array, fonts: FontProvider, title?: string) {
  const laid = await layoutDocx(docx, { fonts })
  return {
    pageCount: laid.pageCount,
    /** The PDF, with its page drawing deflated and its charts stored with a palette (see ./pdf-compact.ts). */
    pdf: () => compactPdf(laid.toPdf({ info: title ? { title } : undefined }).bytes),
    pages: () => laid.toPages({ sharedGlyphs: true }),
    losses: laid.losses,
  }
}
