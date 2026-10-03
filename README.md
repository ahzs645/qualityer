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

The sanitized app build and its 48 automated tests passed before this checkpoint. The owner-private version also passed 70 tests and browser rehearsals using the original examples. Live AI/transcription providers still require configuration and real-model testing.

## Features and deployment

The app includes exact quotation coding, source/timestamp history, hierarchical codebooks, cases and typed attributes, scoped charts/reports, human-reviewed assistant proposals, shared memos, account-isolated notes and project recovery. Read [architecture and deployment](docs/architecture-and-deployment.md) and the in-app Feature audit for supported scope and remaining gaps.

GitHub Actions checks the app on pushes and pull requests. The **Publish synthetic Pages demo** workflow is manual: enable **Settings → Pages → Source: GitHub Actions**, then run it. Pages provides browser-local storage, not collaborative server storage. The full private app requires the authenticated Worker backend.

This checkpoint corresponds to private source revision `36853ffe4f238a85b94ef2a705f2d8aa69feb707`. It saves the application code without copying private source history or research data.
