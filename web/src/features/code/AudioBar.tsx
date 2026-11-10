import { useEffect, useMemo, useRef, useState } from 'react'
import { FastForward, Pause, Play, Rewind } from 'lucide-react'
import type { Code, Coding, Source } from '../../lib/types'
import { formatTime, timeRange } from '../../lib/model'
import { getMedia } from '../../lib/storage'
import { onAudioEvent, registerAudio, seek, setRate, skip, toggle, usePlayer } from '../../lib/player'
import { IconButton, cx } from '../../components/ui'

const RATES = [0.75, 1, 1.25, 1.5, 2]

/** Transport and waveform for a source's recording, with coded passages drawn as a track. */
export function AudioBar({ projectId, source, codings, codes, focusCodeId }: { projectId: string; source: Source; codings: Coding[]; codes: Map<string, Code>; focusCodeId: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [missing, setMissing] = useState(false)
  const { time, playing, duration, rate } = usePlayer((s) => s)

  useEffect(() => {
    let alive = true
    let made: string | null = null
    setUrl(null); setPeaks(null); setMissing(false)
    getMedia(projectId, source.id).then((m) => {
      if (!alive) return
      if (!m) { setMissing(true); return }
      made = URL.createObjectURL(m.blob)
      setUrl(made)
      setPeaks(m.peaks)
    }).catch(() => alive && setMissing(true))
    return () => { alive = false; if (made) URL.revokeObjectURL(made); registerAudio(null) }
  }, [projectId, source.id])

  useEffect(() => { registerAudio(audioRef.current) }, [url])

  const total = duration || source.media?.duration || 0
  const tracks = useMemo(() => {
    if (!total) return []
    const seen = new Set<string>()
    const out: { a: number; b: number; color: string }[] = []
    for (const c of codings) {
      if (c.status !== 'accepted' || (focusCodeId && c.codeId !== focusCodeId)) continue
      const k = `${c.start}:${c.end}`
      if (!focusCodeId && seen.has(k)) continue
      seen.add(k)
      const r = timeRange(source, c.start, c.end)
      if (r) out.push({ a: r[0] / total, b: r[1] / total, color: codes.get(c.codeId)?.color ?? '#888' })
    }
    return out
  }, [codings, codes, focusCodeId, source, total])

  // Draw waveform + coded track.
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth
    const h = cv.clientHeight
    cv.width = w * dpr; cv.height = h * dpr
    const ctx = cv.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    const css = getComputedStyle(document.documentElement)
    const line = css.getPropertyValue('--line-strong').trim() || '#ccc'
    const accent = css.getPropertyValue('--accent').trim() || '#1f6f6b'
    const waveH = h - 8
    if (peaks?.length) {
      const bars = Math.floor(w / 2)
      for (let i = 0; i < bars; i++) {
        const p = peaks[Math.floor((i / bars) * peaks.length)] ?? 0
        const bh = Math.max(1, p * waveH * 0.95)
        ctx.fillStyle = total && i / bars <= time / total ? accent : line
        ctx.fillRect(i * 2, (waveH - bh) / 2, 1.2, bh)
      }
    } else {
      ctx.fillStyle = line
      ctx.fillRect(0, waveH / 2 - 1, w, 2)
      if (total) { ctx.fillStyle = accent; ctx.fillRect(0, waveH / 2 - 1, (time / total) * w, 2) }
    }
    for (const t of tracks) {
      ctx.fillStyle = t.color
      ctx.fillRect(t.a * w, h - 5, Math.max(2, (t.b - t.a) * w), 5)
    }
    if (total) {
      ctx.fillStyle = accent
      ctx.fillRect((time / total) * w - 0.5, 0, 1.5, h)
    }
  }, [peaks, tracks, time, total])

  if (missing) return null
  return (
    <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onTimeUpdate={(e) => onAudioEvent(e.currentTarget)}
          onPlay={(e) => onAudioEvent(e.currentTarget)}
          onPause={(e) => onAudioEvent(e.currentTarget)}
          onLoadedMetadata={(e) => onAudioEvent(e.currentTarget)}
        />
      )}
      <IconButton label="Back 5 seconds (Ctrl+←)" onClick={() => skip(-5)}><Rewind size={15} /></IconButton>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause (Ctrl+Space)' : 'Play (Ctrl+Space)'}
        title={playing ? 'Pause (Ctrl+Space)' : 'Play (Ctrl+Space)'}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink hover:brightness-110"
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
      </button>
      <IconButton label="Forward 5 seconds (Ctrl+→)" onClick={() => skip(5)}><FastForward size={15} /></IconButton>
      <span className="w-24 shrink-0 text-center font-mono text-xs tabular-nums text-muted">{formatTime(time) || '0:00'} / {formatTime(total) || '–'}</span>
      <canvas
        ref={canvasRef}
        className="h-9 min-w-0 flex-1 cursor-pointer"
        onClick={(e) => {
          if (!total) return
          const r = e.currentTarget.getBoundingClientRect()
          seek(((e.clientX - r.left) / r.width) * total, true)
        }}
        aria-label="Recording timeline. Click to seek."
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(time)}
      />
      <select
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        className={cx('h-7 shrink-0 rounded-md border border-line-strong bg-surface px-1 text-xs')}
        aria-label="Playback speed"
      >
        {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
    </div>
  )
}
