import type { CoverageStatus } from '../../lib/types'

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  unmarked: 'Not marked',
  answered: 'Answered',
  partial: 'Partly',
  'no-view': 'Asked, no view',
  'not-asked': 'Not asked',
}

export const COVERAGE_STYLE: Record<CoverageStatus, string> = {
  unmarked: 'bg-sunken text-faint',
  answered: 'bg-good-soft text-good',
  partial: 'bg-warn-soft text-warn',
  'no-view': 'bg-accent-soft text-accent',
  'not-asked': 'bg-bad-soft text-bad',
}

export const COVERAGE_ORDER: CoverageStatus[] = ['unmarked', 'answered', 'partial', 'no-view', 'not-asked']
