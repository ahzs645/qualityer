# Research Weave against commercial QDA tools: feature gaps (November 2026)

Scope: NVivo 15, ATLAS.ti 25, MAXQDA 24/27, Dedoose, Delve, Quirkos, Dovetail, Condens, Marvin, Looppanel and CoLoop, compared with `web/` as of the working tree, including the in-progress *Ask across interviews* (`web/src/lib/ai/ask.ts`) and report recipes/PDF. The open-source tools already audited under `docs/repository-audits/` are not repeated here. Vendor claims come from vendor documentation and were not tested. "RW" means Research Weave. Links are listed at the end.

## 1. Feature table

| Feature | Who has it | RW has it? (evidence) | Value for this team |
|---|---|---|---|
| Memo types and links | MAXQDA: free, code, document, in-document, project and set memos ([mx-memo]). ATLAS.ti: memos typed and linked to quotations ([atl-net]). NVivo: "see also" links ([nv-adv]) | **Partly.** `Memo.kind` is `memo \| journal`, and a memo links to at most one passage or one code (`lib/types.ts` `Memo`) | **Medium.** Framework analysis needs memos that cite several passages across interviews |
| Hyperlinks between passages | ATLAS.ti named-relation hyperlinks and a Link Manager ([atl-hyper]); MAXQDA two-way internal links ([mx-links]) | **No.** grep for `hyperlink\|passageLink` finds nothing | **Medium-high.** Lets an analyst tie "R03 contradicts R01" to the evidence itself, not to a free-text memo |
| Code co-occurrence / relations | ATLAS.ti co-occurrence table ([atl-cooc]); MAXQDA Code Relations Browser ([mx-vis]); Dedoose ([ddo-irr]) | **Yes.** Explore → co-occurrence heatmap and network. Retrieve filters on co-occurring codes | Done |
| Document variables and code × variable cross-tabs | NVivo crosstab query (codes × attributes, export to Excel/SPSS) ([nv-mx]); Dedoose Code × Descriptor ([ddo-ucb]); MAXQDA Code Matrix Browser ([mx-vis]) | **Partly.** Source and case attributes exist, are editable in a grid, and are sent to the AI. Retrieve filters by one `attr`. There is no code × attribute table: `Profile.tsx` is domain × case, and grep for `crosstab` finds nothing | **High.** "Which themes do clinicians raise and administrators do not?" is the core cross-case question in framework analysis |
| Word frequency / KWIC / concordance | MAXDictio word frequencies, 1–5-word combinations, KWIC and word tree ([mx-dict]); NVivo word frequency, text search and word tree ([nv-code]); Quirkos word cloud ([qk-feat]) | **Partly.** Explore → *Terms* lists the top 30 words in **coded** passages only, and each word links to Retrieve's text filter. There is no KWIC, no search of uncoded text and no n-grams | **Medium.** Useful for finding uncoded mentions and for spotting misheard terms in machine transcripts |
| Sentiment / dictionary auto-coding | MAXDictio dictionaries with autocode ([mx-dict]); NVivo sentiment and theme autocoding ([nv-code]); ATLAS.ti sentiment, opinion mining and NER ([surrey-atl25]); Dovetail sentiment ([dt-ai]) | **No** (stance is a code group applied by a person or the AI pass) | **Low.** The codebook's stance group plus calibrated AI coding already does this better than polarity lexicons |
| Query tool / sets / saved searches | ATLAS.ti Query Tool with Boolean and proximity operators, and smart codes ([atl-cooc]); NVivo queries saved for re-running ([nv-mx]); MAXQDA document sets ([mx-dict]) | **Partly.** Retrieve filters are kept in the URL (`codes`, `mode=all`, `attr`, `coder`, `key`, `q`). There are no named saved queries, no NOT or proximity operators, and no document sets | **Medium** |
| Smart codes / code-combination queries | ATLAS.ti smart codes ([atl-cooc]) | **Partly.** "Co-occurring" (AND) only | **Medium** |
| Summaries per document / code / cell (manual) | MAXQDA Summary Grid and Summary Tables ([mx-sumtab]); NVivo framework matrices ([nv-mx]) | **Yes.** The Framework cell summary editor, with pinned quotes | Done |
| AI summaries (document, code, cell) | MAXQDA AI Assist summaries saved to the Summary Grid ([mx-ai]); NVivo AI summaries of codes and cases ([nv-ai]); ATLAS.ti AI Summaries ([surrey-atl25]); Delve code summaries ([dv-sum]); Dovetail Magic summarize ([dt-ai]) | **Partly.** *Ask* gives one answer per interview, with verified quotes. Its "Five-point summary" template covers a whole interview. Nothing drafts a Framework cell or code summary from its evidence | **High.** Framework cells are the slowest part of the method |
| AI chat with the corpus, with citations | MAXQDA chat with coded segments, with linked references ([mx-chat]); ATLAS.ti Conversational AI, multi-document ([atl-ai]); Marvin, Condens and Looppanel cited answers ([mv-repo], [cd-ai], [lp-cite]); CoLoop grids with an Overview row ([cl-grid]) | **Partly.** *Ask across interviews* puts one question to each interview, checks quotes verbatim (`locateQuote`), versions prompts and records ratings. There is no pooled answer across interviews and no chat over a Retrieve result set | **High** |
| AI-suggested codes / themes | NVivo suggested child codes ([nv-child]); MAXQDA suggested subcodes ([mx-ai]); ATLAS.ti Intentional AI Coding ([atl-iac]); Looppanel and Marvin auto-tagging ([lp-tag], [mv-tag]) | **Yes, deeper than most.** Codebook-as-prompt coding, a grade pass, candidate codes, and calibration against a person (`lib/ai/`, Explore → AI and you). It does not propose *new* subcodes from a code's segments | Mostly done. Subcode suggestion is **low-medium** |
| Transcription / diarisation | MAXQDA Transcription, 50+ languages ([mx-trans]); ATLAS.ti, 43+ languages ([atl-ai]); Dovetail and Condens ([dt-trans], [cd-ai]) | **No in-app.** Listed under "Still not ported". Imports Whisper/WhisperX JSON, VTT and RTTM tracks, and compares transcriptions (`lib/listen.ts`) | **Low-medium.** The external Whisper path already works, and the listening queue is stronger than most vendors' |
| Video coding | NVivo timeline coding ([nv-av]); ATLAS.ti video synced to transcripts ([surrey-atl25]); MAXQDA | **Partly.** Video files attach, but play through `<audio>` (`lib/player.ts`), so there is no picture | **Low** for audio interviews |
| Survey / mixed-methods import | ATLAS.ti Excel survey import ([atl-survey]); NVivo Qualtrics/Excel import ([nv-qual]); MAXQDA SPSS/Excel variables ([mx-spss]) | **No.** Sources accept no `.csv`/`.xlsx`, and there is no attribute-sheet import | **Low-medium.** A CSV import of the attribute sheet would be the useful part |
| Participant / consent management | Condens participant panel with consent status ([cd-repo]); Dovetail participant tooling ([cmp-dt]) | **No** (v1 consent-scope records not imported, per redesign doc). Off-the-record passages are covered | **Medium**, ethics-driven; a small consent field per source would do |
| Anonymisation / redaction | Marvin masks names in transcripts and blurs faces ([mv-pii]); Dovetail Redact (Enterprise) ([dt-redact]); no built-in MAXQDA anonymiser found ([mx-trans]) | **Yes.** Names register masks exports and Ask prompts (`maskNames`); off-the-record passages withheld. Audio is not redacted | Done. Audio redaction is **low** |
| Collaboration (real-time, roles, merge) | NVivo Collaboration Cloud ([nv-collab]); Quirkos live collaboration ([qk-collab]); MAXQDA TeamCloud and merge ([mx-team]); Dovetail manager/contributor roles ([dt-tags]) | **Partly.** Merge of a colleague's copy, blind coding, coder names. No server, roles or real-time editing (not ported) | **Medium-high** once there are two or more active coders |
| Audit trail | NVivo project event log ([nv-collab]) | **Partly, strong for AI.** `reviewLog` decision log, AI run manifests, snapshots and 60-step undo (`lib/store.ts`). No general log of who edited the codebook or coding, and when | **Medium** |
| Codebook versioning | Rare. Run hashes of the codebook are an RW idea. Dovetail templates link tag boards ([dt-tags]) | **Partly.** Named snapshots, and a codebook hash per AI run. No codebook diff or version labels | **Medium.** Calibration claims depend on knowing which codebook version was used |
| Inter-rater reliability | ATLAS.ti Krippendorff's α family ([atl-ica]); MAXQDA segment-level κ (Brennan–Prediger) ([mx-ica]); NVivo κ ([nv-code]); Dedoose Training Center ([ddo-irr]) | **Partly.** Character-level overlap and Cohen's κ per code and group (`lib/model.ts`); precision/recall and confusion matrices (`lib/compare.ts`). No α and no figure across 3+ coders | **Medium.** Reviewers increasingly ask for α |
| Viz: code map / MDS | MAXQDA Code and Document Maps ([mx-vis]) | **No** (a network only) | Low |
| Viz: word cloud | MAXQDA, Quirkos ([mx-vis], [qk-feat]) | **No** (bar list instead) | Low |
| Viz: document portrait / codeline / timeline | MAXQDA Document Portrait and Codeline ([mx-vis]) | **Yes.** Explore → Interview map (lanes by speaker, guide question, group, grade, stance and review state) | Done |
| Viz: Sankey / treemap / hierarchy | ATLAS.ti Sankey ([atl-cooc]) | **No** in `web/` (the root app has a hierarchy view) | Low |
| Viz: matrix heatmap | MAXQDA Code Matrix Browser ([mx-vis]); ATLAS.ti code-document table ([atl-cooc]) | **Yes.** Co-occurrence heatmap, codes-by-interview grid (Guide), cases by domain | Done (code × attribute missing, see above) |
| Report / export | MAXQDA Smart Publisher (Word), summary tables to Word/Excel, SPSS ([mx-sumtab], [mx-spss]); NVivo matrices to Excel ([nv-mx]) | **Partly.** HTML (recipes, tabs), PDF, Markdown, CSV (claims, decisions, Retrieve, Framework), QDPX/QDC, JSON/zip. No DOCX or XLSX output, and no SPSS/R | **Medium.** Stakeholders often want Word; Excel matrices for co-authors |
| Highlight reels / clips | Dovetail reels, embeddable ([dt-reels]); Condens clips ([cd-ai]); Marvin clips and playlists ([mv-ux]) | **No.** Per-passage playback exists (`AudioBar`, word timings), but there is no clip export | **Medium**, if stakeholders listen; ethics review is needed for voices |
| Insight repository / tagging across projects | Dovetail workspace tags and boards ([dt-tags]); Marvin ([mv-repo]); Condens ([cd-repo]) | **No.** One project at a time in IndexedDB | **Low** for a single-study team |
| Project templates | Dovetail project templates ([dt-tpl]) | **Partly.** Ask prompt templates (`ASK_TEMPLATES`), codebook CSV/QDC and guide import. No "new study from template" | **Low-medium** |

