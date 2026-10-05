# Visualization comparison across the six reference projects

Pass date: 2026-10-04. The reference repositories were inspected at the same pinned commits as the [repository audit summary](repository-audit-summary.md). The interface walk used the private two-recording study (182 code applications, 12 codes, 2 cases) loaded into the local Worker. No quotations or recordings from it are reproduced here.

## What each reference offers

| Visualization | QualCoder | Requal | OpenQDA | Sift QDA | AQDA | Taguette | Qualityer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Code frequency bars, grouped/stacked | `view_charts.py` bar/stacked bar | — | `BarChart.vue` grouped/stacked/overlay/relative, sort | `SourceBarsChart.tsx` | counts in tree | tag counts, sortable | Charts & matrix: grouped/stacked bars, five measures. **New:** colour legend and sort by codebook order, row total or name |
| Pie chart | `view_charts.py:1171` | user-attribute pies | — | — | — | — | Not added on purpose: bars show the same counts and are easier to compare |
| Hierarchy sunburst/treemap | `view_charts.py:1317` | — | — | `CodeHierarchyChart.tsx` | — | — | Code hierarchy (weighted by measure) |
| Code × source/case heatmap | `view_charts.py:1862` | — | — | `MatrixHeatmap.tsx` | — | — | Shaded matrix table plus CSV/XLSX export |
| Co-occurrence matrix | `report_cooccurrence.py`: XLSX, GraphML, clustering | — | — | — | — | — | **New:** shaded heatmap, choice of distinct-overlap count or Jaccard, hide empty codes, CSV and GraphML export |
| Co-occurrence / code network | `view_graph*.py`, network PNG; Louvain clusters are in `report_cooccurrence.py:45`, not the graph viewers | — | — | `ProjectMapChart.tsx` force graph | — | — | **New:** Explore → Co-occurrence network view with deterministic Louvain communities, modularity Q, threshold slider, cluster-ordered heatmap, SVG/GraphML/CSV export; code relationships graph, editable concept map (SVG/GraphML) |
| Relation distance box plots | `report_relations.py:1014` | — | — | — | — | — | **New:** per-pair box plots (median, quartiles, Tukey whiskers, outliers); codepoints and seconds kept separate; CSV and SVG export |
| Attribute charts | `view_charts.py:1804` categorical, `:1834` numeric histogram | user-attribute pies | — | — | — | — | **New:** Attributes tab. Text/boolean values become categories; all-numeric values become a histogram (Sturges bins). Cases or sources, CSV export |
| Word cloud / frequency | `simple_wordcloud.py`, n-grams 1–4, PNG | — | `WordCloudView.vue` | `WordCloud.tsx`, KWIC | — | — | **New:** one shared word cloud (`src/word-cloud.mjs`) for Explore and Words & concordance: deterministic spiral layout, linear/sqrt/log sizing, horizontal/mixed/vertical rotation, five colour schemes held at 4.5:1 contrast on light or dark backgrounds, 25–500 words, n-grams 1–4, include-only and hide lists, Cloud/Bars/Table views, SVG/PNG export, dropped-word report. **Fixed:** quadratic quotation slicing (11.1 s → 40 ms on the real study) |
| Coder agreement heatmap | coder comparison report | `create_overlap_heatmap`, by user attribute | — | — | consistency bars | — | Coverage & coder overlap heatmap. **New:** typed coder attributes (`attribute.coder`, owner/reviewer) and an "Agreement by coder attribute" heatmap of within- and between-group overlap in codepoints or segments, optional per-code split, explicit "Not recorded" group, pair drilldown and CSV |
| Code portrait / margin stripes | coding margin | browser shading | `CodePortrait.vue` | `CodingStripes.tsx` | highlights | highlights | Coding portrait, inline stripes |
| A/V waveform with code tracks | `view_av_waveform.py` | — | — | — | — | — | **New:** one lane per code under the waveform; click to seek, drag or arrow-key edges to retime (`coding.media.retime`, with history, consent and blind-coding checks), drag empty lane space to add a range, 1–16× zoom. Decoded peaks are saved per recording (`media-peaks` endpoints, etag-checked) so later visits skip decoding |
| Image export | Plotly PNG/HTML, graph PNG/PDF | — | Plotly PNG (modebar default; no explicit export code found) | none for charts; matrix Excel export (`MatrixControls.tsx`) | — | — | **New:** SVG and PNG from one source for coverage, hierarchy, concept map, distance box plots, conversation sequence, theme connections, theme treemap, relationship graph, co-occurrence network and word cloud; canvas size capped for mobile browsers |

