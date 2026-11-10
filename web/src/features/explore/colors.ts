import type { GroupKind } from '../../lib/types'

// Chart colours for the two single-choice code groups. Evidence grade is an
// ordered ramp (strongest first); stance diverges around a neutral middle.
// The tokens are defined for light and dark in styles/app.css.

const EVIDENCE = ['var(--viz-e1)', 'var(--viz-e2)', 'var(--viz-e3)', 'var(--viz-e4)']
const STANCE = ['var(--viz-s1)', 'var(--viz-s2)', 'var(--viz-s3)', 'var(--viz-s4)', 'var(--viz-s5)']

export function choiceColor(kind: GroupKind, index: number, count: number) {
  const ramp = kind === 'stance' ? STANCE : EVIDENCE
  if (index < 0) return 'var(--line-strong)'
  if (count <= ramp.length) return ramp[Math.min(index, ramp.length - 1)]
  // More options than steps: spread them across the ramp rather than inventing hues.
  return ramp[Math.round((index / (count - 1)) * (ramp.length - 1))]
}
