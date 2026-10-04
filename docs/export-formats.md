# Export formats

| Format | Contents | Binary recordings | Intended use |
| --- | --- | --- | --- |
| Native project ZIP | Exact native project state; UTF-8 source text; per-source transcript JSON; supplied server metadata; scope and media manifests | Optional: current and historical referenced media, with SHA-256 integrity checks | Portable project archive and Research Weave reimport |
| Project JSON | Native project-state fields, including source revisions, timing, speaker history, coding, cases, memos and review tasks | None | Compact state snapshot; reconnect recordings after import |
| REFI-QDA QDPX | Standard project XML, source text, codebook, users, cases, variables and notes; native state and scope sidecars | Optional available media; standard media selections | Exchange with QDA applications; standard XML cannot represent every native field |
| Transcript JSON | One source's text, supplied turn/word timing, speaker corrections, provenance and revision history | None | Transcript interchange and timing preservation |
| Corrected transcript SRT / VTT / TSV | Segment times and labels; SRT/VTT omit unavailable or stale timing with a loss report; TSV retains untimed cells | None | Subtitles or tabular transcript review; retain canonical JSON for word timing and history |
| Speaker tracks RTTM | Supplied speaker intervals and deterministic speaker aliases, with a loss report | None | Diarization interchange; retain JSON for corrections and run metadata |
| Codebook QDC / Taguette CSV | Code hierarchy and definitions | None | Codebook interchange |
| Coded excerpts CSV; analysis CSV / XLSX / HTML / Markdown / ODT / GraphML | Scoped coding applications, evidence reports or graph structure | None | Spreadsheet review, reporting, printing or graph interchange |
| IRaMuTeQ text corpus | Eligible text and selected source metadata in corpus syntax | None | Specialized corpus analysis |

The native ZIP retains original state identifiers in its snapshot. Reimporting included recordings uploads their exact bytes and remaps current and historical media references without treating the upload as a replacement recording. Existing review status, timing and speaker history remain intact. A transcript-only import disables unavailable playback while retaining recording identifiers as provenance.

Server metadata is supplied separately from project state. The archive records its actual scope: audit events, membership, processing jobs and recovery indexes are reference records when included. Import does not recreate access grants, restart jobs or install recovery points. Private account notes, service credentials, embedding caches and binary job-result artifacts are excluded. Converted source files retain extraction provenance; original DOCX or other source bytes are included only if they were retained as referenced media.

External REFI consumers receive a reduced standard representation. Turn/word synchronization, review workflows, stable native record identifiers and other native fields remain in the native sidecar. Recording selection times use rounded milliseconds in standard XML. Verify interchange against the receiving application's importer.

Native ZIP generation is asynchronous and stores media without recompressing already-compressed recordings. It still assembles the ZIP in memory, and import currently decompresses the archive in memory. Large recordings require substantial browser memory; this is not a streaming archive implementation. Transcript-only ZIPs avoid that binary-memory cost.

Large audit operations are retained in verified object storage, with a bounded pointer and change summary in SQL. Authorized history reading and ZIP metadata export restore the complete operation payload. SQL history text filters search the stored summary for these events, so they do not find every word in a large transcript payload. Blind coding history remains redacted before any object-storage lookup.

Repository regression tests use synthetic sources only. Interview recordings, machine drafts and simulated-review artifacts used for session verification are kept outside the repository.
