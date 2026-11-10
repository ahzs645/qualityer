import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Code, CodeGroup, Coding, Memo, Project, Source } from './types'
import { PALETTE, codePointToUtf16, emptyProject, guessGroupKind, newSource, now, splitDefinition, suggestedRules, uid } from './model'

// REFI-QDA project exchange (.qdpx): a zip holding project.qde (XML) and a
// sources/ folder of plain-text files. Positions are character (code point) offsets.

const NS = 'urn:QDA-XML:project:1.0'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const guid = () => crypto.randomUUID()

/** UTF-16 offset → code point offset. */
function toCodePoints(text: string) {
  if (!/[\uD800-\uDFFF]/.test(text)) return (n: number) => n
  return (n: number) => Array.from(text.slice(0, n)).length
}

export function exportQDPX(project: Project): Uint8Array {
  const ids = new Map<string, string>()
  const g = (id: string) => { if (!ids.has(id)) ids.set(id, guid()); return ids.get(id)! }
  const users = [...new Set([project.coder, ...project.codings.map((c) => c.coder)].filter(Boolean))]
  const userXml = users.map((u) => `    <User guid="${g('user:' + u)}" name="${esc(u)}"/>`).join('\n')

  const children = new Map<string | null, Code[]>()
  for (const c of project.codes) {
    const k = c.parentId && project.codes.some((p) => p.id === c.parentId) ? c.parentId : null
    if (!children.has(k)) children.set(k, [])
    children.get(k)!.push(c)
  }
  const describe = (c: Code) => [c.definition, c.include && `INCLUDE: ${c.include}`, c.exclude && `EXCLUDE: ${c.exclude}`, c.anchor && `ANCHOR: ${c.anchor}`].filter(Boolean).join('\n\n')
  const codeXml = (c: Code, pad: string): string => {
    const color = /^#[0-9a-f]{6}$/i.test(c.color) ? ` color="${c.color.toUpperCase()}"` : ''
    const d = describe(c)
    return `${pad}<Code guid="${g(c.id)}" name="${esc(c.name)}" isCodable="true"${color}>\n` +
      (d ? `${pad}  <Description>${esc(d)}</Description>\n` : '') +
      (children.get(c.id) ?? []).map((k) => codeXml(k, pad + '  ')).join('') + `${pad}</Code>\n`
  }

  const attrNames = [...new Set(project.sources.flatMap((s) => Object.keys(s.attributes)))]
  const varXml = attrNames.map((a) => `    <Variable guid="${g('var:' + a)}" name="${esc(a)}" typeOfVariable="Text"/>`).join('\n')

  const files: Record<string, Uint8Array> = {}
  const sourceXml = project.sources.map((s) => {
    const sid = g(s.id)
    files[`sources/${sid}.txt`] = strToU8(s.text)
    const cp = toCodePoints(s.text)
    const spans = new Map<string, Coding[]>()
    for (const c of project.codings) {
      if (c.sourceId !== s.id || c.status !== 'accepted') continue
      const k = `${c.start}:${c.end}`
      if (!spans.has(k)) spans.set(k, [])
      spans.get(k)!.push(c)
    }
    const sel = [...spans.values()].map((cs) => {
      const c0 = cs[0]
      const codings = cs.map((c) => `        <Coding guid="${g(c.id)}" creatingUser="${g('user:' + c.coder)}"><CodeRef targetGUID="${g(c.codeId)}"/></Coding>`).join('\n')
      return `      <PlainTextSelection guid="${guid()}" name="${esc(s.text.slice(c0.start, c0.end).slice(0, 60))}" startPosition="${cp(c0.start)}" endPosition="${cp(c0.end)}" creatingUser="${g('user:' + c0.coder)}">\n${codings}\n      </PlainTextSelection>`
    }).join('\n')
    const vars = Object.entries(s.attributes).map(([k, v]) => `      <VariableValue><VariableRef targetGUID="${g('var:' + k)}"/><TextValue>${esc(v)}</TextValue></VariableValue>`).join('\n')
    return `    <TextSource guid="${sid}" name="${esc(s.name)}" plainTextPath="internal://${sid}.txt">\n${sel}${sel && vars ? '\n' : ''}${vars}\n    </TextSource>`
  }).join('\n')

  const caseXml = project.cases.map((k) => `    <Case guid="${g(k.id)}" name="${esc(k.name)}">\n${k.sourceIds.map((sid) => `      <SourceRef targetGUID="${g(sid)}"/>`).join('\n')}\n    </Case>`).join('\n')
  const notes = project.memos.map((m) => `    <Note guid="${g(m.id)}" name="${esc(m.title)}" creatingUser="${g('user:' + (m.author || project.coder))}"><PlainTextContent>${esc(m.body)}</PlainTextContent></Note>`).join('\n')
  const sets = project.groups.map((gr) => `    <Set guid="${g(gr.id)}" name="${esc(gr.name)}">\n${project.codes.filter((c) => c.groupId === gr.id).map((c) => `      <MemberCode targetGUID="${g(c.id)}"/>`).join('\n')}\n    </Set>`).join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="${NS}" name="${esc(project.name)}" origin="Research Weave" creationDateTime="${project.createdAt}">
  <Users>
${userXml}
  </Users>
  <CodeBook>
    <Codes>
${(children.get(null) ?? []).map((c) => codeXml(c, '      ')).join('')}    </Codes>
  </CodeBook>
${varXml ? `  <Variables>\n${varXml}\n  </Variables>\n` : ''}  <Cases>
${caseXml}
  </Cases>
  <Sources>
${sourceXml}
  </Sources>
${notes ? `  <Notes>\n${notes}\n  </Notes>\n` : ''}${sets ? `  <Sets>\n${sets}\n  </Sets>\n` : ''}  <Description>${esc([project.question, project.method].filter(Boolean).join('\n\n'))}</Description>
</Project>
`
  files['project.qde'] = strToU8(xml)
  return zipSync(files, { level: 6 })
}

const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name)
const kid = (el: Element, name: string) => kids(el, name)[0]

export function importQDPX(bytes: Uint8Array, fallbackName: string): Project {
  const files = unzipSync(bytes)
  const qdeName = Object.keys(files).find((n) => n.toLowerCase().endsWith('.qde'))
  if (!qdeName) throw new Error('This .qdpx has no project.qde file.')
  const doc = new DOMParser().parseFromString(strFromU8(files[qdeName]), 'application/xml')
  const root = doc.documentElement
  if (root.localName !== 'Project') throw new Error('project.qde is not a REFI-QDA project.')
  const p = emptyProject(root.getAttribute('name') || fallbackName)
  p.importNotes.push(`Imported from REFI-QDA (${root.getAttribute('origin') || 'unknown application'}).`)
  const userName = new Map(Array.from(doc.getElementsByTagNameNS(NS, 'User')).map((u) => [u.getAttribute('guid') ?? '', u.getAttribute('name') ?? 'Imported coder']))

  // Codes: top-level codes with children become groups when the codebook looks grouped.
  const codes: Code[] = []
  const book = doc.getElementsByTagNameNS(NS, 'Codes')[0]
  const visit = (el: Element, parentId: string | null, groupId: string | null, i: number) => {
    const id = el.getAttribute('guid') || uid()
    const desc = kid(el, 'Description')?.textContent ?? ''
    codes.push({ id, name: el.getAttribute('name') || 'Code', groupId, parentId, color: el.getAttribute('color') || PALETTE[i % PALETTE.length], ...splitDefinition(desc) })
    kids(el, 'Code').forEach((k, j) => visit(k, id, groupId, i + j + 1))
  }
  const groups: CodeGroup[] = []
  for (const set of Array.from(doc.getElementsByTagNameNS(NS, 'Set'))) {
    groups.push({ id: set.getAttribute('guid') || uid(), name: set.getAttribute('name') || 'Set', kind: guessGroupKind(set.getAttribute('name') || ''), color: PALETTE[groups.length % PALETTE.length] })
  }
  if (book) kids(book, 'Code').forEach((c, i) => visit(c, null, null, i))
  for (const set of Array.from(doc.getElementsByTagNameNS(NS, 'Set'))) {
    const gid = set.getAttribute('guid')
    for (const m of kids(set, 'MemberCode')) { const c = codes.find((x) => x.id === m.getAttribute('targetGUID')); if (c && !c.groupId) c.groupId = gid }
  }
  if (!groups.length) {
    // Use top-level codes that have children as groups.
    for (const top of codes.filter((c) => !c.parentId && codes.some((k) => k.parentId === c.id))) {
      groups.push({ id: 'g-' + top.id, name: top.name, kind: guessGroupKind(top.name), color: top.color })
      top.groupId = 'g-' + top.id
    }
    if (!groups.length && codes.length) { groups.push({ id: uid(), name: 'Codes', kind: 'substantive', color: PALETTE[0] }); codes.forEach((c) => (c.groupId = groups[0].id)) }
  }
  p.groups = groups
  p.codes = codes
  p.rules = suggestedRules(groups)

  const vars = new Map(Array.from(doc.getElementsByTagNameNS(NS, 'Variable')).map((v) => [v.getAttribute('guid') ?? '', v.getAttribute('name') ?? '']))
  const coded: Coding[] = []
  const sources: Source[] = []
  for (const ts of Array.from(doc.getElementsByTagNameNS(NS, 'TextSource'))) {
    let text = kid(ts, 'PlainTextContent')?.textContent ?? ''
    const path = ts.getAttribute('plainTextPath')
    if (!text && path) {
      const rel = path.replace(/^internal:\/\//, '')
      const key = Object.keys(files).find((n) => n.endsWith('sources/' + rel) || n.endsWith('/' + rel) || n === rel)
      if (key) text = strFromU8(files[key]).replace(/\r\n?/g, '\n')
      else p.importNotes.push(`Source text for “${ts.getAttribute('name')}” is stored outside the archive and was not imported.`)
    }
    const s = newSource(ts.getAttribute('name') || 'Source', text, 'REFI-QDA')
    s.id = ts.getAttribute('guid') || s.id
    const f = codePointToUtf16(text)
    for (const vv of kids(ts, 'VariableValue')) {
      const name = vars.get(kid(vv, 'VariableRef')?.getAttribute('targetGUID') ?? '')
      const val = Array.from(vv.children).find((c) => c.localName !== 'VariableRef')?.textContent ?? ''
      if (name) s.attributes[name] = val
    }
    for (const sel of kids(ts, 'PlainTextSelection')) {
      const a = f(Number(sel.getAttribute('startPosition')))
      const b = f(Number(sel.getAttribute('endPosition')))
      for (const c of kids(sel, 'Coding')) {
        const codeId = kid(c, 'CodeRef')?.getAttribute('targetGUID')
        if (!codeId) continue
        coded.push({
          id: c.getAttribute('guid') || uid(), sourceId: s.id, codeId, start: a, end: b,
          coder: userName.get(c.getAttribute('creatingUser') ?? sel.getAttribute('creatingUser') ?? '') ?? 'Imported coder',
          memo: '', important: false, status: 'accepted', createdAt: c.getAttribute('creationDateTime') || now(),
        })
      }
    }
    if (text) { s.status = 'coding'; sources.push(s) }
  }
  const other = ['PDFSource', 'PictureSource', 'AudioSource', 'VideoSource'].reduce((n, t) => n + doc.getElementsByTagNameNS(NS, t).length, 0)
  if (other) p.importNotes.push(`${other} non-text sources (PDF, image, audio, video) were not imported.`)
  p.sources = sources
  p.codings = coded.filter((c) => codes.some((k) => k.id === c.codeId))
  const owners = [...new Set(p.codings.map((c) => c.coder))]
  if (owners[0]) p.coder = owners[0]
  p.cases = Array.from(doc.getElementsByTagNameNS(NS, 'Case')).map((k) => ({
    id: k.getAttribute('guid') || uid(), name: k.getAttribute('name') || 'Case',
    sourceIds: kids(k, 'SourceRef').map((r) => r.getAttribute('targetGUID') ?? '').filter((id) => sources.some((s) => s.id === id)),
    attributes: {},
  }))
  if (!p.cases.length) p.cases = sources.map((s) => ({ id: uid(), name: s.name, sourceIds: [s.id], attributes: { ...s.attributes } }))
  p.memos = Array.from(doc.getElementsByTagNameNS(NS, 'Note')).map((n): Memo => ({
    id: n.getAttribute('guid') || uid(), title: n.getAttribute('name') || 'Note', body: kid(n, 'PlainTextContent')?.textContent ?? '',
    kind: 'memo', sourceId: null, codeId: null, start: null, end: null,
    author: userName.get(n.getAttribute('creatingUser') ?? '') ?? '', updatedAt: n.getAttribute('modifiedDateTime') || now(),
  }))
  const desc = Array.from(root.children).find((c) => c.localName === 'Description')?.textContent
  if (desc) p.method = desc
  return p
}
