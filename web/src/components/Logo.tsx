import { Link } from '@tanstack/react-router'

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M8 11h16M8 16h16M8 21h10" stroke="var(--accent-ink)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {!compact && <span>Research Weave</span>}
    </Link>
  )
}