## 2. Ranked shortlist: eight gaps worth building next

1. **Code × attribute cross-tab.** This is NVivo's crosstab query and Dedoose's Code × Descriptor view. Add an Explore tab, *By attribute* (`routes/p.$projectId.explore.tsx`, new `features/explore/ByAttribute.tsx`).
   - **Table:** rows are codes or code groups; columns are the values of one source or case attribute. Each cell shows how many cases have the code, out of the cases with that value, so groups of different sizes compare fairly.
   - **Drill-down:** each cell opens Retrieve with `codes` and `attr` already set.
   - **Export:** CSV, through the same masking path as the other CSVs.
   - **Framework view:** sort or group the Framework rows by the same attribute.

2. **AI-drafted Framework cell and code summaries, with verified citations.** This matches MAXQDA's AI summaries in the Summary Grid, and NVivo's and Delve's code summaries. In `routes/p.$projectId.framework.tsx`, add *Draft from evidence* beside the cell summary editor.
   - **Pipeline:** reuse `lib/ai/ask.ts`, with its schema, `locateQuote` and name masking, but send only the cell's coded passages.
   - **Storage:** keep the draft separate from `FrameworkCell.summary` until a person accepts it, together with its quotes (each can become a pin), model and prompt hash.
   - **Same for codes:** run the same thing per code in the Codebook editor.

