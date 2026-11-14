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
  /** When the quoted wording was checked against the recording. */
  verifiedAt?: string | null
  /** Model confidence (0–1) for suggestions. */
  confidence?: number
  /** Why a suggestion was made, shown in review. */
  rationale?: string
  /** For AI suggestions: the run that produced it and how the quote matched the transcript. */
  origin?: { runId: string; match: 'exact' | 'repaired' } | null
  /** Who accepted a suggestion (AI codings keep the AI as coder for provenance). */
  reviewedBy?: string | null
}

/** Manifest of one AI coding pass, kept for the audit trail. */
export interface AiRun {
  id: string
  startedAt: string
  finishedAt: string | null
  provider: 'anthropic' | 'openai' | 'agent'
  model: string
  promptHash: string
  codebookHash: string
  sourceIds: string[]
  codeIds: string[]
  windows: number
  completed: number
  failed: string[]
  suggestions: number
  repaired: number
  rejected: { windowId: string; quote: string; codeId: string; reason: string }[]
  notes: string
  /** Prompt code key (C001…) → code id, so responses can be matched later. */
  codeKeys: Record<string, string>
  options: { windowSize: number; contextTurns: number; respondentOnly: boolean; effort: string }
  /**
   * A pass kept only to compare the model with a human coder (calibration).
   * Its unreviewed suggestions stay out of the review queue and the counts.
   */
  comparisonOnly?: boolean
  /**
   * Fingerprint of each source's turns (how many, and who speaks each) when
   * the pass was prepared. Windows and turn ids are positional, so answers to a
   * hand-off can only be read against the same turns.
   */
  turnsHash?: string
  /** `grades` passes grade existing claims (evidence, stance) and find no new ones. */
  kind?: 'coding' | 'grades'
  /** Grade passes: prompt claim id → the claim's passage in the source. */
  claims?: Record<string, [number, number]>
  gradeOptions?: { mode: 'held-out' | 'ungraded'; reference: string; teachShare: number; examples: number }
}

/**
 * One reviewer decision on a coding, kept so the study can show what the AI
 * proposed, what a person changed and why. Rejecting a suggestion deletes the
 * coding, so this log is the only record of it afterwards.
 */
export type ReviewAction = 'accept' | 'confirm' | 'recode' | 'reject' | 'add' | 'remove' | 'respan' | 'restrict' | 'unrestrict' | 'endorse'

export interface ReviewEvent {
  id: ID
  at: string
  by: string
  action: ReviewAction
  sourceId: ID
  start: number
  end: number
  codingId: ID | null
  /** The code the decision was about (for `recode`, the code before the change). */
  codeId: ID | null
  toCodeId?: ID | null
  /** True when the coding came from an AI pass. */
  ai: boolean
  runId?: string | null
  confidence?: number | null
  /** Who had accepted it before this decision, e.g. an assistant's bulk review. */
  priorReviewer?: string | null
  note?: string
}

/** A passage the respondent asked to keep off the record. Quotes that touch it are withheld from reports and exports. */
export interface Restriction {
  id: ID
  sourceId: ID
  start: number
  end: number
  reason: string
  by: string
  at: string
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
  /** Word start times as [text offset, seconds], ascending. */
  words?: [number, number][]
}

/** An audio or video recording attached to a source. The bytes live in IndexedDB. */
export interface MediaInfo {
  name: string
  type: string
  size: number
  duration: number | null
}