## Measurement contracts for the new views

- **Co-occurrence count:** distinct overlap intervals between directly applied text codes on the same source, the same rule as before. **Jaccard** is shared coded codepoints divided by the union of both codes' coded codepoints. Each code's ranges are merged within a source before comparing, so duplicates do not inflate the score. N/A means the union is empty. Both use the shared analytical eligibility checks (stale anchors, consent restrictions, removed coding).
- **Relation distance:** the gap between the two applications of a related pair, and 0 when they overlap or touch. Text uses codepoints and recordings use seconds; the two are never pooled. Quartiles use linear interpolation. Pairs that reuse an application are dependent observations, so the view runs no significance test.
- **Attribute distribution:** a description of the recorded metadata, not a population sample. Missing and blank values are counted separately.

## Remaining visualization gaps

- Pie charts (deliberately omitted, see above).
- Zoom/pan covers the charts that use the shared export buttons (conversation sequence, theme treemap, theme connections, code hierarchy, code relationships), plus the concept map, co-occurrence network and waveform, which have their own. The word cloud, coverage profile and distance box plots zoom only in their interactive HTML export.
- No dark theme: the app ignores `prefers-color-scheme`.
- Long-recording peaks are generated in the browser on first view; there is still no server-side decoder.
- Coder attributes travel in the native snapshot, not in REFI-QDA XML.

## Further gaps found in the 2026-10-05 review

Found by a reviewer reading the reference sources and grepping `src`. Since implemented: the code × case text grid (Analysis workbench → Code × case text), per-code and per-source statistics (Code summary), case-attribute filters (workbench, Visualizations and Explore) and an "Also coded with" column in coding result tables. Also implemented in the 2026-10-05 follow-up:

- **Shared heatmap ramp** (`src/heatmap-ramp.mjs`): eight luminance-ordered bands, text colour chosen by measured contrast (every band ≥ 4.5:1, tested), zero cells unshaded, and a banded legend under the workbench matrix, Explore coding matrix, co-occurrence heatmap and coder-overlap heatmap. The coder-attribute viridis heatmap now picks its text colour by contrast too.
- **Per-code consistency check**: the server already had embedding-centroid outliers and model consistency review (`server/research-ai.mjs`, AI review panel), so the reviewer's "not found" was wrong. Added a provider-free workbench tab, *Code consistency* (`src/consistency-check.mjs`): TF-IDF vectors, leave-one-out centroid cosine and the same cutoff rule as the embedding review. It works offline and in the Pages demo, explains each flag with missing/distinctive words, and can send flagged excerpts to the processing desk as review tasks. It compares vocabulary only, not meaning.
- **Interactive HTML export** (`src/chart-zoom.mjs`): a self-contained page with zoom, pan, keyboard control, hover details from each mark's title and a data table. It makes no network requests, and scripts, event handlers, `javascript:` links and `foreignObject` are stripped from the embedded SVG. Available on every shared-export chart, the word clouds and the co-occurrence network.
- **Stop lists** (`src/stopwords.mjs`): English, French, Spanish, German, Italian, Portuguese, Dutch, Swedish, Danish, Norwegian, Finnish, Polish, Russian, Turkish and Indonesian, with apostrophes normalised. They are conservative function-word lists, not the full stopwords-iso sets. Explore word frequency now has a language selector.
- **Hierarchy treemap** uses balanced binary splits, so a flat codebook no longer renders as thin slices.

## Verification

`tests/visual-statistics.test.mjs` covers interval arithmetic, symmetry, filters, stale-anchor exclusion, CSV formula preservation for `safeCSV`, quartiles and fences, unit separation, SVG escaping, attribute typing, and Unicode quotation offsets after the word-frequency fix. A Chromium run against the real study exercised every new control and export: no page errors, and no horizontal overflow at 390 px. The co-occurrence counts matched the earlier table.

Follow-up tests: `tests/cooccurrence-network.test.mjs`, `tests/coder-attribute-agreement.test.mjs`, `tests/waveform-tracks.test.mjs`, `tests/media-peaks-api.test.mjs`, `tests/word-cloud.test.mjs` and `tests/image-export.test.mjs`. Each feature was exercised in Chromium at 1440 px and 390 px with no page errors or horizontal overflow; the waveform used a synthetic recording.
