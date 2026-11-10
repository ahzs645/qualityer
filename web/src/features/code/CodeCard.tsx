import type { Code } from '../../lib/types'
import { Swatch } from '../../components/ui'

/** A code's definition, inclusion and exclusion criteria and anchor example. */
export function CodeCard({ code, compact }: { code: Code; compact?: boolean }) {
  const rows: [string, string][] = [
    ['Include', code.include],
    ['Exclude', code.exclude],
    ['Anchor', code.anchor],
  ]
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start gap-2">
        <Swatch color={code.color} className="mt-1.5" />
        <h3 className="font-semibold leading-snug">{code.name}</h3>
      </div>
      {code.definition ? (
        <p className="whitespace-pre-wrap text-ink">{code.definition}</p>
      ) : (
        <p className="text-muted italic">No definition yet.</p>
      )}
      {!compact && rows.filter(([, v]) => v.trim()).map(([k, v]) => (
        <div key={k}>
          <div className="text-[11px] font-semibold tracking-wide text-faint uppercase">{k}</div>
          <p className={k === 'Anchor' ? 'whitespace-pre-wrap font-serif text-muted italic' : 'whitespace-pre-wrap text-muted'}>{v}</p>
        </div>
      ))}
    </div>
  )
}
