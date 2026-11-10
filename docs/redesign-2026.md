# Research Weave redesign (2026)

The rebuilt app lives in [`web/`](../web). It is a Vite 8 single-page app using TanStack Router (file-based routes), TanStack Table, TanStack Virtual and TanStack Store. Projects are stored in the browser's IndexedDB. The original app at the repository root is unchanged, and still carries the features that have not been ported yet (see [Not yet ported](#not-yet-ported)).

## Why rebuild

Three problems with the original interface came up when reviewing it against a real, private study (a QualCoder calibration project and a two-recording Framework analysis, not included here):

- **Too many destinations.** The sidebar had about 20 entries: overview, research question, sources, source review, speaker review, workspace, memos, study structure, cases, framework analysis, evidence and interpretations, processing desk, review, visualizations, analysis workbench, explore, team, services, examples and feature audit. Several of them overlapped.
- **The transcript was buried.** On the coding screen, four stacked control rows (settings, passage tools, display options, colour key) pushed the transcript below the fold.
- **Hedging copy everywhere.** Caveats such as "Saved activity records progress; it does not establish quality" appeared on almost every card. That made the screens hard to scan and diluted the warnings that do matter.

The source was also hard to change. `src/app.jsx` was 84 KB spread over 170 lines, and the static demo shipped a 1.5 MB main bundle. The rebuild's main bundle is 225 KB (71 KB gzipped), and each screen loads as its own chunk.

## Information architecture

Nine destinations, plus Settings:

| Screen | What it is for |
|---|---|
| **Overview** | Per-source progress (read, coded, guide coverage, rule issues), a "needs attention" list, and a chart of codes first applied in each interview |
| **Sources** | Add transcripts (`.txt`, `.srt`, `.vtt`, Whisper JSON, pasted text), rename them, and edit attributes in a grid *before* coding |
| **Code** | Three panes: the codebook tree, a virtualised transcript, and an inspector for the selected passage or the source |
| **Codebook** | Sortable code table, a code editor (definition / include / exclude / anchor, with coded examples, merge and delete), groups and rules, CSV import and export, and REFI-QDA `.qdc` export |
| **Guide & coverage** | Interview guide editor (imports Markdown guides), a coverage matrix of questions against interviews, and a codes-by-interview grid |
| **Review** | Rule issues, suggestions awaiting a decision, the transcript correction glossary, candidate codes, and intercoder agreement |
| **Framework** | A case × theme matrix. Selecting a cell shows the passages coded with the theme's codes beside a summary editor, with pinning and CSV export |
| **Retrieve** | Filter coded passages by code (any, or co-occurring), source, attribute, coder, key passages and text. Results show context and export to CSV |
| **Memos** | Analytic memos and journal entries, optionally linked to a passage or a code |
| **Settings & export** | Study details, coder name, named snapshots, whole-study JSON export, import notes |

## Features driven by a real study's materials

| Need in the study | How the rebuild handles it |
|---|---|
| "Every substantive claim has exactly one evidence grade; stance only where a position is expressed" | Code **groups** have a *kind* (substantive, evidence, stance, flag, process). **Rules** such as *exactly one* / *at most one* code from a group per span are checked continuously. The coding popover shows what the passage still needs, and the inspector confirms when a passage meets the rules |
| "A cost-benefit flag with no extraction row is a lost figure" | A *requires-extraction* rule, plus extraction fields filled in directly from the passage inspector |
| Code memos written as definition / INCLUDE / EXCLUDE / ANCHOR | Imported into separate fields. The code card appears beside the coding popover, and include/exclude criteria show when hovering a code in the tree |
| A semi-structured guide with core questions and optional modules | Markdown guides import directly: headings such as `## C1 — Vantage · 2 min`, blockquoted prompts and bulleted probes |
| "An uncoded domain may mean the question was never asked" | Coverage is recorded per interview and question as *answered*, *partly*, *asked, no view* or *not asked*. A passage can be linked as the answer. Questions can list the codes they are expected to produce |
| Institution, place and Nation names misheard by the ASR | A **correction glossary** previews every match. Applying it takes a snapshot first and moves code, memo, coverage and candidate anchors along with the text. Single passages can be corrected from the inspector |
| Diarisation problems and speaker keys | A per-source speaker map (label → name and role). Interviewer turns can be dimmed |
| Snapshots before bulk migrations | Named snapshots, taken automatically before applying corrections, merging codes and restoring. Every edit can also be undone (⌘Z / ⇧⌘Z) |
| Claim-level excerpts | Selections snap to whole words. Existing codes can be extended to the whole sentence in one click |
| Inductive log settled at the reconciliation meeting | **Candidate codes** are logged from a passage and later adopted, merged or parked, with the decision recorded |
| "Important segments" stored query | A key-passage star on codings, and a *key passages only* filter in Retrieve |
| Second coder for intercoder agreement | Coder name in Settings. Character-level overlap and Cohen's κ per code, and pooled per group |
| Low-confidence ASR words | Word probabilities from Whisper JSON and earlier exports appear as wavy underlines |

