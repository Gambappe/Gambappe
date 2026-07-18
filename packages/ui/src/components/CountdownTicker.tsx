'use client';

import { useEffect, useState } from 'react';

import { countdownParts, formatCountdown } from '../format.js';

export interface CountdownTickerProps {
  targetIso: string;
  serverOffsetMs?: number;
  label?: string;
  className?: string;
}

/**
 * §10.3/§10.4 CountdownTicker: countdown to lock/reveal. Consumers own the server-time
 * offset (§9.1 `x-server-time`) and the T-0 re-fetch; this component only renders the tick.
 */
export function CountdownTicker({
  targetIso,
  serverOffsetMs = 0,
  label,
  className = '',
}: CountdownTickerProps) {
  const targetMs = new Date(targetIso).getTime();
  const [nowMs, setNowMs] = useState(() => Date.now() + serverOffsetMs);

  useEffect(() => {
    const tick = () => setNowMs(Date.now() + serverOffsetMs);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverOffsetMs]);

  const display = formatCountdown(countdownParts(targetMs, nowMs));

  return (
    <span className={`font-mono inline-flex items-baseline gap-1.5 ${className}`}>
      {label ? <span className="text-muted text-xs tracking-wide uppercase">{label}</span> : null}
      <span aria-live="polite" suppressHydrationWarning>
        {display}
      </span>
    </span>
  );
}
