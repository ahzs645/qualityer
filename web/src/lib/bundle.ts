import { strToU8, zipSync, type Zippable } from 'fflate'
import type { Project } from './types'
import { getMedia, putMedia, type StoredMedia } from './storage'

// A whole study with its recordings, as one zip: `research-weave.json` plus
// `media/<sourceId>` (the recording, stored without compression since audio
// already is compressed) and `media/<sourceId>.peaks.json` (the waveform).
// The JSON export alone leaves recordings behind in this browser.

export async function exportStudyZip(project: Project): Promise<{ bytes: Uint8Array; recordings: number; missing: string[] }> {
  const files: Zippable = { 'research-weave.json': strToU8(JSON.stringify(project)) }
  let recordings = 0
  const missing: string[] = []
  for (const s of project.sources) {
    if (!s.media) continue
    const m = await getMedia(project.id, s.id)
    if (!m) { missing.push(s.name); continue }
    files[`media/${s.id}`] = [new Uint8Array(await m.blob.arrayBuffer()), { level: 0 }]
    if (m.peaks) files[`media/${s.id}.peaks.json`] = strToU8(JSON.stringify(m.peaks))
    recordings++
  }
  return { bytes: zipSync(files, { level: 6 }), recordings, missing }
}

/** Recordings found in an archive, keyed by source id, ready to store once the project is created. */
export function recordingsFrom(files: Record<string, Uint8Array>, project: Project): Record<string, StoredMedia> {
  const out: Record<string, StoredMedia> = {}
  const peaksOf = (id: string) => {
    const f = Object.keys(files).find((n) => n.endsWith(`media/${id}.peaks.json`))
    try { return f ? (JSON.parse(new TextDecoder().decode(files[f])) as number[]) : null } catch { return null }
  }
  for (const s of project.sources) {
    const f = Object.keys(files).find((n) => n.endsWith(`media/${s.id}`))
    if (f && s.media) out[s.id] = { blob: new Blob([files[f] as BlobPart], { type: s.media.type }), peaks: peaksOf(s.id) }
  }
  return out
}

export async function storeRecordings(projectId: string, media: Record<string, StoredMedia>) {
  for (const [sid, m] of Object.entries(media)) await putMedia(projectId, sid, m)
}
