'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Suppresses the click cue for high-frequency controls. */
  silent?: boolean;
}

/*
  Filled accents carry dark text, not white: white on #ff4d8d measures 3.1:1 and on
  #f2c14e only 1.7:1, both short of WCAG AA. Dark ink gets 6.1:1 and 11.4:1.
*/
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-ink border-transparent hover:bg-accent-soft shadow-lift',
  secondary:
    'bg-panel text-cream border-white/12 hover:bg-panel-hi hover:border-white/25',
  ghost: 'bg-transparent text-subtle border-transparent hover:bg-white/[0.06] hover:text-cream',
  danger: 'bg-transparent text-accent border-accent/40 hover:bg-accent/15',
  gold: 'bg-gold text-ink border-transparent hover:bg-gold-soft shadow-lift',
  outline: 'bg-transparent text-cream border-white/20 hover:bg-white/[0.07]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[11px] tracking-[0.14em]',
  md: 'h-10 px-4 text-xs tracking-[0.16em]',
  lg: 'h-12 px-6 text-sm tracking-[0.18em]',
  xl: 'h-16 px-8 text-base tracking-[0.2em]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, silent, onClick, children, ...props },
  ref,
) {
  const { cue } = useSettings();

  return (
    <button
      ref={ref}
      className={cn(
        'no-tap-highlight relative inline-flex items-center justify-center gap-2 rounded-lg border font-bold uppercase',
        'transition-all duration-150 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      onClick={(event) => {
        if (!silent) cue('click');
        onClick?.(event);
      }}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
});
