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

This checkpoint passed the sanitized app build and 81 automated checks, the owner-private app build and 103 checks, 17 Python transcription-service checks, and a ten-flow browser rehearsal with synthetic data. Live AI/transcription providers still require configuration and real-model testing.

## Features and deployment

The app includes exact quotation coding, source/timestamp history, hierarchical codebooks, cases and typed attributes, scoped charts/reports, human-reviewed assistant proposals, shared memos, account-isolated notes and project recovery. Read [architecture and deployment](docs/architecture-and-deployment.md) and the in-app Feature audit for supported scope and remaining gaps.

GitHub Actions checks the app on pushes and pull requests. The **Publish synthetic Pages demo** workflow is manual: enable **Settings → Pages → Source: GitHub Actions**, then run it. Pages provides browser-local storage, not collaborative server storage. The full private app requires the authenticated Worker backend.

This checkpoint corresponds to private source revision `a86a52c2c085ca5d5a460ddb2ada84a528bea58e`. It saves the application code without copying private source history or research data.

Eight dedicated repository audits and implemented fixes are recorded in [repository audit summary](docs/repository-audit-summary.md). Full external-app parity and real-model transcription/diarization are not claimed. The separately hosted transcription service source and synthetic contract tests are included under `services/transcription`; model installation/accuracy requires its own host verification.
