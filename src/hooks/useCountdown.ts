'use client';

import { useEffect, useRef, useState } from 'react';

export type Urgency = 'idle' | 'normal' | 'warning' | 'critical';

export interface Countdown {
  remainingMs: number;
  seconds: number;
  urgency: Urgency;
  running: boolean;
}

/**
 * Renders a countdown from the server's absolute end time.
 *
 * The offset corrects for clock drift between the player's device and the server, so two
 * players in different timezones (or with a badly-set clock) see the same number.
 */
export function useCountdown(
  endsAt: number | null,
  clockOffset = 0,
  options: { warningAt?: number; criticalAt?: number } = {},
): Countdown {
  const { warningAt = 10, criticalAt = 5 } = options;
  const [remainingMs, setRemainingMs] = useState(() =>
    endsAt === null ? 0 : Math.max(0, endsAt - (Date.now() + clockOffset)),
  );
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (endsAt === null) {
      setRemainingMs(0);
      return;
    }

    let active = true;
    const update = () => {
      if (!active) return;
      const next = Math.max(0, endsAt - (Date.now() + clockOffset));
      setRemainingMs(next);
      if (next > 0) {
        frame.current = window.requestAnimationFrame(update);
      }
    };
    update();

    return () => {
      active = false;
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [endsAt, clockOffset]);

  const seconds = Math.ceil(remainingMs / 1000);
  let urgency: Urgency = 'idle';
  if (endsAt !== null && remainingMs > 0) {
    if (seconds <= criticalAt) urgency = 'critical';
    else if (seconds <= warningAt) urgency = 'warning';
    else urgency = 'normal';
  }

  return { remainingMs, seconds, urgency, running: endsAt !== null && remainingMs > 0 };
}
