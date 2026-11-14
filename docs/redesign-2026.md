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

## Added in the fourth pass: closing out the review

The reviewer then worked through everything the first review had left open, again in the app. Four more gaps showed up.

- **Extraction rows from the issue list.** Review → Rule issues now shows the passage in full and the extraction fields under every "flag has no extraction row" issue, with one *Save extraction row* button. Fourteen such issues were cleared without opening the transcript once.
- **Adopting from a comparison-only pass.** Explore → AI and you lists every substantive code the AI applied and the person did not, with the AI's reason and what the person coded there. A passage they left uncoded can be adopted as a claim (it then appears in claim review like any other); a code on a passage they did code can be added to their passage.
- **Comparing against one person.** The comparison takes one named coder as the reference, so codes a reviewer adds later do not shift the baseline the AI is measured against.
- **A second pass no longer loses its overlap with the first.** On import, a suggestion identical to one from an earlier pass was treated as a repeat and dropped, which understated the newer pass's agreement (192 of 555 suggestions in the run below). Only repeats within the same pass are skipped now, and re-importing answers counts each window once.

### Re-testing the AI after sharpening the codebook (aggregate numbers only)

Include, exclude and anchor text was added to the evidence-grade and stance codes, written to describe how the analyst had coded the calibration interview. The same hand-off was then run again with nothing else changed.

| Against the analyst | Before | After |
|---|---|---|
| Stance: same value where both graded | 51% | 69% |
| "Sceptical" chosen where the analyst chose it | 0 of 27 | 27 of 29 |
| Evidence grade: same value where both graded | 67% | 66% |
| Substantive codes: recall / precision | 0.59 / 0.71 | 0.66 / 0.62 |

The stance wording worked and then overshot: 15 of the 39 passages the analyst graded "neutral" came back "sceptical". The evidence wording changed nothing, so that difference is not only a matter of wording. The anchors were taken from the same interview; leaving those passages out moves each figure by a point at most, but a clean test needs a second human-coded interview.

A second machine transcription of every coded passage of the other interview, made with a larger speech model, agreed with the first on 95% of words and supplied five corrections that changed meaning. It is a way to decide where to listen first, not a substitute for listening.

## Added in the fifth pass: a grade pass, a listening queue and speaker fixes

Three things from the review still needed a person and had no pipeline behind them.

- **Grade pass** (`web/src/lib/ai/grade.ts`, AI assist → *Grade pass*). Finding claims and grading them are different jobs. This pass takes claims that already exist and asks only for the single-choice groups (evidence grade, stance). Its prompt carries what a person would use:
  - the respondent's attributes from the source sheet (the ordinary coding pass now sends these too);
  - an ordered decision rule per group, edited under Codebook → Groups & rules and stored as the group's description;
  - several examples per value from a named person's coding, with passages an earlier AI pass got wrong first, marked with the value it wrongly chose.

  In *held-out* mode the examples come only from the first share of that person's claims in the source, and the rest are graded blind, so the result is a test and stays out of the review queue. In *ungraded* mode it grades claims that lack a grade. It runs through the same agent hand-off; a hand-off exported by mistake can be discarded.
- **Listen** (Review → *Listen*, `web/src/lib/listen.ts`). Coded passages in the order worth hearing: quoted evidence first, then passages where a second transcription disagrees, then low-confidence words. The card plays the passage, corrects its wording and records "wording matches the recording". A second transcription can be imported as Whisper-style JSON of the whole recording (matched to each passage by time) or as a list of passages; a passage it does not cover gets no comparison rather than a false alarm.
- **Speakers.** A selected passage can be made its own turn for another speaker (an interviewer's question inside a respondent's turn). An RTTM speaker track can be laid over a source that has word timings: turns split where the speaker changes, and text and coding offsets do not move.
- **Candidate codes** can be adopted with a codebook name and group, and the adoption codes the passage that prompted the candidate.

### Held-out test of the grade pass (aggregate numbers only)

Examples came from the first half of the analyst's claims in the calibration interview; the model graded the 73 claims in the second half.

| Same value as the analyst, on those 73 claims | Coding pass, v1.1 codebook | Coding pass, v1.2 | Grade pass |
|---|---|---|---|
| Evidence grade | 51% | 48% | 58% |
| Stance | 56% | 72% | 67% |