## Ideas taken from other tools

A survey of open-source and commercial qualitative and annotation tools (November 2026) shaped these choices. QualCoder, Taguette, Requal, OpenQDA, Sift and AQDA were already audited under `docs/repository-audits/` and were not repeated.

| Source | Idea adopted |
|---|---|
| ATLAS.ti semantic domains; Label Studio `choice` / `maxUsages`; INCEpTION constraints | Groups with cardinality rules |
| INCEpTION recommenders | Suggestions are inert until accepted, and accepting or rejecting takes one action |
| INCEpTION document states | Source status (new → reading → coding → done), with a warning when a source with rule issues is marked done |
| MAXQDA Summary Grid; NVivo framework matrices | The three-part Framework view: grid, cell evidence, summary |
| transcribee realignment; noScribe | Transcript corrections that keep anchors; uncertain-word display |
| aicoe run manifests; LLMCode caching; oTranscribe autosave | Snapshots, autosave and undo history |
| doccano and INCEpTION guidelines | The codebook card one hover or keystroke away while coding |

## Imports verified against real files

These were checked locally. The files are private and not committed.

- **QualCoder 4 project** (zipped `.qda` folder): categories became groups and every code and coding came through, matching the counts in the project's own notes. With the suggested rules, the evidence-grade check agrees with the project's manual coding review. Cost-benefit flags are reported as missing extraction rows because those rows were kept in a separate spreadsheet.
- **Markdown interview guide**: all core and module questions imported, with prompts, probes and timings.
- **Research Weave v1 complete-study export** (about 300 MB zip): the archive has no central directory, because it ends partway through the second recording. The importer reads entries from their local headers and recovered the study in about 2 seconds, including Framework themes, cell summaries and word-level confidence.

## Added in the second pass

- **Audio.** Attach a recording to a source; it is stored in the browser alongside the project.
  - A player bar shows the waveform, decoded at 3 kHz, with coded passages as coloured tracks under it.
  - Clicking a turn's timestamp seeks to it. The turn being spoken is highlighted, and "Follow audio" scrolls the transcript along.
  - Ctrl+Space plays and pauses; Ctrl+←/→ skip five seconds; resuming steps back 1.5 s.
  - A passage can be played on its own and marked "wording checked against audio".
  - Word timings from Whisper JSON and v1 exports give word-level seeking.
- **Speakers.** Every turn's speaker label is a menu for reassigning the turn, including unlabelled machine-transcript turns. For "[mm:ss]  Speaker" transcripts the header text is rewritten and every anchor moves with it.
- **AI assist** (`web/src/lib/ai/`). See the next section.
- **Review queue.** Suggestions come in priority order: repaired quotes first, then conflicts with human coding, then the least confident.
  - *One by one* takes keys A / X / Space / ← / Backspace (undo), and a suggestion can be accepted as a different code.
  - *In bulk* groups by code with a confidence filter.
  - An accepted AI coding keeps the AI as coder and records the reviewer, so calibration and provenance stay honest.
- **Imports and exports.**
  - New source formats: Word, ODT, PDF (text layer only), HTML and RTF.
  - REFI-QDA `.qdpx` projects can be imported and exported.
  - Requal, RQDA, AQDA and Taguette databases go through the original app's importers, loaded on demand.
