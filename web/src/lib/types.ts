// Research Weave data model.
//
// Offsets everywhere are JavaScript string (UTF-16) indices into `Source.text`,
// zero-based with exclusive ends. Importers convert code-point offsets from
// QualCoder and earlier Research Weave exports on the way in.

export type ID = string

/** What a group of codes is for. Drives rule checks and how codes are shown. */
export type GroupKind = 'substantive' | 'evidence' | 'stance' | 'flag' | 'process' | 'other'

export interface CodeGroup {
  id: ID
  name: string
  kind: GroupKind
  color: string
  description?: string
}

export interface Code {
  id: ID
  name: string
  groupId: ID | null
  parentId: ID | null
  color: string
  definition: string
  include: string
  exclude: string
  anchor: string
}

/**
 * Declarative codebook rules, checked on every span coded with a code from a
 * "trigger" group. Modelled on ATLAS.ti semantic domains and Label Studio
 * `choice`/`maxUsages` constraints.
 *
 * - exactly-one / at-most-one: on the same span, the number of codes from
 *   `targetGroupId` must be exactly one / at most one.
 * - requires-extraction: each coding from the trigger group needs a row in the
 *   extraction table.
 */
export type RuleKind = 'exactly-one' | 'at-most-one' | 'requires-extraction'

export interface Rule {
  id: ID
  kind: RuleKind
  triggerGroupIds: ID[]
  targetGroupId: ID | null
  enabled: boolean
}

export interface Coding {
  id: ID
  sourceId: ID
  codeId: ID
  start: number
  end: number
  coder: string
  memo: string
  important: boolean
  /** `suggested` codings are proposals (AI or import) awaiting a decision. */
  status: 'accepted' | 'suggested'
  createdAt: string
}

export interface Speaker {
  /** Label as it appears in the transcript, e.g. "Speaker 1". */
  raw: string
  name: string
  role: 'respondent' | 'interviewer' | 'observer' | 'unknown'
}

export type SourceStatus = 'new' | 'reading' | 'coding' | 'done'

/** One speaker turn. `start`/`end` are offsets into the source text. */
export interface Segment {
  start: number
  end: number
  speaker: string
  /** Seconds from the start of the recording, when known. */
  time: number | null
  /** Low-confidence ASR word ranges, as absolute text offsets. */
  uncertain?: [number, number][]
}

export interface Source {
  id: ID
  name: string
  text: string
  attributes: Record<string, string>
  speakers: Speaker[]
  /** Supplied turn structure; when absent, turns are parsed from the text. */
  segments: Segment[] | null
  status: SourceStatus
  /** Character offset the reader has confirmed reading up to. */
  readTo: number
  importedFrom: string
  createdAt: string
}

export interface GuideQuestion {
  id: ID
  /** Short label used in the guide, e.g. "C1" or "M2". */
  key: string
  title: string
  prompt: string
  probes: string[]
  /** Empty for core questions; module name for optional modules. */
  module: string
  minutes: number | null
  codeIds: ID[]
}

/**
 * Coverage separates "never asked" from "asked, no view" so that an absent
 * code is not read as an absent opinion.
 */
export type CoverageStatus = 'unmarked' | 'answered' | 'partial' | 'no-view' | 'not-asked'

export interface CoverageMark {
  sourceId: ID
  questionId: ID
  status: CoverageStatus
  note: string
  start: number | null
  end: number | null
}

export interface Memo {
  id: ID
  title: string
  body: string
  kind: 'memo' | 'journal'
  sourceId: ID | null
  codeId: ID | null
  start: number | null
  end: number | null
  author: string
  updatedAt: string
}

export interface Case {
  id: ID
  name: string
  sourceIds: ID[]
  attributes: Record<string, string>
}

export interface Theme {
  id: ID
  title: string
  codeIds: ID[]
  interpretation: string
}

export interface FrameworkCell {
  caseId: ID
  themeId: ID
  summary: string
  /** Codings the researcher has pinned as the cell's key evidence. */
  pinned: ID[]
}

export interface Correction {
  id: ID
  find: string
  replace: string
  wholeWord: boolean
  caseSensitive: boolean
}

export interface Extraction {
  id: ID
  codingId: ID
  values: Record<string, string>
}

export interface Candidate {
  id: ID
  name: string
  rationale: string
  sourceId: ID | null
  start: number | null
  end: number | null
  status: 'open' | 'adopted' | 'merged' | 'parked'
  resolution: string
  proposedBy: string
  createdAt: string
}

export interface Project {
  id: ID
  name: string
  question: string
  method: string
  createdAt: string
  updatedAt: string
  coder: string
  sources: Source[]
  groups: CodeGroup[]
  codes: Code[]
  codings: Coding[]
  rules: Rule[]
  guide: GuideQuestion[]
  coverage: CoverageMark[]
  memos: Memo[]
  cases: Case[]
  themes: Theme[]
  cells: FrameworkCell[]
  glossary: Correction[]
  extractionFields: string[]
  extractions: Extraction[]
  candidates: Candidate[]
  importNotes: string[]
}

export interface ProjectSummary {
  id: ID
  name: string
  updatedAt: string
  sources: number
  codings: number
}

export interface Snapshot {
  id: ID
  projectId: ID
  label: string
  createdAt: string
  data: Project
}
