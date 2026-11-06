'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * Pip — the auction paddle mascot.
 *
 * An original character drawn inline as SVG: a bidder's paddle with a face, so the
 * friendliest thing on the page is also the thing you use to play. No asset to load and
 * it scales cleanly at any size.
 */
export function Mascot({
  size = 96,
  className,
  idle = true,
}: {
  size?: number;
  className?: string;
  /** Gentle bobbing. Disabled automatically under reduced motion via the global CSS. */
  idle?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={cn(idle && 'animate-bob', className)}
      role="img"
      aria-label="Pip, the auction paddle mascot"
    >
      <defs>
        <linearGradient id={`body${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff6fa0" />
          <stop offset="100%" stopColor="#e03570" />
        </linearGradient>
      </defs>

      {/* sparkles */}
      <g fill="#f2c14e">
        <path d="M22 26l2.4 5.6L30 34l-5.6 2.4L22 42l-2.4-5.6L14 34l5.6-2.4z" />
        <path d="M98 44l1.8 4.2L104 50l-4.2 1.8L98 56l-1.8-4.2L92 50l4.2-1.8z" opacity=".85" />
        <circle cx="96" cy="28" r="2.6" opacity=".7" />
      </g>

      {/* handle */}
      <rect x="54" y="80" width="12" height="26" rx="6" fill="#2a2622" />
      <rect x="50" y="100" width="20" height="9" rx="4.5" fill="#201d1a" />

      {/* arms */}
      <path
        d="M28 62c-7 2-11 7-12 13"
        stroke="#2a2622"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M92 62c7 2 11 7 12 13"
        stroke="#2a2622"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />

      {/* paddle face plate */}
      <rect x="26" y="16" width="68" height="68" rx="18" fill="#2a2622" />
      <rect x="29" y="19" width="62" height="62" rx="15.5" fill={`url(#body${uid})`} />

      {/* bid number on the paddle */}
      <text
        x="60"
        y="36"
        textAnchor="middle"
        fontFamily="Arial Black, Impact, sans-serif"
        fontSize="13"
        fill="#1a0a12"
        fillOpacity=".55"
      >
        7
      </text>

      {/* eyes */}
      <g fill="#1a0a12">
        <ellipse cx="48" cy="54" rx="5.2" ry="6.2" />
        <ellipse cx="72" cy="54" rx="5.2" ry="6.2" />
      </g>
      <g fill="#ffffff" opacity=".9">
        <circle cx="49.8" cy="51.8" r="1.7" />
        <circle cx="73.8" cy="51.8" r="1.7" />
      </g>

      {/* cheeks + smile */}
      <g fill="#1a0a12" opacity=".16">
        <ellipse cx="39" cy="63" rx="5" ry="3.2" />
        <ellipse cx="81" cy="63" rx="5" ry="3.2" />
      </g>
      <path
        d="M53 65c2.6 3 11.4 3 14 0"
        stroke="#1a0a12"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** The mascot inside the big circular badge used on the landing hero. */
export function MascotBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex aspect-square w-full max-w-[320px] items-center justify-center rounded-full',
        className,
      )}
      style={{ background: 'radial-gradient(circle at 50% 42%, #6b5a22 0%, #3a3119 55%, #241f14 100%)' }}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-gold/20"
        aria-hidden
      />
      <Mascot size={190} />
    </div>
  );
}
