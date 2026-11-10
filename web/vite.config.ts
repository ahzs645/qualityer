import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// `base` lets the same build serve from a GitHub Pages sub-path.
export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  // The legacy importers under ../src import these packages; resolve them from this
  // folder's node_modules so `npm ci && npm run build` works here without a root install.
  resolve: { dedupe: ['fflate', 'sql.js'] },
  build: { chunkSizeWarningLimit: 900 },
  // The original app's importers (../src) are loaded on demand.
  server: { fs: { allow: ['..'] } },
})
