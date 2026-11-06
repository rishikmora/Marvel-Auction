'use client';

import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  className,
  glow,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div className={cn('panel', glow && 'edge-glow', className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 sm:px-5', className)}>
      <div className="min-w-0">
        <h2 className="display text-sm text-white sm:text-base">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-[var(--text-low)]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat                                                                */
/* ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'gold' | 'crimson' | 'plasma' | 'toxic';
  className?: string;
}) {
  const tones = {
    default: 'text-white',
    gold: 'text-gold',
    crimson: 'text-accent-soft',
    plasma: 'text-sky',
    toxic: 'text-mint',
  } as const;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="eyebrow truncate">{label}</div>
      <div className={cn('tabular display mt-1 text-xl sm:text-2xl', tones[tone])}>{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-[var(--text-low)]">{hint}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'crimson' | 'gold' | 'plasma' | 'toxic' | 'vibranium';
  className?: string;
}) {
  const tones = {
    neutral: 'border-white/12 bg-white/[0.06] text-[var(--text-mid)]',
    crimson: 'border-accent/40 bg-accent/12 text-accent-soft',
    gold: 'border-gold/40 bg-gold/12 text-gold',
    plasma: 'border-sky/40 bg-sky/12 text-sky',
    toxic: 'border-mint/40 bg-mint/12 text-mint',
    vibranium: 'border-violet/40 bg-violet/12 text-violet',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-3 text-2xl opacity-50">{icon}</div> : null}
      <p className="display text-sm text-[var(--text-mid)]">{title}</p>
      {description ? (
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-[var(--text-low)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Meter                                                               */
/* ------------------------------------------------------------------ */

export function Meter({
  value,
  max = 100,
  tone = 'crimson',
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: 'crimson' | 'gold' | 'plasma' | 'toxic' | 'vibranium';
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const tones = {
    crimson: 'bg-accent',
    gold: 'bg-gold',
    plasma: 'bg-sky',
    toxic: 'bg-mint',
    vibranium: 'bg-violet',
  } as const;

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]', className)}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', tones[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section heading                                                     */
/* ------------------------------------------------------------------ */

export function SectionTitle({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-5', className)}>
      {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
      <h2 className="display text-2xl text-white sm:text-3xl">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-mid)]">{description}</p>
      ) : null}
    </div>
  );
}