The coding passes are scored on the claims they happened to grade (59 and 67 of the 73); the grade pass grades all of them. "Direct authority" was recognised on 17 of 29 claims once the model was told who was speaking. Of the 31 remaining evidence errors, 26 are the model reading a proposal author's "would" and "should" as opinion where the analyst graded them as authority or firsthand. That is a ruling for the analyst to make, not something to tune further on one interview.

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

## Added in the sixth pass: adding two interviews to a study in progress

This pass took the study as exported after the fifth pass and added two more calibration interviews, each delivered as a machine-captioned WebVTT file and an `.m4a` recording, as a member of the team would: import, set up the source sheet, correct the transcript, run the AI hand-off, review every claim, mark guide coverage, extend the framework and produce the report. Every step was done in the app; each thing that could not be done, or went wrong, became a fix.

**Transcripts and speakers**
- **WebVTT timing.** The VTT importer kept one timestamp per turn and discarded every cue's time. These captions come a few words per cue, so a three-minute answer had one timestamp, and playback, *Follow audio* and passage playback could not find anything inside it. Each word now gets a time: exact from inline `<00:01:02.500>` tags, otherwise spread across its cue (about 10,000 word timings per interview, from none).
- **Paragraphs.** Long answers are broken into paragraphs, as for Whisper JSON, but only where a sentence ends (or past twice the length cap). A first version broke at a fixed length and split 22 sentences across paragraphs, which meant those claims could not be quoted whole.
- **Joining turns.** The speaker menu on every turn has *Join with the turn before*. When the next turn is the first speaker again, it is joined too, so "…the clinic has a room" / "where" / "patients wait" becomes one sentence. The source inspector lists sentences that look cut, either by a word or two given to another speaker or by a paragraph break mid-sentence, with *Play*, *Join* and *Join all*. Listening noises ("Okay.", "Mm-hmm.") are left alone. In the study, 28 joins moved none of the 3,093 codings off their text.
- **Glossary preview.** Each match can be unticked, and each can be played from the recording before applying. Name corrections such as a philanthropist's or a chancellor's name are guesses until someone hears them.
- **Reviewer notes.** A claim whose note says `VERIFY:` goes to the top of Review → Listen, with the note as the reason.

**Sources, guide and framework**
- **Source order.** Sources can be moved up or down, or sorted by name. The framework rows follow. Before, sources stayed in the order they were added.
- **Coverage notes.** Notes ("Not asked: interviewer read out the respondent's role") can now be written and edited, in the source inspector and in the coverage matrix. Before, they could only come in through an import.
- **Linking an answer.** Linking a passage to a question no longer turns a *Partly* mark into *Answered*.
- **Cases follow sources.**
  - Removing a source removed it from its case but left the case, an empty row in the framework and the report.
  - Renaming a source left its case under the old file name.
  - Both now follow the source. The framework can rename cases inline, remove cases with no sources, and add cases for sources that have none.
- **Rules for any group.** Codebook → Groups & rules accepts a written rule for any non-substantive group, not only evidence and stance. The coding prompt already sends it.

**AI hand-off and report**
- **Changed turns.** Turn ids (`T0042`) and windows are positional. Answers to a prompt pack are now refused if turns were joined, split or reassigned after the pack was downloaded. Without this check they would be read against the wrong turns.
- **Calibration in the report.** A pass is compared only with a person's coding made before the pass ran. Codes a reviewer adds while reviewing a pass were being treated as the human standard, which produced "precision 0%" sections for interviews no person had coded.
- **"Checked by" column.** In the report's source table this column now reads *Checked by the reviewer*, because the reviewer is not always a person.
- **Export with recordings.** Settings → *Whole study with recordings (.zip)* packs the study with every attached recording and its waveform. Importing the zip restores them. The JSON export leaves recordings behind in the browser they were attached in. Two recordings (138 MB) took about a second each way.

### What the pass showed (aggregate numbers only)

