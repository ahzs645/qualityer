import { describe, expect, it } from 'vitest'
import { emptyProject, newSource, uid } from '../src/lib/model'
import { buildMatrix, mkey, patternOrder } from '../src/lib/matrix'
import type { Coding } from '../src/lib/types'

function study() {
  const p = emptyProject('M')
  const a = newSource('R1', 'one two three four five six'), b = newSource('R2', 'seven eight nine')
  p.sources = [a, b]
  p.groups = [{ id: 'g', name: '01 Capacity', kind: 'substantive', color: '#000' }, { id: 'st', name: 'S Stance', kind: 'stance', color: '#000' }]
  const code = (id: string, groupId: string, parentId: string | null = null) => ({ id, name: id, groupId, parentId, color: '#000', definition: '', include: '', exclude: '', anchor: '' })
  p.codes = [code('lab', 'g'), code('lab.kids', 'g', 'lab'), code('staff', 'g'), code('S1', 'st')]
  const on = (sourceId: string, start: number, end: number, codeId: string, status: Coding['status'] = 'accepted'): Coding => ({ id: uid(), sourceId, codeId, start, end, coder: 'X', memo: '', important: false, status, createdAt: '' })
  p.codings = [
    on(a.id, 0, 3, 'lab'), on(a.id, 0, 3, 'S1'), on(a.id, 4, 7, 'lab.kids'), on(a.id, 8, 13, 'staff'), on(a.id, 14, 18, 'staff'),
    on(b.id, 0, 5, 'staff'), on(b.id, 6, 11, 'lab', 'suggested'),
  ]
  return { p, a, b }
}

describe('who raised what', () => {
  it('counts people and passages per code, rolling child codes up and leaving pending claims out', () => {
    const { p, a, b } = study()
    const m = buildMatrix(p, 'code')
    expect(m.rows.map((r) => r.id)).toEqual(['lab', 'lab.kids', 'staff'])
    expect(m.cells.get(mkey('lab', a.id))!.claims.length).toBe(2)
    expect(m.cells.get(mkey('lab', b.id))!.claims.length).toBe(0)
    expect(m.reach.get('lab')).toBe(1)
    expect(m.reach.get('staff')).toBe(2)
    expect(m.totals.get(a.id)).toBe(4)
    expect(m.cells.get(mkey('staff', a.id))!.share).toBe(0.5)
    expect(m.cells.get(mkey('staff', b.id))!.share).toBe(1)
    expect(patternOrder(m).map((r) => r.id)).toEqual(['staff', 'lab', 'lab.kids'])
  })

  it('rolls codes up to groups', () => {
    const { p, a } = study()
    const m = buildMatrix(p, 'group')
    expect(m.rows.map((r) => r.id)).toEqual(['g'])
    expect(m.cells.get(mkey('g', a.id))!.claims.length).toBe(4)
  })
})
