import type { Code, CodeGroup, Project } from './types'
import { PALETTE, codePath, guessGroupKind, indexBy, toCSV, uid } from './model'

const HEADERS = ['Code', 'Group', 'Parent', 'Definition', 'Include', 'Exclude', 'Anchor', 'Color']

export function codebookCSV(project: Project) {
  const codes = indexBy(project.codes)
  const groups = indexBy(project.groups)
  return toCSV([
    HEADERS,
    ...project.codes.map((c) => [
      c.name, groups.get(c.groupId ?? '')?.name ?? '', c.parentId ? codes.get(c.parentId)?.name ?? '' : '',
      c.definition, c.include, c.exclude, c.anchor, c.color,
    ]),
  ])
}

/** Minimal RFC 4180 parser. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** Merges a codebook CSV into the project: new codes are added, existing names updated. */
export function mergeCodebookCSV(project: Project, text: string): { project: Project; added: number; updated: number } {
  const [head, ...rows] = parseCSV(text)
  if (!head) return { project, added: 0, updated: 0 }
  const col = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  const iName = col('Code') >= 0 ? col('Code') : col('Name')
  if (iName < 0) throw new Error('The CSV needs a “Code” or “Name” column.')
  const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '')
  const groups = [...project.groups]
  const codes = project.codes.map((c) => ({ ...c }))
  let added = 0, updated = 0
  const groupId = (name: string) => {
    if (!name) return groups[0]?.id ?? null
    let g = groups.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!g) { g = { id: uid(), name, kind: guessGroupKind(name), color: PALETTE[groups.length % PALETTE.length] }; groups.push(g) }
    return g.id
  }
  for (const r of rows) {
    const name = (r[iName] ?? '').trim()
    if (!name) continue
    const fields = { definition: get(r, 'Definition') || get(r, 'Description'), include: get(r, 'Include'), exclude: get(r, 'Exclude'), anchor: get(r, 'Anchor') }
    const gid = groupId(get(r, 'Group'))
    const existing = codes.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (existing) { Object.assign(existing, Object.fromEntries(Object.entries(fields).filter(([, v]) => v))); updated++ }
    else {
      codes.push({ id: uid(), name, groupId: gid, parentId: null, color: get(r, 'Color') || groups.find((g) => g.id === gid)?.color || PALETTE[codes.length % PALETTE.length], ...fields })
      added++
    }
  }
  for (const r of rows) {
    const parent = get(r, 'Parent')
    if (!parent) continue
    const c = codes.find((x) => x.name.toLowerCase() === (r[iName] ?? '').trim().toLowerCase())
    const p = codes.find((x) => x.name.toLowerCase() === parent.toLowerCase())
    if (c && p && c !== p) c.parentId = p.id
  }
  return { project: { ...project, groups, codes }, added, updated }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** REFI-QDA codebook (.qdc), readable by NVivo, ATLAS.ti, MAXQDA and QualCoder. Groups become sets. */
export function codebookQDC(project: Project) {
  const guid = new Map(project.codes.map((c) => [c.id, crypto.randomUUID()]))
  const children = new Map<string | null, Code[]>()
  for (const c of project.codes) {
    const k = c.parentId && guid.has(c.parentId) ? c.parentId : null
    if (!children.has(k)) children.set(k, [])
    children.get(k)!.push(c)
  }
  const describe = (c: Code) =>
    [c.definition, c.include && `INCLUDE: ${c.include}`, c.exclude && `EXCLUDE: ${c.exclude}`, c.anchor && `ANCHOR: ${c.anchor}`].filter(Boolean).join('\n\n')
  const codeXml = (c: Code, depth: number): string => {
    const pad = '  '.repeat(depth)
    const kids = children.get(c.id) ?? []
    const desc = describe(c)
    const color = /^#[0-9a-f]{6}$/i.test(c.color) ? ` color="${c.color.toUpperCase()}"` : ''
    return `${pad}<Code guid="${guid.get(c.id)}" name="${esc(c.name)}" isCodable="true"${color}>\n` +
      (desc ? `${pad}  <Description>${esc(desc)}</Description>\n` : '') +
      kids.map((k) => codeXml(k, depth + 1)).join('') +
      `${pad}</Code>\n`
  }
  const sets = project.groups.map((g: CodeGroup) => {
    const members = project.codes.filter((c) => c.groupId === g.id)
    return `    <Set guid="${crypto.randomUUID()}" name="${esc(g.name)}">\n` +
      members.map((m) => `      <MemberCode guid="${guid.get(m.id)}"/>\n`).join('') +
      '    </Set>\n'
  }).join('')
  return '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<CodeBook xmlns="urn:QDA-XML:codebook:1.0" origin="Research Weave">\n  <Codes>\n' +
    (children.get(null) ?? []).map((c) => codeXml(c, 2)).join('') +
    '  </Codes>\n' + (sets ? `  <Sets>\n${sets}  </Sets>\n` : '') + '</CodeBook>\n'
}

export { codePath }
