import { renderRecipe, type JsonObject, type RecipeToCompleteItem, type RenderedPart } from 'document-kit/recipe'
import { writeDocx } from 'document-kit/docx'
import { layoutDocx, type FontProvider } from 'document-kit/layout'
import type { Project } from '../types'
import { ALL, type Scope } from '../scope'
import { recipeData, type Rasterize } from './data'
import { compileFor } from './documents'

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
}

export interface BuildOptions {
  rasterize?: Rasterize
  /** Laid over the recipe's options, as the Report screen's checkboxes. */
  options?: JsonObject
  askId?: string | null
  generatedAt?: Date
}

export async function buildDocument(project: Project, recipeId: string, scope: Scope = ALL, opts: BuildOptions = {}): Promise<StudyDocument> {
  const compiled = compileFor(project, recipeId)
  const data = await recipeData(project, scope, { rasterize: opts.rasterize, askId: opts.askId, generatedAt: opts.generatedAt })
  const rendered = renderRecipe(compiled, data, { options: opts.options })
  const docx = await writeDocx(rendered.document)
  return { docx, toComplete: rendered.toComplete, parts: rendered.parts, recipe: { id: compiled.recipe.id, name: compiled.recipe.name } }
}

/** Lays a Word file out once, for a PDF, page pictures or both. */
export async function layOut(docx: Uint8Array, fonts: FontProvider, title?: string) {
  const laid = await layoutDocx(docx, { fonts })
  return {
    pageCount: laid.pageCount,
    pdf: () => laid.toPdf({ info: title ? { title } : undefined }).bytes,
    pages: () => laid.toPages({ sharedGlyphs: true }),
    losses: laid.losses,
  }
}