3. **Pooled synthesis and "ask these results" for Ask.** This matches CoLoop's grid Overview row, MAXQDA's chat with coded segments, and Marvin's and Looppanel's cited answers.
   - **Overview row:** add an Overview row to the Ask comparison view. It synthesises the per-interview answers, and each claim must cite the interviews and quotes behind it, verified as before.
   - **From Retrieve:** add *Ask about these passages* to Retrieve (`routes/p.$projectId.retrieve.tsx`). It sends the filtered passages and keeps the passage IDs as citation targets.
   - **Versions:** both reuse `AskPrompt` versioning and the good / partly / off ratings.

4. **Passage-to-passage links and multi-anchor memos.** This matches ATLAS.ti hyperlinks and MAXQDA internal links.
   - **Data:** extend `Memo` in `lib/types.ts` with an `anchors[]` array, and add a `PassageLink {fromSourceId, from, to, relation: contradicts | supports | elaborates | same-event, note}`.
   - **Creating links:** from the Code inspector (`features/code/Inspector.tsx`), *Link to…* picks a passage in Retrieve.
   - **Showing links:** links appear in the claim card and the Framework cell evidence.
   - **Keeping anchors valid:** anchors must move with corrections, joins and splits, as coding anchors already do (see the known limitation in the redesign doc).

