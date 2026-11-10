import { Store, shallow, useSelector } from '@tanstack/react-store'
import type { Project, Snapshot } from './types'
import { now, uid } from './model'
import * as db from './storage'

// One open project at a time. Every change goes through `update`, which keeps
// an in-memory undo history and autosaves to IndexedDB shortly afterwards.

interface State {
  project: Project | null
  saving: 'idle' | 'pending' | 'saved' | 'error'
  error: string | null
  past: Project[]
  future: Project[]
  /** Short label of the change that `undo` would revert. */
  lastChange: string | null
}

export const store = new Store<State>({
  project: null, saving: 'idle', error: null, past: [], future: [], lastChange: null,
})

const HISTORY = 60
let saveTimer: ReturnType<typeof setTimeout> | undefined
const labels: string[] = []

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 400)
}

export async function flush() {
  clearTimeout(saveTimer)
  const p = store.state.project
  if (!p) return
  try {
    await db.saveProject(p)
    store.setState((s) => (s.project === p ? { ...s, saving: 'saved', error: null } : s))
  } catch (e) {
    store.setState((s) => ({ ...s, saving: 'error', error: e instanceof Error ? e.message : String(e) }))
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (store.state.saving === 'pending') { void flush(); e.preventDefault() }
  })
}

/** Applies a change to the open project. `label` names it in the undo button. */
export function update(label: string, fn: (p: Project) => Project) {
  store.setState((s) => {
    if (!s.project) return s
    const next = fn(s.project)
    if (next === s.project) return s
    labels.push(label)
    if (labels.length > HISTORY) labels.shift()
    return {
      ...s,
      project: { ...next, updatedAt: now() },
      past: [...s.past.slice(-(HISTORY - 1)), s.project],
      future: [],
      saving: 'pending',
      lastChange: label,
    }
  })
  scheduleSave()
}

export function undo() {
  store.setState((s) => {
    const prev = s.past[s.past.length - 1]
    if (!prev || !s.project) return s
    labels.pop()
    return {
      ...s, project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future],
      saving: 'pending', lastChange: labels[labels.length - 1] ?? null,
    }
  })
  scheduleSave()
}

export function redo() {
  store.setState((s) => {
    const [next, ...rest] = s.future
    if (!next || !s.project) return s
    return { ...s, project: next, past: [...s.past, s.project], future: rest, saving: 'pending' }
  })
  scheduleSave()
}

export async function openProject(id: string) {
  if (store.state.project?.id === id) return store.state.project
  await flush()
  const p = await db.loadProject(id)
  labels.length = 0
  store.setState(() => ({ project: p, saving: 'idle', error: null, past: [], future: [], lastChange: null }))
  return p
}

export async function createProject(p: Project) {
  await flush()
  await db.saveProject(p)
  labels.length = 0
  store.setState(() => ({ project: p, saving: 'saved', error: null, past: [], future: [], lastChange: null }))
  return p
}

export function closeProject() {
  void flush()
  store.setState(() => ({ project: null, saving: 'idle', error: null, past: [], future: [], lastChange: null }))
}

/** Saves a named copy of the current project. Taken automatically before bulk changes. */
export async function snapshot(label: string) {
  const p = store.state.project
  if (!p) return
  await flush()
  const snap: Snapshot = { id: uid(), projectId: p.id, label, createdAt: now(), data: p }
  await db.putSnapshot(snap)
  return snap
}

export async function restoreSnapshot(id: string) {
  const snap = await db.getSnapshot(id)
  const cur = store.state.project
  if (!snap || !cur) return
  await snapshot(`Before restoring “${snap.label}”`)
  update(`Restore ${snap.label}`, () => ({ ...snap.data, id: cur.id }))
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSelector(store, selector, { compare: shallow })
}

/** The open project. Routes under /p/$projectId guarantee it is loaded. */
export function useProject(): Project {
  const p = useSelector(store, (s) => s.project)
  if (!p) throw new Error('No project is open')
  return p
}