- **Agent hand-off.** 13 windows produced 1,070 suggestions on 318 claims. Every quote matched the transcript: 0 repaired, 0 rejected.
- **Review.** Every claim was reviewed. 4 claims were rejected (fragments and repeats). Of the 1,070 codings, 96% were kept as proposed, 4 were given another code and 44 were removed. By the coder's confidence, high was kept 99% of the time, medium 98% and low 69%.
- **Cost-benefit flags.** Most removals were flags: 16 of the 22 flagged numbers were illustrative, such as a guess offered as a guess, a figure inside a hypothetical, or general background. A rule saying so was added to the flag group. The other 6 got extraction rows.
- **Caveat.** The reviewer in this pass was the same kind of model as the coder, so these figures describe the workflow, not the quality of the coding. Evidence grades and stances were checked for clear errors only. A person still has to review a sample of these interviews before they feed the cross-case analysis.
- **Interview guide.** In all four interviews, the guide's vantage and risk questions were not asked. The script used in the two new interviews has ten questions, including one on impact that the study's 14-question guide does not have.
- **Known limitation.** Coverage notes and memos that cite turn ids go out of date when turns are joined or split. Notes in this pass cite times instead.

## Added in the seventh pass: a names register and anonymised exports

Review → **Names** finds the people, organisations and places the interviews mention, keeps every spelling of each together, and masks them in what leaves the app.

- **Suggestions** (`web/src/lib/names.ts`):
  - **Sources:** people named in source titles and speaker lists first, then runs of capitalised words, such as "Dr. Jo Ames" or "University of Northern British Columbia".
  - **Each mention counts once**, for the longest name that covers it, so "Port" is not counted inside "Port Ellis".
  - **Ignored:** words that only start sentences; single words the transcripts mostly write in lower case (machine transcripts capitalise "Totally" or "Northern" mid-sentence); common abbreviations (PhD, CEO, RNA); initials and respondent IDs.
  - **Kind:** each suggestion comes with a guessed kind (person, organisation, place, other) and its mentions per interview.
  - **Stand-ins:** a respondent named in a source title is suggested with their ID as the stand-in.
- **Register:**
  - **Fields:** each name has other spellings (short forms, misheard forms), a kind, a stand-in (`[R01]`, `[Person 3]`, or any phrase such as `[a senior university research leader]`), a mask switch and a match-capitals switch, so "Moss" is found and "moss" is not.
  - **Counts:** mentions per interview show who and what the study keeps coming back to. Each row opens on every mention, with a link into the transcript.
  - **Defaults:** people and unclassified names are masked by default. Organisations and places are left for the analyst to decide, and so are public figures.
  - **From the transcript:** a name can also be added from a selected passage in the Code view, where the inspector lists the names in the passage with their stand-ins.
- **Matching:**
  - Whole words, longest spelling first, either apostrophe, any run of spaces.
  - A spelling with a title ("Dr. Lena Ortiz") also matches without it, so a surname is not left behind next to a masked first name.
- **Anonymise:**
  - **One switch** masks names in the report (HTML and Markdown), the claims table, the decision log, and the Retrieve and Framework CSV files. That covers quotes, source and case names, summaries and memos, and the report says that names are anonymised.
  - **Not masked:** the app and the whole-study file keep real names.
  - **Preview:** the Names tab shows one coded passage before and after masking, which is where a name the scan missed shows up.

### On the study (no names given here)

- **Register:** the scan of four machine-transcribed interviews put most of the people named in them at the top of the list. 34 names were registered: respondents as their IDs, the interview team as `[Interviewer]`, other named individuals as `[Person n]`, and five public figures left unmasked.
- **Leak check:** none of the masked names or spellings remained in the anonymised report or claims table.
- **What reading the preview caught:**
  - a misheard name the scan had not paired with anyone;
  - a first name entered as "other", so not masked: hence "other" is now masked by default;
  - a surname left after a masked first name: hence the title-optional matching above;
  - a job title in a source name that identifies the respondent as surely as a name: registered as a phrase with its own stand-in.
- **Still to check by hand:** roles and departments in source names (as in the last point) and small-population details can identify someone without any name.

## Added in the eighth pass: asking every interview the same question, report recipes and a PDF

### Ask across interviews

**Ask across interviews** is a new screen (`web/src/routes/p.$projectId.ask.tsx`, `web/src/lib/ai/ask.ts`).

