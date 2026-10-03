# Repository audits and integrated changes — 2026-10-03

Eight dedicated agents compared one upstream repository each against Research Weave, with a ninth agent reviewing integration. Reports pin upstream commits, distinguish inspected source from exercised behavior, and give acceptance tests. They are feature samples with concrete gaps, not exhaustive parity certification.

| Reference | Dedicated audit | Useful work integrated this round | Remaining priorities |
| --- | --- | --- | --- |
| AQDA | [Source and tests](repository-audits/aqda.md) | Paragraph/speaker-line semantic chunks; chunk-mode cache isolation; central rejection of truncated AI replies; adaptive embedding outliers that can return none | Whole-corpus example-seeded suggestions, model context budgeting, native AQDA import, memo mentions |
| Taguette | [Source comparison](repository-audits/taguette.md) | Literal or explicitly hierarchical CSV codebook preview, validated export, atomic CSV/QDC/JSON imports; keyboard modal behavior | Rich document ingestion, RTL/localization, native project exchange, distinct permission presets |
| QualCoder | [Source and exchange evidence](repository-audits/qualcoder.md) | Scoped coded-excerpt IRaMuTeQ TXT plus source/revision/coder/timing provenance manifest | Additional formats, media/image agreement, deterministic autocoding/undo, coverage-weighted hierarchy plots |
| Sift QDA | [Source comparison](repository-audits/sift.md) | Query kind/recording guards; explicit codepoint/second units; numeric/date vocabulary source filters | Full interval algebra, literal search over uncoded corpus, interactive maps, case memos |
| OpenQDA | [Source comparison](repository-audits/openqda.md) | Accurate portrait/presence/permission comparison; existing source-sequence visualization retained | Multi-source application portraits, before/after audit diffs, reusable codebooks |
| Requal | [Source comparison](repository-audits/requal.md) | Scoped interval-union Jaccard, eligible-corpus kappa, source/status controls and selected/all-pair CSV | Blind server isolation, detailed permissions, legacy encodings, RQDA migration, segment overlap |
| WhisperX | [Adapter and service checks](repository-audits/whisperx.md) | Queue/app transcript structure validation; language-specific alignment reload; null/zero/fractional timing preserved and per-chunk language/offset provenance | Bounded subprocess capture, stage progress, corrected subtitle export, host/model quality and long-job verification |
| pyannote.audio | [Source and service checks](repository-audits/pyannote.md) | Container telemetry-disabled defaults; anonymous-label and global-diarization limitations remain explicit | Regular/exclusive overlap tracks, selected-turn corrections, speaker-count hints, pinned models, whole-recording clustering |

## Meaningful corrections

Text and recording queries now compare the same selection kind. Recording relationships require a shared recording key and seconds, never transcript codepoint offsets. AND/NOT still select whole original coding applications: interval subtraction is not implemented.

Coder comparison excludes reference documents, consent-review passages, invalid quotations and stale anchors. Kappa's denominator also omits consent-review characters even if they were uncoded. Jaccard deduplicates overlapping decisions within each code/source/coder. No measure establishes blind independence, respondent-level agreement or consensus. Media/image kappa remains absent.

Codebook previews reject malformed JSON, conflicting duplicate CSV paths and separator ambiguity. Importing all definitions uses one revision-checked operation; a malformed hierarchy rejects the entire change. Existing definitions are not silently overwritten. Taguette names remain literal unless the researcher explicitly chooses hierarchy parsing.

Semantic retrieval offers newline/paragraph-aware chunks and fixed overlapping windows. Long individual lines fall back to bounded windows. Cache identity includes chunk mode, model, source hash and revision. Low similarity is a reading prompt, not an error; consistent vectors can produce no outlier findings. Provider length/withheld responses cannot become apparently complete suggestions or drafts.

IRaMuTeQ exports current scoped exact text excerpts, with coincident code/coder applications grouped once. Overlapping nonidentical excerpts can repeat words. The manifest records omissions and source/timing provenance; this is not a whole-interview prevalence corpus. Actual IRaMuTeQ application import is unverified.

WhisperX alignment reload follows detected language changes. Service/app boundary validation does not fill missing timestamps or invent speaker names. Actual speech inference and model accuracy remain unverified. The bundled worker still refuses multi-part diarization rather than inventing global speaker identity. Updating the bundled worker source does not deploy an external transcription service.

## Evidence and verification

AQDA's upstream test suite was executed: 38 checks passed. Other upstream applications were source-inspected; this round did not install and run every desktop/web interface. Previously documented actual QualCoder exchange tests remain specific to those fixtures.

Final local verification passed: authenticated app build and **103 automated checks**; sanitized public build and **81 checks**; **17 Python service checks**; and a **10-flow browser rehearsal** covering dialog keyboard behavior, cancel/atomic CSV import, malformed JSON, CSV export, scoped Jaccard/kappa and reports, search mode, eight audit links and mobile layout. Synthetic coding and supplied zero/fractional timestamp values remained unchanged. The Pages bundle passed its private-fixture scan. GitHub Actions repeats app and service checks after the checkpoint is pushed. All service fixtures use synthetic audio/data. Public source and reports exclude uploaded interviews, private project records, credentials and private history.

## Next implementation sequence

1. Finish scoped corpus search, interval query fragments and additional document ingestion; retain explicit geometry/recording provenance.
2. Design blind coding as server output isolation, then add configurable permissions and two-session authorization/reconciliation tests.
3. Add regular/exclusive speaker tracks and per-turn corrections, then test a real approved model host before claiming long-recording diarization.
4. Exercise native/exchange formats inside each supported external app and publish per-field loss reports.
