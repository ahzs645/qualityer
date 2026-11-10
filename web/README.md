# Research Weave — web

This folder is the rebuilt interview analysis app: Vite 8, React 19, TanStack Router (file-based routes, hash history), TanStack Table v9, TanStack Virtual and TanStack Store, styled with Tailwind CSS v4. Projects are saved in the browser's IndexedDB. Use export to keep a copy.

```sh
cd web
npm ci
npm run dev        # http://localhost:5173
npm test           # domain tests (vitest)
npm run typecheck
npm run build      # static site in dist/; set PAGES_BASE_PATH for a sub-path
```

The design rationale, the features and what has not been ported from the original app are in [docs/redesign-2026.md](../docs/redesign-2026.md).

## Layout

```
src/
  routes/            one file per screen (TanStack Router file routes)
  features/code/     transcript, coding popover, inspector
  lib/types.ts       data model
  lib/model.ts       pure logic: turns, rules, corrections, agreement, saturation
  lib/actions.ts     every edit, as undoable store updates
  lib/store.ts       open project, undo/redo, autosave, snapshots
  lib/storage.ts     IndexedDB
  lib/importers.ts   QualCoder, Research Weave v1, SRT/VTT, Whisper JSON, Markdown guides
  lib/player.ts      shared audio player and recording storage
  lib/ai/            AI coding pipeline (windows, prompt, quote checks, providers)
  lib/claims.ts      claims (everything coded on one passage), review states, decision summaries
  lib/review.ts      reviewer decisions, each written to the decision log
  lib/compare.ts     passage-level comparison of two coders (precision/recall, confusion matrices)
  lib/listen.ts      transcription comparison, listening order, turn splitting, RTTM speaker tracks
  lib/ai/grade.ts    grade pass: evidence grade and stance on existing claims, with a held-out test
  lib/profile.ts     cases by domain, with evidence-grade and stance mix
  lib/report.ts      study report (HTML, Markdown) and the claims table
  features/review/   claim-by-claim AI review, decision log
  features/explore/  interview map, cases by domain, AI-against-person comparison
  lib/refi.ts        REFI-QDA .qdpx import/export
  lib/documents.ts   Word/ODT/PDF/HTML/RTF text extraction
  lib/demo.ts        synthetic demo study
```

Offsets are UTF-16 string indices into a source's text. Importers convert code-point offsets from QualCoder and Research Weave v1.
