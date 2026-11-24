// Makes sure document-kit (the git submodule at ../vendor/document-kit) is checked out, installed and built before
// the app's dev server, build, type check or tests use it. Its package entries point at dist/, which is not committed.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const kit = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vendor', 'document-kit')
const run = (cmd) => execSync(cmd, { cwd: kit, stdio: 'inherit' })

if (!existsSync(join(kit, 'package.json'))) {
  console.error('document-kit is missing. Fetch the submodule first:\n  git submodule update --init vendor/document-kit')
  process.exit(1)
}
if (!existsSync(join(kit, 'node_modules'))) run('npm ci --no-audit --no-fund')

// Rebuild when dist/ is missing or older than any source file.
const newest = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((t, e) => {
  const p = join(dir, e.name)
  return Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs)
}, 0)
const dist = join(kit, 'dist', 'recipe.js')
if (!existsSync(dist) || statSync(dist).mtimeMs < newest(join(kit, 'src'))) run('npm run build')
