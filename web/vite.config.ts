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
  build: { chunkSizeWarningLimit: 900 },
})
