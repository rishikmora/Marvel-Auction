'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { unlockAudio } from '@/lib/sound';

export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'text-base sm:text-lg',
    md: 'text-lg sm:text-2xl',
    lg: 'text-3xl sm:text-4xl',
  } as const;

  return (
    <span className={cn('wordmark block truncate text-accent', sizes[size], className)}>
      Marvel Auction
    </span>
  );
}

/** Round icon button used across the header. */
function IconButton({
  label,
  active,
  onClick,
  href,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    'no-tap-highlight grid h-9 w-9 place-items-center rounded-pill border transition-colors',
    active
      ? 'border-accent/45 bg-accent/15 text-accent'
      : 'border-white/10 bg-panel text-subtle hover:border-white/25 hover:text-cream',
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={label} title={label}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* Minimal line icons, drawn inline so there is no icon dependency. */
const Icon = {
  book: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" strokeLinejoin="round" />
      <path d="M8 7h7M8 11h7" strokeLinecap="round" />
    </svg>
  ),
  sound: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 9v6h4l5 4V5L9 9z" strokeLinejoin="round" />
      <path d="M17 9.5a3.5 3.5 0 0 1 0 5" strokeLinecap="round" />
    </svg>
  ),
  mute: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 9v6h4l5 4V5L9 9z" strokeLinejoin="round" />
      <path d="M17 10l4 4M21 10l-4 4" strokeLinecap="round" />
    </svg>
  ),
  motion: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </svg>
  ),
  contrast: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 6.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
    </svg>
  ),
  trophy: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" strokeLinejoin="round" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M10 19h4M12 14v5" strokeLinecap="round" />
    </svg>
  ),
};

/** Accessibility + sound preferences, available from every screen. */
export function SettingsBar({ className }: { className?: string }) {
  const { sound, reduceMotion, highContrast, toggle, set } = useSettings();

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <IconButton
        label={sound ? 'Sound on' : 'Sound off'}
        active={sound}
        onClick={() => {
          if (!sound) unlockAudio();
          set('sound', !sound);
        }}
      >
        {sound ? Icon.sound : Icon.mute}
      </IconButton>
      <IconButton
        label={reduceMotion ? 'Motion reduced' : 'Reduce motion'}
        active={reduceMotion}
        onClick={() => toggle('reduceMotion')}
      >
        {Icon.motion}
      </IconButton>
      <IconButton
        label={highContrast ? 'High contrast on' : 'High contrast'}
        active={highContrast}
        onClick={() => toggle('highContrast')}
      >
        {Icon.contrast}
      </IconButton>
    </div>
  );
}

export function SiteHeader({
  right,
  compact,
  showNav = true,
}: {
  right?: React.ReactNode;
  compact?: boolean;
  showNav?: boolean;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-white/8 bg-ink/85 backdrop-blur-xl',
        compact ? 'py-2' : 'py-3',
      )}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-5">
        <Link href="/" className="no-tap-highlight min-w-0 flex-1">
          <Wordmark size={compact ? 'sm' : 'md'} />
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          {right}
          {showNav ? (
            <span className="hidden items-center gap-1.5 sm:flex">
              <IconButton label="How to play" href="/how-to-play">
                {Icon.book}
              </IconButton>
              <IconButton label="Past battles" href="/history">
                {Icon.trophy}
              </IconButton>
            </span>
          ) : null}
          <SettingsBar />
        </div>
      </div>
    </header>
  );
}

export function PageShell({
  children,
  header,
  className,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh">
      {header ?? <SiteHeader />}
      <main className={cn('mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-5 sm:py-9', className)}>
        {children}
      </main>
    </div>
  );
}

/** Shared footer: the fan-made disclaimer plus the secondary link row. */
export function SiteFooter() {
  const links = [
    ['How to play', '/how-to-play'],
    ['Past battles', '/history'],
    ['Career stats', '/leaderboard'],
    ['Admin', '/admin'],
  ] as const;

  return (
    <footer className="mt-16 border-t border-white/8 py-9">
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 text-center sm:px-5">
        <p className="text-xs leading-relaxed text-muted">
          Fan-made and unofficial. Not affiliated with Marvel or any publisher. Character stats
          are invented for game balance.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="text-xs text-subtle hover:text-cream">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
