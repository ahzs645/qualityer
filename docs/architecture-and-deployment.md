# Architecture and deployment

The private app uses TanStack Start with the official Vite plugin and Cloudflare Worker adapter. `src/router.jsx` and `src/routes` define the framework shell. The workspace is a client component because selection, document import and media controls use browser APIs. `src/server.js` delegates authenticated `/api/` requests to `server/worker.mjs`, then serves the actual Start handler. D1 keeps project membership, revisions, jobs and recovery indexes; R2 stores media, project snapshots and generated transcripts. Sites provides the trusted identity boundary. Do not expose this Worker directly on an unauthenticated origin that accepts user-supplied identity headers.

Modules:

- `src/components/ui.jsx`: shared controls/dialogs.
- `src/features/analysis.jsx`: evidence tables, matrix, agreement and consensus.
- `src/domain.mjs`, `src/processing-domain.mjs`, `src/visual-domain.mjs`: pure research operations and selectors.
- `src/transcript.mjs`, `src/transcript-alignment.mjs`: provider imports, raw/provenance retention, timing, history and playback eligibility.
- `src/exchange.js`, `src/refi.mjs`, `src/refi-import.mjs`, `src/qualcoder-import.mjs`: interchange adapters.
- `server/storage.mjs`, `server/audio-jobs.mjs`, `server/research-ai.mjs`, `server/connections.mjs`: persistence, recording jobs and optional services.
- `server/seed-data.mjs`: replaceable owner-private example adapter; sanitized source distributions use synthetic fixtures.

`npm run build` runs Vite's genuine Start/Cloudflare build and packages the Worker plus embedded emitted client assets for Sites. Embedding assets is a deployment bridge, not a separate React build. `npm run dev` serves this production bundle in Miniflare and applies local SQL migrations. `npm run dev:vite` is the optional Vite development server; it does not migrate the database automatically. Node 24 is used for reproducible CI.

## Timing contract

Text ranges use Unicode codepoints; media times use seconds, retaining original fractional precision and a valid zero. Missing timing remains null. Provider segments retain raw word records, raw labels, source IDs and provider metadata. Canonical `turns.start/end` are text positions, not seconds. Corrections snapshot complete prior turns, provenance, media references and speaker mappings. Affected text alignments become review-required. Imported timing is unbound until a reviewer verifies the associated recording. Recording replacement invalidates alignment and old media selections. Durable jobs pin the immutable uploaded recording key, and the server rejects applying a result after that source is linked to another recording.

Native project JSON, per-source transcript JSON and QDPX's native sidecar preserve timing/history. Coding CSV includes media times and recording references. Standard external REFI audio selections use milliseconds; synchronized turn/word interchange is not implemented or verified. The archive contains an explicit alignment compatibility report.

## GitHub Pages and Actions

Pages is a static, browser-local demo using TanStack Router and the same modular research UI. Its built-in interview is synthetic, and it has no server storage, team sharing, provider credentials or real audio. Its timestamps are explicitly illustrative. Users may import their own data into local browser storage and export a native copy. The full collaborative app requires the private Worker backend.

`npm run build:pages` generates `dist/pages/index.html`. `PAGES_BASE_PATH=/repository-name/` supports project Pages URLs. `scripts/check-pages.mjs` checks the artifact for private server/fixture markers. `check.yml` builds the private/synthetic app, runs checks with a local Worker, builds Pages and uploads the demo artifact. `pages.yml` deploys the static artifact through GitHub's Pages Actions on main or manual dispatch.

Sanitized application source is saved in `ahzs645/qualityer` on `main`, with successful push/PR CI. GitHub Pages remains a manual workflow; enable Settings → Pages → Source: GitHub Actions before running it. Public source excludes original interviews, private research state, credentials, generated Worker bundles and private Git history. Repository-specific audits and their integrated changes are documented in [repository audit summary](repository-audit-summary.md).

## Analysis and study workflow additions

`analysis-domain.mjs` defines shared scopes, Unicode concordance, interval relationships, union coverage and deduplicated matrices. `features/analysis-workbench.jsx` presents grouped/stacked bars, heatmaps, hierarchy sunburst/treemap, project connections, full relationship tables and reports. Hierarchy area always represents applications; other measures remain labelled in tables. Reference sources and consent-review ranges are withheld. Frozen result codes retain original application IDs and the complete filter specification, and belong to the researcher who saves them. They do not imply consensus.

`research-operations.mjs` validates typed attributes, category hierarchies and exact passage anchors, manages code ordering/archive/restore, case passages, pins, links and journal edits. Source corrections move unchanged anchors and preserve stale source snapshots for review. `features/typed-attributes.jsx` provides typed source and case forms. `tabular-import.mjs` previews bounded CSV/XLSX case tables, resolves the first workbook worksheet through its relationship, and never executes spreadsheet formulas.

`report-export.mjs` writes scoped CSV, literal-cell XLSX, standalone escaped HTML for printing, Markdown, ODT and correctly directed/undirected GraphML. Region geometry and supplied time bounds are retained in evidence reports; XML-forbidden controls are replaced by U+FFFD. QDPX carries typed source/case variables and an explicit exchange-loss sidecar. Passage cases, links, timing and review history remain native-sidecar features; standard REFI round-tripping through every external application is not claimed.

Private notes live in their own indexed D1 table and `server/private-notes.mjs`, restricted to author ID and project membership. They never enter canonical project state, shared audit events, project recovery snapshots or AI input. Each author can export their notes separately. Infrastructure administrators retain storage access. The public Pages demo has one browser-local identity; local notes there are not protected from another person using that browser profile. Team role grants/revocations/changes are audited; history supports bounded pages and filtered export. Blind-coding server isolation is not implemented.

The audio waveform decodes an actual recording locally and can seek/code its ranges. It supports a 40 MB input preview and guards large decoded buffers. It never assigns times to transcript text. Longer recordings retain ordinary player/time-range coding and need external waveform processing. Live inference, transcription quality, long-recording/global speaker reconciliation, OCR, interval-subtraction queries and IRaMuTeQ export remain outside the verified additions. The Feature audit distinguishes those gaps from completed tools.

## Loading an owner-private Site

Sites service credentials pass the Site access boundary without supplying a signed-in visitor identity. Normal user APIs therefore continue to require the authenticated identity headers. A separately enabled `PRIVATE_IMPORT_TOKEN` permits the narrow `/api/private-import` service route to create one imported project for the existing server-pinned owner, upload its recordings and restore only verified recording references. The caller cannot choose an owner, inspect another project, change permissions or submit analytical decisions through this route. Keep this capability limited to a confirmed owner-private Site and disable it after loading by removing the runtime secret and deploying that environment revision. Project data and recordings are loaded through persistent storage rather than committed to the public repository.