- **One question, separate answers:** a question goes to each interview separately, with its whole transcript, and the answers come back side by side, one card per interview.
- **Checked evidence:** every answer must cite verbatim evidence with turn ids. The browser checks each quote against the transcript, as it does for AI coding. A quote that is found links to its passage; one that is not found is struck through.
- **Masked names:** names in the names register can be masked before anything leaves the browser. Evidence found in the masked text still links to the real passage.
- **Versions:**
  - Questions keep versions. A version with answers is fixed; *Refine* makes the next one, with a note on what changed and why.
  - Answers can be rated *good*, *partly* or *off*, with a note.
- **Prompt check:**
  - **Wording:** it reads the question for missing instructions: evidence, what to do when the interview does not cover it, a length or format, labels to choose from for feelings, and several questions in one.
  - **Answers:** it reads the answers for length, quotes not found and answers without evidence.
  - **Notes:** it repeats the reviewer's notes. A new version shows what its parent's answers and notes showed.
- **Runs:**
  - Questions run on the Claude API, a local model, or the agent hand-off: download a question pack, have it answered, import the answers.
  - *Try on one interview first* checks a question before running all of them.
- **Gender:** the instructions tell the model to refer to the participant by ID or as "they", not to infer gender.
- **In the report:** the answers to a chosen question become the report's *Participant perspectives* section.

**On the study (aggregate numbers only).** A question about how each participant feels about the proposal was run through the hand-off, with one agent per interview, then refined once.

| | v1 (template wording) | v2 (refined) |
|---|---|---|
| Length of answers | 454–656 words | 180–199 words |
| Quotes found verbatim in the transcript | 110 of 110 | 39 of 39 |
| Overall label | four different free phrasings | one label each, on a five-point scale |
| Reviewer ratings | 2 good, 2 partly (both notes: no common scale; too long to line up) | — |

The prompt check flagged three of the v1 problems before the run (no length, no "not discussed" rule, no request for evidence). The ratings and notes flagged the fourth, the missing common scale. The first version of the check ignored the parent's notes when a new version was being written. That was fixed.

### Visualisations, checked against real data

- **AI and you:** it offered passes over interviews no person had coded, and showed "precision 0.00" against the reviewer's own additions. It now offers only passes with a person's coding made before the pass ran. That rule is shared with the report in `lib/compare.ts`.
- **Co-occurrence and network:**
  - They plotted every used code: a 112-code grid of mostly empty cells, and a circle whose labels were clipped and overlapped.
  - They also counted evidence grade and stance, which sit on every claim, so those codes "co-occurred" with everything.
  - Both now leave out grade and stance unless that group is chosen, and show only codes that share a passage, choosing the most connected when there are too many. Network labels radiate along each dot's angle.
- **Cases by domain:** it cut off the fourth interview. Its cells now use a fixed layout, and the group names appear in full only in the first row.
- **Overview:** the "new codes per interview" bars had no labels. Each bar now has one.
- **Words:** it was led by filler words ("probably", "whatever", "terms") and split names such as "Port Ellis". It now drops filler words and can show two-word phrases.

### Report recipes, tabs and PDF

- **Recipes** (`RECIPES` in `web/src/lib/report.ts`): *Summary*, *Standard* and *Full audit* set the sections, the number of quotes per framework cell, the grade bars and tabs.
  - **Summary:** for partners. It has the perspectives, findings by theme cut to two sentences with one quote, and open items.
  - **Standard:** the analysis.
  - **Full audit:** adds code counts, the AI audit, memos and the codebook.
  - **Fine-tuning:** sections and options can still be changed one by one.
- **Tabs:** the HTML report puts each section on a tab, plus an *All* tab. The tabs are radio inputs and CSS, so the downloaded file needs no script and works in the sandboxed preview. Printing shows every section.
- **PDF:** a PDF is built from the same data and recipe with pdfmake, loaded only on download (`web/src/lib/report-pdf.ts`). It has running headers and page numbers, and names are masked when the study is anonymised. On the study, the PDFs ran to 8 pages (summary), 19 (standard) and 41 (full audit).

### What other tools have

A survey of eleven commercial tools, with sources, is in [feature-gaps-2026-qda-survey.md](feature-gaps-2026-qda-survey.md). The gaps it ranks highest:

1. a code × attribute cross-tab;
2. AI-drafted framework cell summaries with checked citations;
3. a pooled overview across Ask answers;
4. links between passages.

## Added in the ninth pass: signing the analysis off, and who signed it

Reports can now be signed off as final. Settings for this are on the Report screen; the logic is in `signOffBlockers` and `statusLine` in `web/src/lib/report.ts`.

- **Who signs:** the reviewer gives a name and a role: *a person*, or *an AI acting as the human reviewer*.
- **What blocks it:** sign-off is refused while any of these remain:
  - undecided suggestions or open rule issues;
  - AI claims accepted without a claim-by-claim check;
  - open candidate codes, unmarked guide questions, or glossary corrections not yet applied;
  - sources not marked done.
- **What the report says:**
  - **Status:** a signed-off report reads *Final* and names the signer. When an AI signed, the status line says so and adds that no person has signed off the analysis. A study edited after sign-off is flagged.
  - **Limitations:** "Open items" becomes "Limitations". These are what no reviewer can settle from the app, such as recordings not listened to or questions not asked.
  - **Formats:** this applies to the HTML, Markdown and PDF reports alike.

### Finalising the study as the acting reviewer (aggregate numbers only)

The study was finalised by an AI standing in for the human reviewer, and the reports say exactly that.

- **Candidate codes:** both were parked with reasons, since each was raised in a single interview.
- **Ask answers:** answers were rated after checking.
- **Sources:** all were marked done.
- **Framework summaries:** every summary was checked against its full transcript, one checking agent per interview.

| | Summaries checked | Revised | Kinds of error found |
|---|---|---|---|
| Earlier interviews (two) | 19 | 7 | the direct answer to the guide question left out; a barrier ranked higher than the respondent ranked it; a "front door" the respondent had explicitly ruled out; a view attributed to the respondent that the interviewer raised |
| New interviews (two) | 20 | 4 | a detail taken from another interview; a need ranked "above all" that the respondent had questioned; a hoped-for asset described as an existing one |

- **How often summaries were wrong:** 28% of AI-drafted framework summaries had a factual error that a reader of the summary alone could not have caught. That includes summaries written by the reviewer itself.
- **Record:** each checked summary now ends with a note of who checked it and when.
- **Re-running Ask:** the instructions were changed so the model does not infer gender, and the Ask question was re-run as a new version rather than its stored answers being edited.
- **Name leaks:** a check of every export for masked names, before the final sign-off, found five leaks:
  - surnames used on their own in memos;
  - a surname alone in an older memo;
  - two misheard spellings, one in a codebook anchor and one in a memo.
  The sign-off was withdrawn, the spellings registered, and the study signed off again. Adding a person to the register now adds their surname as a spelling as well.

## Tenth pass: handing review over to a person

A study reviewed by an AI acting as reviewer can be handed to a person. This is in **Settings → Hand over review**. Choose the earlier reviewer and the new reviewer's name, then pick one of two modes:

- **Re-check (recommended):** the new person becomes the study's reviewer. Every claim the earlier reviewer checked reads as "accepted, not checked by you" and goes back into Review → AI review. Each confirmation, change or rejection is then logged under the new name.
- **Endorse:** the new person takes the earlier decisions on as their own in one step. Each coding is marked as reviewed by them. An `endorse` event in the decision log records who decided first, and framework check notes gain "endorsed by …". Review statistics are unchanged, because endorsing a decision is not a fresh decision. The report's review section names the endorser.

Either way, a sign-off by the earlier reviewer is withdrawn, since the new person has to sign off for themselves. A snapshot is taken first.

## Eleventh pass: charts of where people stand

[`qual-visualisation-survey-2026.md`](qual-visualisation-survey-2026.md) surveys how qualitative and mixed-methods work graphs coded interviews. Its main rule is that the unit should be the participant, not the passage. A new Explore tab, **Where people stand**, has four charts that follow that rule:

