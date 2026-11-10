import type { Project, ProjectSummary, Snapshot } from './types'
import { migrate } from './migrate'

// Browser-local persistence. Everything stays in this browser's IndexedDB;
// use export to keep a copy or move a project elsewhere.

const DB_NAME = 'research-weave-web'
const VERSION = 2

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('snapshots')) {
        d.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('projectId', 'projectId')
      }
      if (!d.objectStoreNames.contains('media')) d.createObjectStore('media')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void) {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req ? req.result : (undefined as T))
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('Storage transaction aborted'))
  }))
}

export const summarize = (p: Project): ProjectSummary => ({
  id: p.id, name: p.name, updatedAt: p.updatedAt, sources: p.sources.length,
  codings: p.codings.filter((c) => c.status === 'accepted').length,
})

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<Project[]>('projects', 'readonly', (s) => s.getAll())
  return all.map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadProject(id: string): Promise<Project | null> {
  const p = await tx<Project | undefined>('projects', 'readonly', (s) => s.get(id))
  return p ? migrate(p) : null
}

export const saveProject = (p: Project) => tx('projects', 'readwrite', (s) => s.put(p))

export async function deleteProject(id: string) {
  const snaps = await listSnapshots(id)
  await tx('projects', 'readwrite', (s) => s.delete(id))
  await tx('media', 'readwrite', (s) => s.delete(IDBKeyRange.bound(id + ':', id + ':\uffff')))
  for (const sn of snaps) await tx('snapshots', 'readwrite', (s) => s.delete(sn.id))
}

export async function listSnapshots(projectId: string): Promise<Omit<Snapshot, 'data'>[]> {
  const all = await tx<Snapshot[]>('snapshots', 'readonly', (s) => s.index('projectId').getAll(projectId))
  return all
    .map(({ data: _data, ...rest }) => rest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const getSnapshot = (id: string) => tx<Snapshot | undefined>('snapshots', 'readonly', (s) => s.get(id))
export const putSnapshot = (s: Snapshot) => tx('snapshots', 'readwrite', (st) => st.put(s))
export const deleteSnapshot = (id: string) => tx('snapshots', 'readwrite', (s) => s.delete(id))

// Media blobs, keyed "projectId:sourceId". Peaks are cached alongside.
export interface StoredMedia { blob: Blob; peaks: number[] | null }
const mediaKey = (projectId: string, sourceId: string) => `${projectId}:${sourceId}`
export const getMedia = (projectId: string, sourceId: string) =>
  tx<StoredMedia | undefined>('media', 'readonly', (s) => s.get(mediaKey(projectId, sourceId)))
export const putMedia = (projectId: string, sourceId: string, m: StoredMedia) =>
  tx('media', 'readwrite', (s) => s.put(m, mediaKey(projectId, sourceId)))
export const deleteMedia = (projectId: string, sourceId: string) =>
  tx('media', 'readwrite', (s) => s.delete(mediaKey(projectId, sourceId)))
