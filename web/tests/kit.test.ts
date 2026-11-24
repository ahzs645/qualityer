import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createFontProvider } from 'document-kit/layout'
import { demoProject } from '../src/lib/demo'
import { peopleOf } from '../src/lib/positions'
import { SHIPPED, compileFor, editOwn, exportRecipe, importRecipe, ownCopy, recipeList, recipeOptions, removeOwn } from '../src/lib/kit/documents'
import { buildDocument, layOut } from '../src/lib/kit/render'
import { recipeData } from '../src/lib/kit/data'
import { exportAllDocumentsZip } from '../src/lib/export-all'
import { strFromU8, unzipSync } from 'fflate'

const fontDir = fileURLToPath(new URL('../../vendor/document-kit/fonts/', import.meta.url))
const fonts = createFontProvider(({ file }) => new Uint8Array(readFileSync(fontDir + file)))
/** A one-pixel PNG stands in for a chart: Node has no canvas. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const rasterize = async (_svg: string, width: number, height: number) => ({ bytes: PNG, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) })

describe('document-kit recipes', () => {
  it('compiles every shipped recipe', () => {
    const p = demoProject()
    for (const id of SHIPPED) expect(compileFor(p, id).recipe.id).toBe(id)
    expect(recipeList(p).map((r) => r.id)).toEqual(SHIPPED)
    // Extensions take their base's parts with their own options.
    expect((recipeOptions(p, 'rw-summary').show as Record<string, boolean>).sources).toBe(false)
    expect((recipeOptions(p, 'rw-full').show as Record<string, boolean>).codebook).toBe(true)
  })

  it('renders each recipe to Word and lays it out as a PDF, for everyone and for one participant', async () => {
    const p = demoProject()
    const person = peopleOf(p)[0]
    for (const id of SHIPPED) {
      for (const scope of [{ kind: 'all' as const }, { kind: 'person' as const, personId: person.id }]) {
        const doc = await buildDocument(p, id, scope, { rasterize, generatedAt: new Date('2026-11-24T12:00:00Z') })
        expect(doc.docx.length).toBeGreaterThan(5000)
        const laid = await layOut(doc.docx, fonts, p.name)
        expect(laid.pageCount).toBeGreaterThan(0)
        const text = laid.pages().pageText.join('\n')
        expect(text).toContain(p.name)
        if (scope.kind === 'person') expect(text).toContain(`One participant: ${person.label}`)
      }
    }
  }, 120_000)

  it('prints the framework and the casebook', async () => {
    const p = demoProject()
    const standard = await buildDocument(p, 'rw-standard', { kind: 'all' }, { rasterize })
    const text = (await layOut(standard.docx, fonts)).pages().pageText.join(' ')
    expect(text).toContain('Framework matrix')
    expect(text).toContain(p.themes[0].title)
    const casebook = await buildDocument(p, 'rw-casebook', { kind: 'all' }, { rasterize })
    expect(casebook.parts.find((x) => x.id === 'person')?.repeats).toBe(peopleOf(p).length)
  }, 60_000)

  it('leaves charts out when they cannot be drawn', async () => {
    const data = await recipeData(demoProject())
    expect((data.charts as Record<string, unknown>).stance).toBeNull()
    const doc = await buildDocument(demoProject(), 'rw-visual')
    expect(doc.toComplete.filter((t) => t.kind === 'figure')).toEqual([])
  })

  it('switches sections off through the options the screen lays over the recipe', async () => {
    const p = demoProject()
    const on = await buildDocument(p, 'rw-standard', { kind: 'all' }, { rasterize })
    const off = await buildDocument(p, 'rw-standard', { kind: 'all' }, { rasterize, options: { show: { ...(recipeOptions(p, 'rw-standard').show as object), framework: false } } })
    expect(on.parts.find((x) => x.id === 'framework')?.blocks).toBeGreaterThan(0)
    expect(off.parts.find((x) => x.id === 'framework')?.blocks).toBe(0)
  })
})

describe('Word and PDF for everyone and each participant', () => {
  it('zips one recipe per scope', async () => {
    const p = demoProject()
    const zip = unzipSync(await exportAllDocumentsZip(p, 'rw-summary', (scope) => buildDocument(p, 'rw-summary', scope, { rasterize }), async (docx) => (await layOut(docx, fonts)).pdf()))
    const names = Object.keys(zip)
    expect(names.filter((n) => n.endsWith('.docx'))).toHaveLength(1 + peopleOf(p).length)
    expect(names.filter((n) => n.endsWith('.pdf'))).toHaveLength(1 + peopleOf(p).length)
    expect(strFromU8(zip['README.txt'])).toContain('Summary')
  }, 120_000)
})

describe("a study's own recipes", () => {
  it('copies, edits, shares and removes one', () => {
    let p = demoProject()
    const { recipes, id } = ownCopy(p, 'rw-summary', 'Funder summary')
    p = { ...p, reportRecipes: recipes }
    expect(recipeList(p).find((r) => r.id === id)).toMatchObject({ name: 'Funder summary', own: true, basedOn: 'rw-summary' })
    p = { ...p, reportRecipes: editOwn(p, id, { options: { label: 'For the funder', quotesPerCell: 2 } }) }
    expect(recipeOptions(p, id).label).toBe('For the funder')
    expect(() => editOwn(p, 'rw-standard', { name: 'x' })).toThrow(/your own/)

    const file = exportRecipe(p, id)
    const imported = importRecipe(p, file)
    expect(imported.id).not.toBe(id)
    p = { ...p, reportRecipes: imported.recipes }
    expect(recipeList(p).filter((r) => r.own)).toHaveLength(2)
    expect(() => importRecipe(p, '{"kind":"something-else"}')).toThrow()

    // The example in docs/document-recipes.md imports, and its notice prints after the title.
    const example = readFileSync(fileURLToPath(new URL('../../docs/document-recipes.md', import.meta.url)), 'utf8').match(/```json\n([\s\S]*?)```/)![1]
    const board = importRecipe(p, example)
    expect(compileFor({ ...p, reportRecipes: board.recipes }, board.id).recipe.name).toBe('Board summary')

    p = { ...p, reportRecipes: removeOwn(p, id) }
    p = { ...p, reportRecipes: removeOwn(p, imported.id) }
    expect(p.reportRecipes).toBeNull()
  })
})
