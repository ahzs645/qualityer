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

## Not yet ported

These features exist in the original app but are not in `web/` yet:

- **Audio:** playback synchronised with the transcript, waveform display, and the transcription and diarisation service (`services/transcription`).
- **AI:** generating code suggestions. The review queue for suggested codings exists; nothing produces suggestions yet.
- **Team server:** sync, permissions and blind coding (Cloudflare Worker + D1/R2). The rebuild stores projects in the browser only.
- **Other imports and exports:** PDF/OCR, DOCX/ODT/EPUB/RTF and REFI-QDA project (`.qdpx`) imports, and the Requal, RQDA, AQDA and Taguette importers.
- **Visualisations:** co-occurrence network, word cloud, coverage profiles.

Recommended next steps, in order:

1. Audio playback with click-to-seek and an "audio verified" mark on quotes.
2. Few-shot AI suggestions grounded in the codebook definitions, the guide and the research question, with mandatory verbatim-quote checks.
3. Server sync, reusing the existing Worker.
4. The remaining importers, through a shared adapter from the old state format.
