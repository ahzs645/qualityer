# Current source comparison: Taguette and OpenQDA

This follow-up inspected upstream source against Qualityer, selected one missing export workflow, implemented it, and verified the new behavior. Source inspection is separate from running the complete upstream products. It does not establish complete feature parity.

## Source snapshots

| Repository | Inspected commit | Relevant source |
| --- | --- | --- |
| Taguette | `52fcdce95709375a4085cb10852bf7dd251ccb3d` | [Highlighted-document exporter](https://github.com/remram44/taguette/blob/52fcdce95709375a4085cb10852bf7dd251ccb3d/taguette/export.py#L253), [conversion formats](https://github.com/remram44/taguette/blob/52fcdce95709375a4085cb10852bf7dd251ccb3d/taguette/convert.py#L599), [member privileges](https://github.com/remram44/taguette/blob/52fcdce95709375a4085cb10852bf7dd251ccb3d/taguette/database/models.py#L236), [project events](https://github.com/remram44/taguette/blob/52fcdce95709375a4085cb10852bf7dd251ccb3d/taguette/web/api.py#L903) |
| OpenQDA | `5d528415de54c824f4cafebdfb7de9df15833b79` | [Team channel authorization](https://github.com/openqda/openqda/blob/5d528415de54c824f4cafebdfb7de9df15833b79/web/routes/channels.php), [navigation broadcast](https://github.com/openqda/openqda/blob/5d528415de54c824f4cafebdfb7de9df15833b79/web/app/Events/UserNavigated.php), [WebSocket state](https://github.com/openqda/openqda/blob/5d528415de54c824f4cafebdfb7de9df15833b79/web/resources/js/collab/useWebSocketConnection.js), [coding/note/variable/audit CSV exports](https://github.com/openqda/openqda/blob/5d528415de54c824f4cafebdfb7de9df15833b79/web/resources/js/exchange/useExport.js) |

Both checkouts were cloned independently at the above commits. The existing audit and completion report were checked against current code rather than treated as proof that every upstream feature was covered.

## Comparison and selected implementation

| Workflow | Upstream evidence | Current Qualityer behavior / remaining gap |
| --- | --- | --- |
| Exact text highlighting and tags | Taguette highlighted-document exporter renders source text with highlights and bracketed tags | Already exact source coding with overlap stripes and hierarchical codes; now full annotated-source HTML and DOCX export also preserve overlapping applications |
| Readable full-source exports | Taguette exports annotated document HTML and converts HTML to DOCX/PDF/RTF through Calibre | Implemented standalone HTML and Word DOCX without an external converter. HTML can be printed or saved as PDF in a browser. Direct PDF and RTF generation remain unsupported |
| Native project exchange | Taguette uses native SQLite; highlight offsets are UTF-8 byte positions | Existing native SQLite import validates byte boundaries and exact quotations. Untagged highlights become source-linked memos; shared authors are explicitly unidentified. Export remains Qualityer native ZIP/JSON or REFI-QDA; writing a native Taguette SQLite project is not implemented |
| Formatted document imports | Taguette delegates document conversion to Calibre and sanitizes HTML | Existing local imports cover TXT, HTML, DOCX, ODT, EPUB, RTF and PDF/OCR, with preview/provenance. Matching every Calibre input/output format or preserving rich original layout is not claimed |
| Team authorization | Taguette privilege methods; OpenQDA authenticated team channels and member invitations | Existing authenticated owner/reviewer/coder/viewer memberships, configurable capabilities, independent blind coding projection and review decisions. Roles are similar in purpose but do not mirror upstream role identifiers exactly |
| Collaborative state propagation | Taguette project event long-polling; OpenQDA Reverb/Echo team presence and user-navigation broadcasts | Qualityer polls shared project revisions every 15 seconds and rejects stale writes. It does not show live presence, broadcast another user's navigation, or synchronize simultaneous rich-text cursors. These are genuine remaining infrastructure gaps |
| Audit and export | OpenQDA structured audit CSV includes old/new values; separate selections/notes/variables exports | Existing filtered structured decision history and exports; annotated sources deliberately carry only selected coding decisions and minimal source metadata. Dedicated OpenQDA-native selection/variable/notes file schemas are not implemented |
| Plugin extension and live conversion notifications | OpenQDA plugins and conversion broadcast channels | Qualityer has configured service endpoints and processing jobs. It does not implement the OpenQDA plugin runtime or broadcast-channel protocols |

The selected change closes the readable annotated full-source export gap. It does not replace independent coding, add simulated realtime presence, infer imported researcher identities, or change team permissions.

## Annotated source export behavior

`src/annotated-source-export.mjs` exports `annotatedSourceModel`, `annotatedSourceHTML` and `annotatedSourceDOCX`. `src/features/annotated-source-export.jsx` provides source-level researcher and coding-layer selectors with download actions.

The report keeps the complete source text in order, split at exact codepoint boundaries. Overlapping applications retain separate numbered references and a coding ledger with hierarchical code labels, researcher attribution, decision layer, exact quotation and range. Highlight color is sanitized; unsafe HTML and XML characters are escaped. The DOCX is a native OOXML archive with document, styles and relationship parts.

Export eligibility requires a current exact quotation and matching source revision. Deleted applications, stale anchors, media/image/PDF-region coding and any quotation intersecting a currently restricted interval are omitted from the ledger and highlights. Restricted source text is replaced with a placeholder; overlapping restrictions become one contiguous placeholder. Invalid restriction anchors stop the export. Explicitly included current passages can re-enter the report; an included scope needing anchor review remains restricted.

The exporter accepts the authenticated server projection already in the browser. It cannot reconstruct another coder's decisions from hidden application IDs or imported attribution. Blind coding filtering is enforced by the existing Worker and tested again with the export model. Minimal source identifiers, revision, review status, source role and scope describe what was exported. Private notes, source versions, consent rationales, coding-review notes, arbitrary source attributes and media bytes are omitted. Use the project ZIP for complete project preservation; this readable report is not a project roundtrip format.

Counts describe selected decisions rather than interview/theme prevalence. HTML includes print styles; saving it as PDF requires the user's browser. Full external Word rendering has not been certified.

## Verification

`node --test tests/annotated-source-export.test.mjs` passes 8 cases covering:

- Unicode codepoint boundaries, preservation of complete unrestricted text and overlapping coder decisions.
- Sanitized markup and highlight colors.
- Restricted-source redaction, overlapping restricted intervals and absence of intersecting quotation/rationale/metadata leakage in HTML and DOCX.
- Researcher/layer filtering and exclusion of stale, deleted and media applications.
- Authenticated blind projection with independent synthetic researchers.
- Failure on malformed restriction anchors.
- DOCX OOXML relationships, line breaks, RTL and escaped text.
- Independent DOCX reading through Mammoth, plus included versus stale included consent scope behavior.

A headless Chromium rehearsal also rendered the generated HTML, confirmed withheld body text was absent, preserved Unicode and overlapping references, and followed a numbered link to the correct ledger entry. Browser file URLs are blocked by this environment, so the exact generated HTML was loaded with Playwright `setContent`.

The fixtures are synthetic. Private interview recordings and transcripts are not placed in the repository by this implementation. Broader app/browser verification is recorded in the current completion report after integration.
