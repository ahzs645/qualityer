import { describe, expect, it } from 'vitest'
import { emptyProject, newSource, uid } from '../src/lib/model'
import { buildPositions, median, verdictOf } from '../src/lib/positions'
import { running } from '../src/features/explore/Positions'
import type { Coding } from '../src/lib/types'

describe('convergence labels', () => {
  it('reads sides of a five-step stance scale', () => {
    expect(verdictOf([null, null], 5)).toBe('silence')
    expect(verdictOf([2, 2, null], 5)).toBe('descriptive')
    expect(verdictOf([0, 2], 5)).toBe('single')
    expect(verdictOf([0, 1, 1.5], 5)).toBe('agreement')
    expect(verdictOf([0, 1, 2], 5)).toBe('partial')
    expect(verdictOf([0, 3], 5)).toBe('dissonance')
  })

  it('takes medians and running averages', () => {
    expect(median([])).toBeNull()
    expect(median([3, 0, 1])).toBe(1)
    expect(median([0, 1, 3, 4])).toBe(2)
    expect(running([0, 0, 3, 3], 3)).toEqual([0, 1, 2, 3])
  })
})

describe('positions by theme', () => {
  it('places each person once, leaves pending claims out and tells not asked from not raised', () => {
    const p = emptyProject('P')
    const a = newSource('R1', 'We have a lab. Staff leave. A hub would help.'), b = newSource('R2', 'Nothing about labs here.'), c = newSource('R3', 'Also nothing.')
    p.sources = [a, b, c]
    p.groups = [{ id: 'sub', name: '01 Capacity', kind: 'substantive', color: '#000' }, { id: 'st', name: 'S Stance', kind: 'stance', color: '#000' }, { id: 'ev', name: 'E Evidence', kind: 'evidence', color: '#000' }]
    const code = (id: string, groupId: string) => ({ id, name: id, groupId, parentId: null, color: '#000', definition: '', include: '', exclude: '', anchor: '' })
    p.codes = [code('lab', 'sub'), code('S1', 'st'), code('S2', 'st'), code('S3', 'st'), code('S4', 'st'), code('S5', 'st'), code('E1', 'ev'), code('E2', 'ev')]
    p.themes = [{ id: 't', title: '01 Capacity', codeIds: ['lab'], interpretation: '' }]
    const on = (sourceId: string, start: number, end: number, codeId: string, status: Coding['status'] = 'accepted'): Coding => ({ id: uid(), sourceId, codeId, start, end, coder: 'X', memo: '', important: false, status, createdAt: '' })
    p.codings = [
      on(a.id, 0, 14, 'lab'), on(a.id, 0, 14, 'S1'), on(a.id, 0, 14, 'E2'),
      on(a.id, 15, 26, 'lab'), on(a.id, 15, 26, 'S4'),
      on(a.id, 27, 45, 'lab'), on(a.id, 27, 45, 'S1'),
      on(b.id, 0, 7, 'lab', 'suggested'), on(b.id, 0, 7, 'S5', 'suggested'),
    ]
    p.guide = [{ id: 'q', key: 'C1', title: 'Capacity', prompt: '', probes: [], module: '', minutes: 1, codeIds: ['lab'] }]
    p.coverage = [{ sourceId: c.id, questionId: 'q', status: 'not-asked', note: '', start: null, end: null }]
    const pos = buildPositions(p)
    const row = pos.rows[0]
    expect(pos.people.map((x) => x.label)).toEqual(['R1', 'R2', 'R3'])
    expect(row.people[0].stances.sort()).toEqual([0, 0, 3])
    expect(row.people[0].median).toBe(0)
    expect(row.people[0].grades).toEqual([1, -1, -1])
    expect(row.people[1].absent).toBe('not-raised')
    expect(row.people[2].absent).toBe('not-asked')
    expect(row.raised).toBe(1)
    expect(row.strong).toBe(1)
    expect(row.verdict).toBe('single')
  })
})
