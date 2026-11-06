'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-[var(--text-low)] transition-colors focus:border-sky/60 focus:bg-black/60 ' +
  'disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: { id: string; describedBy?: string }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="eyebrow mb-2 block">
        {label}
      </label>
      {children({ id, describedBy: hintId })}
      {error ? (
        <p id={hintId} className="mt-1.5 text-[11px] text-accent-soft">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[11px] text-[var(--text-low)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function NumberInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" inputMode="numeric" className={cn(CONTROL, 'tabular', className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'no-tap-highlight flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        checked ? 'border-accent/40 bg-accent/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 transition-colors',
          checked ? 'border-accent/60 bg-accent/40' : 'border-white/15 bg-white/10',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'h-3.5 w-3.5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold uppercase tracking-[0.12em] text-white">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-low)]">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  multiple,
  label,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!multiple) {
                onChange(active ? [] : [option.value]);
                return;
              }
              onChange(
                active ? value.filter((entry) => entry !== option.value) : [...value, option.value],
              );
            }}
            className={cn(
              'no-tap-highlight rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
              active
                ? 'border-accent/50 bg-accent/15 text-white'
                : 'border-white/10 bg-white/[0.03] text-[var(--text-mid)] hover:bg-white/[0.08]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
