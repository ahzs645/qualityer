# AQDA and Taguette actual upstream test-artifact import audit

Audit date: 2026-10-03 UTC. This audit used public upstream test data, not private interview data. It does not assert external-app interoperability with unpublished research projects.

## Provenance and sample availability

- AQDA pinned commit [`1db606dc2664a4c6f8a540b326f9f04751c5bd08`](https://github.com/tseidl/aqda/tree/1db606dc2664a4c6f8a540b326f9f04751c5bd08), MIT, retained original pytest-produced SQLite outputs. Five exact upstream tests passed: `test_offsets_repair_utf16_and_shifted_unique_text`, `test_export_fidelity_and_api_404`, `test_qdpx_exports_variables_and_links_memos`, `test_docx_imports_as_text_and_other_office_formats_are_refused`, `test_document_delete_reports_impact_and_keeps_memos`. Actual pinned export router functions produced five QDPX archives and three QDC codebooks from those DBs; this is genuine upstream exporter output, not hand-written REFI XML.
- Taguette pinned commit [`52fcdce95709375a4085cb10852bf7dd251ccb3d`](https://github.com/remram44/taguette/tree/52fcdce95709375a4085cb10852bf7dd251ccb3d), BSD-3-Clause. Four original `tests.py::TestMeasure` unit method bodies executed unchanged: extraction, ASCII highlights, Unicode highlights, and all six nested-highlight permutations. Their exact HTML/ranges and real extractor snippets were materialized through the pinned application's real SQLAlchemy ORM: 11 unique document cases, 31 highlight records, two tags. One independent dummy user/password sentinel was added to verify credential exclusion; this sentinel is neither a real credential nor claimed original test authorship.
- No packaged project `.aqda`/`.db`/`.sqlite`/ZIP research example was found in either pinned git tree. Taguette original HTTP tests use in-memory databases; no HTTP server was launched. Public GitHub release API discovery was attempted but denied by the session proxy (HTTP403), so release assets remain unavailable, not exhaustively disproved.
- `artifact-provenance.json` records each input path, SHA256, byte size, upstream commit, license, provenance, and hashes of upstream tests/exporter/model files. License copies accompany the artifacts. These are generated public test artifacts, not published research-project samples.

## Import method

`browser-check.mjs` bundles the actual current `src/exchange.js` importer with esbuild, then invokes `importProject(File)`/`importCodebook(File)` in real headless Chromium. Playwright intercepts an entirely virtual origin and supplies only HTML, bundle and SQL WASM from scratch/read-only files; no server is started and no app API is called. Every unexpected request is aborted. Input bytes are hashed before and after. The standalone importer audit edited no live app/project/database; no private interview was sent remotely. The additional actual file-picker UI check below used authorized disposable local studies only.

Reproduce:

```
node /workspace/scratch/sample-audit/aqda-taguette/browser-check.mjs
python /workspace/scratch/sample-audit/aqda-taguette/verify-public-imports.py
```

The materialization/export scripts and original DBs are retained; no regeneration is needed to rerun import verification. Full importer states are in `browser-import-results.json`, semantic assertions in `public-import-verification.json`.

## Findings

Final verification: **226/226 semantic checks passed**. All 14 artifacts were accepted: five AQDA SQLite projects, five actual AQDA QDPX exports, three QDCs, one Taguette ORM database. Browser errors: zero. Requests: only the three intercepted virtual local HTML/bundle/WASM requests. No external request, server, AI invocation, actual credential or private sample was involved.

- AQDA native and QDPX retain exact source Unicode/newlines, Japanese project name, text attributes, code names/descriptions/colors, emoji codepoint bounds, exact quotations, explicitly recorded coding authors/dates and the five memo contexts. Removed documents leave three detached memos with original provenance prose preserved. No inferred audio times or speakers are created.
- Native AQDA passage/coding links retain exact record IDs. Actual AQDA QDPX expresses a coding memo as a note on its selection, so imported precision is a source passage link; a more specific coding ID is not invented. Explicit REFI `AQDA User` attribution is supplied by upstream export, whereas native unidentified memo authors remain unidentified.
- Taguette produces 28 independent code applications and 11 source-linked untagged-highlight memos. Flat tags remain flat. Unicode UTF8 byte offsets are converted to codepoints only at valid boundaries. One original upstream visualization test deliberately starts byte6 inside `ö` (`Héllö ...`); its two tag applications are correctly held as `needs_review`, with original bytes/snippet provenance retained. All other exact Unicode/nested anchors and all untagged memo anchors are current. This is a successful refusal to round an invalid boundary, not a loss requiring quotation search.
- Every imported source is excluded from AI until consent review. Native settings, users, password records and membership credentials are excluded. The independent dummy sentinel does not appear in the imported state. No author or identity was inferred from a test user.
- Native imports report HTML presentation/media/untagged-highlight losses explicitly. QDC contains code definitions only. These exact tests do not cover audio media exports, unsupported REFI nodes, real multi-user permissions or networked AI quality.

## Concrete fixes discovered and parent integration

The first actual QDPX pass found that supplied project `Description` was dropped and REFI sources lacked the native import's AI exclusion default. Parent integrated both fixes; the current pass verifies Japanese `A & B`, `d` and the exclusion flag. Supplied source author/date/provenance fields now also verify against the actual source nodes.

The additional author metadata assertion found AQDA's Project root supplies `creatingUserGUID`, whereas the importer read only `creatingUser`. Parent integrated the minimal fallback for retained project provenance; all five actual QDPX checks now pass. It does not infer identity. No agent patch or live source write was made. Final rerun: 226/226 checks passed.


## Final rebuilt-app file-picker validation

After parent integrated the shared SQLite byte-preserving text helper and rebuilt the app, the 14-artifact standalone suite was rerun: **226/226 checks passed**, with zero browser errors. Actual file-picker preview/save/export then ran against the real local server on port5173 under a unique new `x-local-user` actor; no mock API was used. **33/33 UI/API/download assertions passed.**

The preview created no project before confirmation. The AQDA QDPX became a separate study with one source, one coding and five linked memos; the Taguette corpus became another with 11 sources, 28 code applications, 11 source-linked memos and two invalid-boundary applications held for review. Real complete-project JSON downloads preserved sources, codings, memos and root/source provenance exactly. Project description, root creator GUID, explicit source author/date, text attributes, exact Unicode and consent exclusions survived real local persistence. Browser errors: zero. Private studies accessed: zero. Remote model requests: zero. The only local writes were these two disposable public-fixture studies. No server or development process was controlled by this agent.

Evidence: `browser-file-ui-result.json`, `artifacts/ui-roundtrip-aqda.json`, `artifacts/ui-roundtrip-taguette.json`. Reproduce the UI test with `node /workspace/scratch/sample-audit/aqda-taguette/browser-file-ui.mjs` while a rebuilt local server is already running. The script uses a fresh disposable actor on every run. Initial harness used an exact `accept` string that changed when `.requal` support was added; it was corrected to select the unique project input by `.qdpx` support. That was a test selector correction, not a product defect.
