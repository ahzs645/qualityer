import { Link, Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen, Bot, CheckCircle2, ClipboardList, FileOutput, FileText, Grid3x3, Highlighter, LayoutDashboard, Menu, Moon,
  MessagesSquare, Network, NotebookPen, Redo2, Search, Settings, Sun, SunMoon, Undo2, X,
} from 'lucide-react'
import { openProject, redo, undo, useProject, useStore } from '../lib/store'
import { checkRules, pendingSuggestions } from '../lib/model'
import { applyTheme, getTheme, type Theme } from '../lib/theme'
import { Logo } from '../components/Logo'
import { IconButton, cx } from '../components/ui'

export const Route = createFileRoute('/p/$projectId')({
  loader: async ({ params }) => {
    const p = await openProject(params.projectId)
    if (!p) throw redirect({ to: '/' })
  },
  pendingComponent: () => <div className="grid h-full place-items-center text-sm text-muted">Opening study…</div>,
  component: ProjectLayout,
})

const NAV = [
  { to: '/p/$projectId', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/p/$projectId/sources', label: 'Sources', icon: FileText },
  { to: '/p/$projectId/code', label: 'Code', icon: Highlighter },
  { to: '/p/$projectId/codebook', label: 'Codebook', icon: BookOpen },
  { to: '/p/$projectId/guide', label: 'Guide & coverage', icon: ClipboardList },
  { to: '/p/$projectId/review', label: 'Review', icon: CheckCircle2, badge: 'issues' as const },
  { to: '/p/$projectId/assist', label: 'AI assist', icon: Bot },
  { to: '/p/$projectId/ask', label: 'Ask across interviews', icon: MessagesSquare },
  { to: '/p/$projectId/framework', label: 'Framework', icon: Grid3x3 },
  { to: '/p/$projectId/explore', label: 'Explore', icon: Network },
  { to: '/p/$projectId/retrieve', label: 'Retrieve', icon: Search },
  { to: '/p/$projectId/memos', label: 'Memos', icon: NotebookPen },
  { to: '/p/$projectId/report', label: 'Report', icon: FileOutput },
] as const

function ProjectLayout() {
  const project = useProject()
  const { saving, canUndo, canRedo, lastChange } = useStore((s) => ({
    saving: s.saving, canUndo: s.past.length > 0, canRedo: s.future.length > 0, lastChange: s.lastChange,
  }))
  const [navOpen, setNavOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const issues = useMemo(() => checkRules(project).length + pendingSuggestions(project).length, [project])

  useEffect(() => setNavOpen(false), [pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const nav = (
    <nav aria-label="Study" className="flex flex-1 flex-col gap-0.5 px-2 py-3">
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          params={{ projectId: project.id }}
          activeOptions={{ exact: 'exact' in item && item.exact, includeSearch: false }}
          className="flex h-8.5 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted hover:bg-sunken hover:text-ink"
          activeProps={{ className: '!bg-accent-soft !text-accent font-medium' }}
        >
          <item.icon size={16} strokeWidth={1.9} />
          <span className="flex-1">{item.label}</span>
          {'badge' in item && issues > 0 && (
            <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn tabular-nums">{issues}</span>
          )}
        </Link>
      ))}
      <div className="mt-auto pt-3">
        <Link
          to="/p/$projectId/settings"
          params={{ projectId: project.id }}
          className="flex h-8.5 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted hover:bg-sunken hover:text-ink"
          activeProps={{ className: '!bg-accent-soft !text-accent font-medium' }}
        >
          <Settings size={16} strokeWidth={1.9} /> Settings & export
        </Link>
      </div>
    </nav>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-13 items-center border-b border-line px-4"><Logo /></div>
        {nav}
      </aside>

      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl">
            <div className="flex h-13 items-center justify-between border-b border-line px-4">
              <Logo />
              <IconButton label="Close navigation" onClick={() => setNavOpen(false)}><X size={16} /></IconButton>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-13 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
          <IconButton label="Open navigation" className="md:hidden" onClick={() => setNavOpen(true)}><Menu size={18} /></IconButton>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{project.name}</div>
          </div>
          <SaveState saving={saving} />
          <div className="flex items-center">
            <IconButton label={lastChange ? `Undo ${lastChange} (⌘Z)` : 'Nothing to undo'} disabled={!canUndo} onClick={undo}><Undo2 size={16} /></IconButton>
            <IconButton label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}><Redo2 size={16} /></IconButton>
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SaveState({ saving }: { saving: string }) {
  const text = saving === 'pending' ? 'Saving…' : saving === 'error' ? 'Not saved' : saving === 'saved' ? 'Saved' : ''
  return (
    <span aria-live="polite" className={cx('hidden text-xs sm:inline', saving === 'error' ? 'text-bad' : 'text-faint')}>{text}</span>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme)
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon
  return (
    <IconButton
      label={`Theme: ${theme}`}
      onClick={() => { const t = next[theme]; applyTheme(t); setTheme(t) }}
    >
      <Icon size={16} />
    </IconButton>
  )
}
