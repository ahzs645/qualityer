# Sift QDA public fixture/import audit

Pinned upstream: `tarunv13/sift-qda` commit **a34f26a2d67f51c71aef942ec0dd26682acc8c59** ([tree](https://github.com/tarunv13/sift-qda/tree/a34f26a2d67f51c71aef942ec0dd26682acc8c59)). Package license: **MIT OR Apache-2.0**, copyright 2026 The project contributors. The repository contains no checked-in QDPX/QDC/native binary sample at this revision. This audit executed public fixture generators/tests; none of these files are user interviews.

## Exact upstream fixtures exercised

[make_fixtures.py](https://github.com/tarunv13/sift-qda/blob/a34f26a2d67f51c71aef942ec0dd26682acc8c59/scripts/make_fixtures.py) generated five bounded files without edits: DOCX, XLSX, PDF, ODT and BOM/Unicode TXT. Their original upstream checks are [tests_import.rs](https://github.com/tarunv13/sift-qda/blob/a34f26a2d67f51c71aef942ec0dd26682acc8c59/src-tauri/src/tests_import.rs). Generated binaries include generation timestamps; artifact SHA-256 identifies this exact run, not a published upstream download. `provenance.json` records original generator/test/license hashes and every generated artifact.

Actual Research Weave browser importer results:

| Fixture | Observed result | Limits/losses |
|---|---|---|
| interview.docx | Heading/body Unicode prose retained, 214 codepoints | Final retest: supplied creator/title core metadata retained with original byte SHA and explicit conversion warning. Mammoth plain text retains double newlines; list markers, table-column grouping and typography are explicitly omitted. |
| focus-group.odt | Paragraphs, two-space run and body retained, 118 codepoints after fix | Actual upstream fixture exposed footnote body concatenation into main prose; root applied the scratch fix. Final retest verifies footnotes/endnotes are omitted explicitly with a conversion warning and main prose is no longer contaminated. List markers/table row grouping and author metadata are omitted. |
| notes.txt | UTF-8 BOM removed, exact CRLF/blank lines and accented Unicode retained, 39 codepoints | This deliberately differs from Sift's cleaned 35-codepoint paragraph form. Original wording/whitespace is preserved in Research Weave; no imported coding exists to realign. |
| report.pdf | Two PDF pages, 102 extracted codepoints; supplied page start/end codepoint ranges verified | Text extraction is canonical plain text, not original page typography. No OCR, audio timing or speaker information inferred. |
| survey.xlsx | Four table rows including header and three nonblank participant rows; final row exact | Exercised `readTable`, not generic transcript ingestion. Final rebuilt-app UI: previewed three cases without mutation; ID→case name and Open answer→memo mapping retained exact names/answers/file hash. Explicit Age numeric type converted values to 34/51/27. No interview sources were invented from answer columns. |

## Genuine native exchange execution

The exact upstream [coding_survives_refi_round_trip test](https://github.com/tarunv13/sift-qda/blob/a34f26a2d67f51c71aef942ec0dd26682acc8c59/src-tauri/src/tests.rs) ran successfully in a scratch headless Rust crate using unchanged upstream DB, REFI, text and chunk modules. Only the test harness copied the emitted QDPX and checkpointed/copied its native SQLite file for audit. The Tauri shell was not launched. No upstream Rust source is proposed for vendoring into our repository.

That emitted QDPX imported through the real Research Weave browser functions: **1 source, 2 hierarchical codes, 2 overlapping codings**. Original Unicode codepoint bounds **65–91** and **74–96**, and every exact quotation, were retained. Codebook QDC export/reimport retained both codes and the parent link.

Research Weave exported QDPX, then this audit removed all native Research Weave sidecars. The standard-only archive imported using **Sift's actual headless native importer** with **1 source, 2 codes, 2 references, 0 skipped** and identical quotation bounds. This verifies the two programs' exercised text exchange cores; it does not verify the Tauri GUI or every REFI feature.

The exact upstream test fixture contains **zero cases, memos and variables**. Those fields are therefore not claimed as verified here. It contains no audio/video coding, timestamps or regions. Sift's exporter assigns no creating-user references to these codings; Research Weave correctly retains unidentified imported authorship instead of assigning them to the person importing.

Two other boundaries were observed:

- Native Sift SQLite schema (`projects/sources/nodes/coding_references`) is deliberately unsupported by Research Weave. Use Sift's QDPX export. The native detector and complete file importer were executed against the genuine database. Root corrected the original misleading QualCoder fallback error; final retest explicitly recommends Sift QDPX.
- Sift QDPX root Project Description was initially lost by Research Weave. Root applied the import/export fix and final retest retains it in standard-only exchange. Actual Sift core reimport replaces that description with its own “Imported from REFI-QDA” default; this is an upstream import limitation, so project-description roundtrip through Sift is not lossless.

## Applied bounded fix

`proposals/odt-note.patch` changes only ODT note traversal and its explicit conversion warning. `proposals/tests/odt-footnote-browser.mjs` passed against both the actual upstream ODT and an independent synthetic nested-note/emoji fixture. Original bytes are not changed; their original-file SHA remains the recovery/provenance reference. Import result text is explicitly a conversion, not lossless document preservation.

No live source, deployment, dev process or GitHub repository was changed by this audit. The scratch Rust modules, toolchain, fixture binaries and browser bundles must remain outside the public app repository. Publish the evidence summary and SHA table; public regression tests should use independently authored synthetic documents.

## Final built-app UI checks

Actual DOCX and ODT File previews/imports passed on the final built Worker/browser app: conversion warnings appeared before confirmation, source SHA hashes persisted, DOCX core creator/title metadata persisted, ODT footnotes were explicitly omitted without main-prose contamination, and no audio timestamps were inferred. Browser errors: zero.

Actual upstream XLSX case-table UI passed the mappings described above. Original sample Ages contain no zero/missing nonblank rows. A separately labelled **audit-authored zero/blank variant**, never presented as an original upstream fixture, independently verified that explicit numeric attributes preserve 34, **0**, and **null** respectively. Its distinct file hash was retained. The generator's blank row was skipped deliberately; no blank participant case was fabricated. These checks use disposable local projects and do not modify originals.

UI evidence: `case-table-ui-results.json`, `case-table-zero-blank-ui-results.json`, `preview-ui-results.json`.

Final actual app file-picker checks passed for the original XLSX, DOCX and ODT. Three original XLSX cases preserved ID/name and answer/memo mappings, numeric Age 34/51/27 and original-byte provenance. A separately labelled synthetic zero/blank variant preserved 0/null; it was not described as the original upstream fixture. DOCX core metadata and ODT conversion warnings persisted. Zero browser errors.