- **Theme by theme:** each participant gets one lane per theme. A large dot marks their middle stance and small dots mark every step they used. A suggested convergence label follows Farmer et al.'s categories: agreement, partial agreement, dissonance, one voice, described with no position, or silence. Clicking a dot opens that person's passages.
- **Groups:** the same labels within and between groups of participants, grouped by a source attribute such as role level or insider status.
- **Evidence:** a unit chart, one square per claim, ordered by evidence grade. A people count sits beside it, because more squares means more passages, not more people.
- **Through the interview:** one panel per participant. The x-axis is how far into the transcript the claim falls, the y-axis is stance, and a running average shows drift.

Claims awaiting a decision are left out of all four, and AI-drafted claims not yet checked are drawn hollow or faded. Each chart carries its caveat. On the four calibration interviews, stance on most themes agreed across people; the main dissonance was between groups on risk. The interview-course panels show sceptical runs where the guide turned to barriers.

Not built yet from the shortlist: a case-ordered meta-matrix (participants sorted by their overall view) and a quote swarm for a single theme.

## Twelfth pass: charts other tools have, and asides

### Charts

Two catalogues list every chart we could find documented in other tools:
- [`qda-charts-classic-tools-2026.md`](qda-charts-classic-tools-2026.md): MAXQDA, NVivo, ATLAS.ti, Dedoose, QDA Miner, Quirkos, Leximancer and the open-source tools.
- [`qda-charts-newer-tools-2026.md`](qda-charts-newer-tools-2026.md): Dovetail, Condens, CoLoop, Reframer, Marvin, Kapiche, Qualtrics and others, plus published practice such as rainbow spreadsheets, spectrum displays and Harvey balls.

Both catalogues agree on three points. Every serious tool can switch a matrix from counting passages to counting participants. Every mark should open its quotes. Clouds, packed bubbles, Sankey diagrams and biplots suggest prevalence that small-n interviews cannot support.

Built from the catalogues:

| Idea (source) | Where it is now |
|---|---|
| Code × participant matrix with a unit toggle (MAXQDA Code Matrix Browser, NVivo crosstab, Condens, dscout) | Explore → **Who raised what**. It shows People (the default), Passages, or Share of each person. Columns can be grouped by attribute, showing "2/3" per group |
| Dominant stance and evidence glyph per cell (CoLoop grid, Evergreen chooser) | The same matrix in Stance mode (coloured dot) and Evidence mode (Harvey ball). The People column shows each participant's stance |
| Seriation, keeping an optional fixed order (QDA Miner, MAXQDA) | Order rows by "most people first, alike together", or keep codebook order |
| Written summary on hover (MAXQDA) | Code-group cells show the framework summary for that case |
| Shared vs unique (NVivo comparison diagram, MAXQDA Two-Cases) | **Shared and unique**, under the matrix |
| Co-occurrence normalisation (ATLAS.ti c-coefficient), co-occurrence by participant | The Co-occurrence measure can be shared passages, strength (c), or people with the pair |
| Spectrum per theme, convergence coding, evidence profile, sequence strips | **Where people stand** (eleventh pass) |

Not built:
- chord diagrams, since the heatmap and network already cover co-occurrence;
- observed-vs-expected ticks per group (Kapiche);
- frequency-vs-distinctiveness quadrants (Leximancer);
- proximity plots (QDA Miner).

The last three need more participants than a calibration round has.

### Asides

Ask now has two areas.
- **Topic:** questions about what the interviews cover.
- **Asides:** questions that isolate passages outside the topic. A standard set adds six:
  - remarks to the interviewer;
  - comments on the questions and the study;
  - advice and referrals for the team;
  - off-the-record and sensitive moments;
  - promises and follow-ups;
  - the participant's own position and stake.

Each asides question is sent with an instruction to list every instance as its own bullet, with one verbatim quote per instance. A board shows how many passages each question found in each interview, and lists one participant's asides together. A whole set can go out as one agent pack.

Asides stay out of the framework, the charts, the claim counts and "Participant perspectives". The report gives them their own section, and gives only counts for the off-the-record question, never quotes.

## Still not ported

- **Speech-to-text and diarisation inside the app.** Transcribe with Whisper / WhisperX / noScribe and import the JSON. `services/transcription` is unchanged.
- **OCR for scanned PDFs and images.**
- **Server sync and permissions.** The Cloudflare Worker + D1/R2 backend has not been reconnected.
- **Older Framework-continuation and consent-scope records from v1.** These are not imported.