export interface Source {
  id: ID
  name: string
  text: string
  attributes: Record<string, string>
  speakers: Speaker[]
  /** Supplied turn structure; when absent, turns are parsed from the text. */
  segments: Segment[] | null
  media: MediaInfo | null
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

/** A second transcription of one coded passage, kept to show where two machine readings disagree. */
export interface WordingCheck {
  sourceId: ID
  start: number
  end: number
  /** What the other transcription heard. */
  other: string
  /** Share of the transcript's words the other transcription also has, in order (0–1). */
  agreement: number
  model?: string
}

/** A question asked of every interview ("Ask across interviews"). Refining makes a new version. */
/**
 * Where a question lives. "topic" questions are about what the interview is
 * about. "asides" questions isolate passages that sit outside it, such as
 * remarks to the interviewer, comments on the questions, advice to the team or
 * requests not to be quoted. They are kept apart from the topic analysis.
 */
export type AskArea = 'topic' | 'asides'

export interface AskPrompt {
  id: ID
  title: string
  text: string
  area: AskArea
  /** Answers may hold passages the participant asked to keep off the record: reports give counts, never quotes. */
  sensitive?: boolean
  /** 1 for a new question, then 2, 3… for refinements; `parentId` is the version it was refined from. */
  version: number
  parentId: ID | null
  /** Send the whole transcript, or only respondent turns (interviewer questions stay as context either way). */
  scope: 'all' | 'respondent'
  /** Replace masked names (Review → Names) before the transcript leaves the browser. */
  maskNames: boolean
  createdAt: string
  /** What changed from the previous version, and why. */
  note: string
}

export interface AskEvidence {
  turnId: string
  quote: string
  /** Where the quote was found in the transcript; absent when it was not found. */
  start?: number
  end?: number
  match: 'exact' | 'repaired' | 'not-found'
}

/** One interview's answer to a question. */
export interface AskAnswer {
  id: ID
  promptId: ID
  sourceId: ID
  text: string
  evidence: AskEvidence[]
  /** The model said the interview does not address the question. */
  notAddressed: boolean
  model: string
  at: string
  /** The researcher's judgement of the answer, used when refining the question. */
  rating: 'good' | 'partly' | 'off' | null
  reviewNote: string
}

export type NameKind = 'person' | 'organisation' | 'place' | 'other'

/**
 * A name that occurs in the transcripts: a person, organisation, place or
 * anything else that could identify someone. All its spellings (short forms,
 * misheard machine transcriptions) are listed so every mention is found, and
 * `replacement` stands in for it in quotes and exports when anonymising.
 */
/**
 * Who a named person is in the study: a participant, a member of the research
 * team (an interviewer or a colleague in the room), or someone mentioned.
 */
export type NameRole = 'participant' | 'team' | 'mentioned'

/** A speaker in one interview, as labelled in its speaker list. */
export interface SpeakerRef { sourceId: ID; raw: string }

export interface NameEntry {
  id: ID
  name: string
  variants: string[]
  kind: NameKind
  /** For people. Unset means inferred from linked speakers or the stand-in (see roleOf). */
  role?: NameRole
  /** The speakers this person is, interview by interview, so a name and a voice are known to be the same person. */
  speakers?: SpeakerRef[]
  /** e.g. "[R01]", "[Colleague 1]", "[a health authority]". */
  replacement: string
  /** Replace this name in reports and exports when the study is anonymised. */
  mask: boolean
  /** Match capitals exactly, so "Gray" is masked and "gray" is not. */
  caseSensitive: boolean
  note: string
}

/** The reviewer's sign-off that the analysis is final. */
export interface SignOff {
  by: string
  /** Whether a person signed, or an AI standing in for the human reviewer. Reports say which. */
  role: 'person' | 'ai'
  at: string
  note: string
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
  aiRuns: AiRun[]
  reviewLog: ReviewEvent[]
  restricted: Restriction[]
  wordingChecks: WordingCheck[]
  /** Questions asked of every interview, with their versions. */
  asks: AskPrompt[]
  askAnswers: AskAnswer[]
  /** Names register: people, organisations and places found in the transcripts. */
  names: NameEntry[]
  /** Candidates ruled out as names, so they are not suggested again. */
  notNames: string[]
  /** Replace masked names in reports and exports (quotes, source names, summaries, memos). */
  anonymise: boolean
  /** Set when the reviewer signs the analysis off as final; reports then read as final. */
  signoff: SignOff | null
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
