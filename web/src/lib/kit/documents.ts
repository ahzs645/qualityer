import {
  compileRecipe, copyRecipe, editRecipe, emptyOverrides, layerLibraries, readRecipeFile, recipeFileText, sharedLibrary,
  withOverride, withoutOverride, type Component, type CompiledRecipe, type JsonObject, type Library, type LibraryOverrides, type Recipe,
} from 'document-kit/recipe'
import type { Project, ReportRecipes } from '../types'
import components from './components.json'
import recipes from './recipes.json'

// Reports as document-kit recipes: the shipped Research Weave recipes (./recipes.json, built from the components in
// ./components.json and the kit's shared ones) and a study's own recipes over them. ./render.ts makes the documents.

export const SHIPPED = recipes.map((r) => r.id)
export type RecipeInfo = { id: string; name: string; description: string; own: boolean; basedOn: string | null; status: string }

export const shippedLibrary = (): Library => sharedLibrary({ components: components as unknown as Component[], recipes: recipes as unknown as Recipe[] })

const overridesOf = (project: Project): LibraryOverrides => (project.reportRecipes as LibraryOverrides | null | undefined) ?? emptyOverrides()

/** The shipped library with the study's own recipes laid over it. */
export function studyLibrary(project: Project) {
  return layerLibraries(shippedLibrary(), overridesOf(project))
}

/** Every recipe the study can use, shipped first, then its own. */
export function recipeList(project: Project): RecipeInfo[] {
  const { library, status } = studyLibrary(project)
  const rank = (r: Recipe) => (SHIPPED.includes(r.id) ? SHIPPED.indexOf(r.id) : 100)
  return [...library.recipes].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).map((r) => ({
    id: r.id, name: r.name, description: r.description ?? '', own: !SHIPPED.includes(r.id), basedOn: r.own?.basedOn ?? r.extends ?? null, status: status.recipes[r.id] ?? 'shipped',
  }))
}

export const recipeById = (project: Project, id: string) => studyLibrary(project).library.recipes.find((r) => r.id === id) ?? null

export function compileFor(project: Project, recipeId: string): CompiledRecipe {
  return compileRecipe(recipeId, studyLibrary(project).library)
}

/** The recipe's options after compiling (an extension's laid over its base's). */
export const recipeOptions = (project: Project, recipeId: string) => compileFor(project, recipeId).options as JsonObject

// ---------------------------------------------------------------------------
// A study's own recipes

const save = (overrides: LibraryOverrides) => overrides as unknown as ReportRecipes

/** A copy of a recipe to change for this study: an extension, so later fixes to the shipped one still reach it. */
export function ownCopy(project: Project, recipeId: string, name?: string): { recipes: ReportRecipes; id: string } {
  const lib = studyLibrary(project).library
  const base = lib.recipes.find((r) => r.id === recipeId)
  if (!base) throw new Error(`No recipe ${recipeId}`)
  const copy = copyRecipe(base, new Set(lib.recipes.map((r) => r.id)), { as: 'extension', name })
  return { recipes: save(withOverride(overridesOf(project), 'recipe', copy)), id: copy.id }
}

/** An own recipe with new options or a new name. Shipped recipes are not changed in place. */
export function editOwn(project: Project, recipeId: string, change: { name?: string; options?: JsonObject; description?: string | null }): ReportRecipes {
  const recipe = (overridesOf(project).recipes ?? {})[recipeId]
  if (!recipe) throw new Error('Only your own recipes can be changed. Make a copy first.')
  return save(withOverride(overridesOf(project), 'recipe', editRecipe(recipe, change)))
}

export function removeOwn(project: Project, recipeId: string): ReportRecipes | null {
  const next = withoutOverride(overridesOf(project), 'recipe', recipeId)
  return Object.keys(next.recipes ?? {}).length || Object.keys(next.components ?? {}).length ? save(next) : null
}

export function exportRecipe(project: Project, recipeId: string): string {
  const recipe = recipeById(project, recipeId)
  if (!recipe) throw new Error(`No recipe ${recipeId}`)
  return recipeFileText(recipe, new Date())
}

/** Adds a shared recipe file to the study; it takes a fresh id or name when its own are in use. */
export function importRecipe(project: Project, text: string): { recipes: ReportRecipes; id: string } {
  const lib = studyLibrary(project).library
  const recipe = readRecipeFile(text, { ids: new Set(lib.recipes.map((r) => r.id)), names: new Set(lib.recipes.map((r) => r.name)) })
  const next = withOverride(overridesOf(project), 'recipe', recipe)
  // Check it compiles against this study's library before keeping it.
  compileRecipe(recipe.id, layerLibraries(shippedLibrary(), next).library)
  return { recipes: save(next), id: recipe.id }
}