5. **Saved queries with NOT and proximity ("smart codes").** This matches the ATLAS.ti Query Tool and NVivo saved queries. Retrieve's URL state is already a query.
   - **Saving:** add *Save query* to Retrieve, storing `Project.queries[]`.
   - **Operators:** add *without code X*, and *within N turns of*.
   - **Reuse:** saved queries can serve as a Framework theme definition, a row in the cross-tab (item 1), or the input to Ask (item 3).

6. **Full-transcript search, KWIC and search-and-code.** This matches MAXDictio KWIC and NVivo text search with coding.
   - **Search:** extend Explore → *Terms*, and Retrieve's `q`, to uncoded text, in a KWIC table (left context | term | right context | source | time).
   - **Coding from results:** each row can be coded or played.
   - **Glossary:** a row can be sent to the correction glossary. This catches misheard terms, and mentions that the AI pass left uncoded.

7. **Clips and a reel in the report.** This matches Dovetail reels and Condens and Marvin clips.
   - **Data:** RW already has word timings and passage playback (`lib/player.ts`, `features/code/AudioBar.tsx`).
   - **Report:** add a recipe option, in `lib/report.ts`, that embeds short audio clips for pinned Framework quotes.
   - **Export:** offer a zip of clips with a captions file.
   - **Safeguards:** off-the-record passages must be blocked. The anonymised recipe must warn that voices are not masked, and should default to excluding clips.

