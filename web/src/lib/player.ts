import { Store, useSelector } from '@tanstack/react-store'
import { putMedia } from './storage'
import type { MediaInfo } from './types'

// One shared player for the Code view. The <audio> element registers itself;
// everything else (transcript, inspector, keyboard) talks to these functions.

interface PlayerState { time: number; playing: boolean; duration: number; rate: number; ready: boolean }

export const player = new Store<PlayerState>({ time: 0, playing: false, duration: 0, rate: 1, ready: false })
let el: HTMLAudioElement | null = null
let stopAt: number | null = null

export function registerAudio(a: HTMLAudioElement | null) {
  el = a
  if (!a) { player.setState(() => ({ time: 0, playing: false, duration: 0, rate: 1, ready: false })); return }
  a.playbackRate = player.state.rate
}

export function onAudioEvent(a: HTMLAudioElement) {
  if (stopAt != null && a.currentTime >= stopAt) { a.pause(); stopAt = null }
  player.setState((s) => ({
    ...s, time: a.currentTime, playing: !a.paused, duration: Number.isFinite(a.duration) ? a.duration : s.duration, ready: a.readyState >= 1,
  }))
}

export function seek(t: number, play = false) {
  if (!el) return
  el.currentTime = Math.max(0, Math.min(t, el.duration || t))
  stopAt = null
  if (play) void el.play()
}

export function toggle() {
  if (!el) return
  if (el.paused) {
    // Step back a little when resuming, as transcription tools do.
    if (el.currentTime > 2) el.currentTime -= 1.5
    void el.play()
  } else el.pause()
}

export function skip(by: number) { if (el) seek(el.currentTime + by, !el.paused) }

export function setRate(rate: number) {
  if (el) el.playbackRate = rate
  player.setState((s) => ({ ...s, rate }))
}

/** Plays a passage once, with a short lead-in. */
export function playRange(a: number, b: number) {
  if (!el) return
  el.currentTime = Math.max(0, a - 0.3)
  stopAt = b + 0.4
  void el.play()
}

export const hasPlayer = () => !!el

export function usePlayer<T>(sel: (s: PlayerState) => T) {
  return useSelector(player, sel)
}

// Attaching recordings --------------------------------------------------------

const PEAK_COUNT = 1600
const MAX_DECODE_BYTES = 160 * 1024 * 1024

function readDuration(url: string) {
  return new Promise<number | null>((resolve) => {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => resolve(null)
    a.src = url
  })
}

/**
 * Peaks for a waveform. Decodes at 3 kHz, which is plenty for a picture and keeps
 * a two-hour interview to roughly 100–200 MB while decoding. Very long or
 * undecodable recordings simply get a plain timeline.
 */
async function computePeaks(blob: Blob, duration: number | null): Promise<number[] | null> {
  if (typeof OfflineAudioContext === 'undefined' || blob.size > MAX_DECODE_BYTES * 4 || (duration ?? 0) > 3 * 3600) return null
  try {
    const ctx = new OfflineAudioContext(1, 1, 3000)
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    const data = buf.getChannelData(0)
    const step = Math.max(1, Math.floor(data.length / PEAK_COUNT))
    const peaks: number[] = []
    for (let i = 0; i < data.length; i += step) {
      let max = 0
      const end = Math.min(data.length, i + step)
      for (let j = i; j < end; j++) { const v = Math.abs(data[j]); if (v > max) max = v }
      peaks.push(Math.round(max * 1000) / 1000)
    }
    const top = Math.max(0.01, ...peaks)
    return peaks.map((p) => Math.round((p / top) * 1000) / 1000)
  } catch {
    return null
  }
}

export async function storeRecording(projectId: string, sourceId: string, file: File): Promise<MediaInfo> {
  const url = URL.createObjectURL(file)
  const duration = await readDuration(url)
  URL.revokeObjectURL(url)
  const peaks = await computePeaks(file, duration)
  await putMedia(projectId, sourceId, { blob: file, peaks })
  return { name: file.name, type: file.type || 'audio/mp4', size: file.size, duration }
}