- **Explore.** Four views:
  - a co-occurrence heatmap, where clicking a cell retrieves the passages with both codes;
  - a code network;
  - code lanes per group across each interview;
  - frequent words in coded passages.
- **Team without a server.** Each coder codes their own copy and exports it. Settings → *Merge a colleague's copy* takes a set union of codings, memos and candidate codes, merging only sources whose text is identical and taking a snapshot first. *Only my coding* hides other coders' work for blind coding.
- **Source inspector redesign.** Collapsible sections, speaker cards with role pills and share of talk, and attributes that wrap and can be edited in place.

## Added in the third pass: reviewing AI coding as a person

This pass came from doing the review rather than designing it: a reviewer went through every AI-coded claim of a real 104-minute interview in the app, and each thing they could not do became a feature.

- **Review by claim** (`web/src/features/review/Claims.tsx`, `web/src/lib/claims.ts`). The codebook reads a passage as one claim: a substantive code, one evidence grade, one stance, perhaps a flag. The old queue showed one code at a time, so 415 suggestions meant 415 cards with the grade and stance of each claim scattered among them. Review → AI review now opens on *By claim*:
  - one card per passage with everything proposed for it, the AI's reason for each code and the codebook entry beside it;
  - evidence grade and stance are radio rows on number keys (the AI's own choice stays marked), `↵` confirms, `X` rejects, `Space` skips;
  - a code can be changed or removed, another added, the passage's edges moved a word at a time or snapped to the sentence, an extraction row filled in for a flag, and a reviewer note written, all without leaving the card;
  - the queue separates *needs a decision*, *accepted, not checked by you* and *checked by you*. A bulk acceptance by an assistant or a colleague is therefore still visibly unread by the person now reviewing.
- **Decision log** (`Project.reviewLog`). Every accept, confirm, code change, rejection, addition and boundary move is recorded with the reviewer, the time, the AI's confidence and any note. Rejecting a suggestion deletes the coding, so the log is the only place it stays visible. When a reviewer changes a code the coding becomes theirs, and the log keeps what the AI proposed. Review → Decision log shows it and exports CSV.
- **Comparison-only passes** (`AiRun.comparisonOnly`). A pass run over an interview a person already coded is a calibration check, not new coding. Marking it comparison-only takes its suggestions out of the queue, the badges and the transcript, and keeps them for Explore → AI and you.
- **Off the record** (`Project.restricted`). A passage can be marked off the record from the claim card or the Code inspector. Its codes stay in the analysis, the transcript underlines it, and its wording is replaced by “[withheld — off the record]” in the report, the framework and Retrieve CSVs, the claims table and the decision log. The mark moves with transcript corrections.
- **Explore** has three new views, and opens on the first:
  - *Interview map*: one interview from start to end as lanes for who is speaking, where each guide question was answered, each code group, evidence grade, stance, review state and off-the-record passages, on a time axis with zoom. Every mark opens the passage.
  - *Cases by domain*: a domain × case table giving the number of claims and two bars, how they were graded and what stance they took.
  - *AI and you*: against a person's coding of the same interview, precision and recall on substantive codes, a clickable confusion matrix for each single-choice group, and per-domain bars of both / person only / AI only; and, for reviewed interviews, what review changed, by confidence, with the most frequent corrections.
- **Report** (`web/src/lib/report.ts`, new *Report* screen). One document built from the project alone: sources, guide coverage, the framework matrix with pinned quotes and grade bars, cases by domain, code counts, flagged figures with their extraction rows, the AI audit (passes, calibration matrices, review outcome), open items, memos and optionally the codebook. It downloads as a self-contained HTML page (prints to PDF) or Markdown; a claims table (one row per coded passage) and the decision log download as CSV.

Chart colours are tokens in `styles/app.css`: an ordered teal ramp for evidence grade, a blue-to-red scale around neutral grey for stance, and status colours (always with a label) for review state. The evidence ramp was run through a palette checker for lightness order and contrast in both themes.

### What the review of a real interview showed (aggregate numbers only)

A reviewer checked all 132 AI-coded claims (415 codings) of the second interview, using the analyst's own coding of the first interview as the standard.

- 88% of the AI's codings were kept as proposed, 9% were given a different code and 2% were rejected. Low-confidence suggestions were kept 55% of the time, against about 90% for medium and high.
- Almost every change was to evidence grade or stance, in the two directions the calibration matrix had predicted: "neutral" to "sceptical" or "supportive", and "opinion" to "firsthand". One substantive code was changed.
- Two passages the respondent had called off the record were among the coded claims, and one was pinned as framework evidence. Nothing in the earlier interface could have kept them out of an export.
- Two cost-benefit flags were removed and two were given extraction rows.

## AI-assisted coding pipeline

Design decisions are drawn from published LLM-coding studies (Xiao et al. 2023; LACA; QualiGPT; MindCoder; ChatQDA) and labelling tools (Prodigy, Argilla, INCEpTION):

1. **Windows of speaker turns.** Turns get stable IDs (`T0042`). Each request holds 8–40 *target* turns, which may be coded, plus a few read-only *context* turns. Interviewer turns are skipped when roles are set.
2. **The codebook is the prompt.** It carries each code's definition, include/exclude criteria and an anchor example, plus the research question, method, interview guide and codebook rules. The one-shot example comes from a human coding in another source, never from the source being coded, so a pass over an already-coded interview is a fair calibration. Codes are shown as `C001…`, never internal IDs. On the Claude API the system prompt is cached.
3. **Structured output.** Each suggestion is `{code_id, turn_id, quote, rationale, criterion, confidence: high|medium|low}`.
4. **Local quote verification.** The browser normalises case, whitespace and quote marks and looks for the quote inside the named turn:
   - an exact match becomes a suggestion;
   - a near match (≥ 88% similarity) becomes a suggestion flagged *repaired*;
   - an ellipsis, an unknown code, a non-target turn or a missing quote is rejected and logged.
5. **Run manifest.** Each pass records the model, prompt hash, codebook hash, options, windows, failures, repairs and rejected quotes.
6. **Three ways to run it:**
   - the Claude API from the browser (structured outputs, refusal fallback where the model supports it);
   - a local OpenAI-compatible model such as Ollama, so transcripts stay on the machine;
   - an **agent hand-off**: download a prompt pack, have an agent or other tool answer it, import the answers. The same checks run on import.
7. **Calibration before trust.** AI assist compares a pass with a human coder per code group (character-level overlap and κ), including unreviewed suggestions. Lean on suggestions only for groups that reach your human-to-human agreement.

### Calibration on a real interview (aggregate numbers only)

The hand-off loop was run end to end on a private 68-minute calibration interview. That interview had already been coded by an analyst using a 118-code framework: 10 substantive domains, plus evidence-grade, stance and cost-benefit groups. The coder was an agent working only from the prompt pack, which held 10 windows of 16 turns.

- **Quote checks.** Every quote matched the transcript verbatim in both passes (0 repaired, 0 rejected).
- **Pass 1**, with stance set to *at most one*:
  - substantive codes: precision 0.64 and recall 0.56 against the analyst (overlapping span, same code);
  - κ per domain: 0.19–0.46;
  - stance recall: 0.03, because the analyst applied a stance to every claim.
- **Pass 2**, with stance set to *exactly one* to match the analyst's protocol:
  - substantive codes: precision 0.71, recall 0.59;
  - evidence grade: κ 0.25 → 0.36;
  - stance: recall 0.03 → 0.44, κ 0.04 → 0.27.
- **Remaining systematic differences:**
  - The model over-used "opinion" against "firsthand" evidence grades.
  - It rarely chose "sceptical" stance and defaulted to "neutral".

  Both are boundaries to sharpen in the codebook's definitions before trusting suggestions for those groups.

Bugs this run uncovered, all fixed:
- A hand-off run could be lost if the tab closed before autosave.
- Suggestions agreeing with a human coding were dropped, which hid agreement.
- Passes shared one coder name.
- The window count left out codes that inherit their group.

## Still not ported

- **Speech-to-text and diarisation inside the app.** Transcribe with Whisper / WhisperX / noScribe and import the JSON. `services/transcription` is unchanged.
- **OCR for scanned PDFs and images.**
- **Server sync and permissions.** The Cloudflare Worker + D1/R2 backend has not been reconnected.
- **Older Framework-continuation and consent-scope records from v1.** These are not imported.