8. **Krippendorff's α and agreement across several coders.** This matches ATLAS.ti α-binary and cu-α and MAXQDA segment agreement.
   - **Code:** add α (binary per code, and per single-choice group) next to κ in `lib/model.ts` and `lib/compare.ts`.
   - **Display:** show it in Review → Agreement and in the report's AI audit.
   - **Coders:** allow two or more people, plus an AI pass as an extra coder, with segment-level matching at a tolerance (MAXQDA's 90% rule) as an option beside character overlap.

Runners-up: DOCX/XLSX export of the Framework matrix and the report; a CSV import of the attribute sheet; a consent field and status per source; codebook version labels and diffs between snapshots.

## 3. What Research Weave has that most of these tools lack

None of the surveyed vendors' documentation describes the following:

- **Code-group rules.** Cardinality rules on code groups (*exactly one* evidence grade, *at most one* stance, *requires extraction*), checked as you code and shown in the coding popover.
- **Checked AI quotes.** The browser checks every quote the AI returns verbatim against the transcript (exact, repaired or rejected), and each pass keeps a run manifest with model, prompt hash and codebook hash. Vendors document a review step, not quote checking ([mv-tag], [lp-cite]).
- **AI calibration against a person.** The AI is measured against a named person's coding: precision and recall, confusion matrices per single-choice group, a held-out grade pass, and comparison-only passes kept out of the analysis.
- **Claim-by-claim review.** Review runs one claim at a time, with a decision log that keeps rejected suggestions and records who checked what.
- **Choice of AI route.** Three ways to run the AI: the Claude API from the browser, a local OpenAI-compatible model, or an offline agent hand-off. ATLAS.ti offers only an on/off switch for OpenAI ([atl-ai]); MAXQDA 27 adds local AI ([mx-27]).
- **Guide coverage.** Coverage is recorded per guide question (*answered*, *partly*, *asked, no view*, *not asked*), with the answering passage linked.
- **Transcript repair.** A correction glossary moves every anchor with the text. A listening queue is ordered by disagreement with a second transcription and by low-confidence words. Turns can be joined or split, and RTTM speaker tracks overlaid.
- **Names stay in the browser.** The names register masks names in exports and before transcripts are sent to an AI. Off-the-record passages are withheld from every export.
- **No account needed.** It runs entirely in the browser with no account. Projects export to QDPX for NVivo, ATLAS.ti and MAXQDA.

## Sources

[mx-memo]: https://www.maxqda.com/help/memos/about-memos
[mx-links]: https://www.maxqda.com/help/links/document-links
[mx-vis]: https://www.maxqda.com/products/maxqda/visualtools
[mx-dict]: https://www.maxqda.com/help/maxdictio/what-does-maxdictio-offer
[mx-sumtab]: https://www.maxqda.com/help/summarizing/summary-tables
[mx-spss]: https://www.maxqda.com/help-mx20/variables/exporting-data-excel-spss
[mx-ai]: https://www.maxqda.com/help-mx24/ai-assist/what-is-ai-assist
[mx-chat]: https://www.maxqda.com/help/ai-assist/ai-chat-with-coded-segments
[mx-27]: https://www.maxqda.com/ai-assist
[mx-trans]: https://www.maxqda.com/help/transcription-audio-video/automatic-transcription
[mx-team]: https://www.maxqda.com/help-mx22/teamwork/can-maxqda-support-teamwork
[mx-ica]: https://www.maxqda.com/help/coding/problem-intercoder-agreement-qualitative-research
[atl-iac]: https://manuals.atlasti.com/Win/en/manual/SearchAndCode/IntentionalAICoding.html
[atl-ai]: https://atlasti.com/ai-info
[atl-cooc]: https://manuals.atlasti.com/Win/en/manual/Querying/QueryingData.html
[atl-hyper]: https://doc.atlasti.com/ManualWin.v9/Hyperlinks/HyperlinksCreating.html
[atl-net]: https://manuals.atlasti.com/Mac/en/manual/Networks/NetworksLinkingNodes.html
[atl-ica]: https://manuals.atlasti.com/Win/en/manual/ICA/ICAMethodsForTesting.html
[atl-survey]: https://doc.atlasti.com/ManualMac/Documents/DocumentTypeSurveyDataIntro.html
[surrey-atl25]: https://www.surrey.ac.uk/sites/default/files/2025-08/ATLAS.ti-v25-distinguishing-features.pdf
[nv-ai]: https://help-nv.qsrinternational.com/15/win/Content/ai/ai-assistant.htm
[nv-child]: https://help-nv.qsrinternational.com/15/win/Content/ai/ai-suggest-child-code.htm
[nv-code]: https://help-nv.qsrinternational.com/15/win/Content/coding/coding.htm
[nv-mx]: https://mdlutoronto.github.io/nvivo-14-15-mac-intro/part_2_queries/matrix-coding-and-crosstab-queries/
[nv-adv]: https://services.anu.edu.au/files/development_opportunity/NVivo_v14_Advanced.pdf
[nv-av]: https://help-nv.qsrinternational.com/14/win/Content/files/audio-and-videos.htm
[nv-qual]: https://help-nv.qsrinternational.com/15/win/Content/files/qualtrics.htm
[nv-collab]: https://help-nv.qsrinternational.com/15/mac/Content/projects-teamwork/teamwork.htm
[ddo-irr]: https://dedoose.com/Userguide/interraterreliability
[ddo-ucb]: https://live-dlab.pantheon.berkeley.edu/sites/default/files/training_materials/Intro%20to%20Dedoose%20Handout.pdf
[dv-sum]: https://help.delvetool.com/en/articles/9184558-summarizing-codes-with-ai-chat
[qk-feat]: https://www.quirkos.com/learn-qualitative/features.html
[qk-collab]: https://quirkos.com/blog/post/quirkos-23-live-team-collaboration-chat
[dt-ai]: https://docs.dovetail.com/help/dovetail-ai
[dt-reels]: https://docs.dovetail.com/help/projects/highlight-reels.md
[dt-trans]: https://docs.dovetail.com/help/transcribe-and-translate
[dt-redact]: https://docs.dovetail.com/help/blur-and-redact
[dt-tags]: https://docs.dovetail.com/help/workspace-tags
[dt-tpl]: https://dovetail.com/help/the-basics/project-templates
[cmp-dt]: https://chilipiper.com/article/dovetail-vs-condens-vs-enjoyhq
[cd-ai]: https://condens.io/ai
[cd-repo]: https://condens.io/ux-research-repository
[mv-pii]: https://help.heymarvin.com/en/articles/10130399-how-do-i-mask-sensitive-and-personally-identifiable-information-in-recordings
[mv-repo]: https://heymarvin.com/product/ux-research-repository
[mv-tag]: https://heymarvin.com/resources/ai-tagging
[mv-ux]: https://heymarvin.com/solutions/user-researcher
[lp-cite]: https://www.looppanel.com/release-notes/ask-ai-gets-citations-and-depth-bulk-uploads
[lp-tag]: https://www.looppanel.com/release-notes/auto-tagging-launch
[cl-grid]: https://docs.coloop.ai/docs/analysis/analysis-grids
