# qualityer

Research Weave: a modular TanStack Start app for qualitative interview analysis, with a separate browser-local GitHub Pages demo. This public source includes synthetic examples only. Uploaded interviews, research projects, account notes, credentials, generated bundles and private Git history are excluded.

## Run locally

Use Node.js 24.

```sh
npm ci
npm run build
npm run dev
```

Open http://localhost:5173. The local development server uses an explicit test identity and applies SQLite migrations; production requires a trusted identity provider and D1/R2 storage.

```sh
npm run ci
npm run build:pages
node scripts/check-pages.mjs
```

This checkpoint passed the sanitized app build and 235 automated checks, the owner-private app build and 257 checks, 30 Python transcription-service checks, and a ten-flow browser rehearsal using the original private interview. Live AI/transcription providers still require configuration and real-model testing.

## Features and deployment

The app includes exact quotation coding, timestamp history, HTML/ODT/EPUB/RTF and encoding previews, browser-local image/PDF OCR, native AQDA/Taguette/RQDA imports, interval queries and corpus search, reviewed autocoding with undo, portable codebook collections, concept maps and code portraits, weighted hierarchy, matrices, cases and memos, structured decision history, blind team permissions and recording-bound speaker correction. Language/embedding/speech models require a configured connection. Read [architecture and deployment](docs/architecture-and-deployment.md) and the in-app Feature audit for supported scope and remaining gaps.

Waveforms for long recordings are decoded in the browser in pieces (WebCodecs). If a browser cannot decode a recording's codec, generate the waveform with ffmpeg and import it from the waveform panel:

```sh
node scripts/media-peaks.mjs interview.m4a   # writes interview.peaks.json
```

Browser checks (need `npm run dev`, Playwright and ffmpeg): `npm run test:browser`.

GitHub Actions checks the app on pushes and pull requests. The **Publish synthetic Pages demo** workflow is manual: enable **Settings → Pages → Source: GitHub Actions**, then run it. Pages provides browser-local storage, not collaborative server storage. The full private app requires the authenticated Worker backend.

This checkpoint corresponds to private source revision `2df14ab5fa41339d991637bf47596a68e412e410`. It saves the application code without copying private source history or research data.

Eight dedicated repository audits and implemented fixes are recorded in [repository audit summary](docs/repository-audit-summary.md). Full external-app parity and real-model transcription/diarization are not claimed. The separately hosted transcription service source and synthetic contract tests are included under `services/transcription`; model installation/accuracy requires its own host verification.

The [public example import audit](docs/public-sample-import-audit.md) records committed projects, upstream-generated fixtures, encoding fixes and the fields each sample actually exercised. Native Requal, exact SQLite TEXT decoding, STM/TSV speech formats and explicit case-column mapping are included. Original sample datasets are not bundled.

The [coding interface verification](docs/coding-interface-verification.md) covers desktop, phone and tablet coding rehearsals: source-line and turn navigation, multiple-code passage decisions, source/revision safeguards and evidence-linked interview results. Read the [results methodology](docs/interview-results-methodology.md) for count/coverage definitions and researcher-written interpretations; real iOS/Android selection handles still need device testing.
