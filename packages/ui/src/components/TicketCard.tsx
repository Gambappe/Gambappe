import type { ReactNode } from 'react';

import { TicketFrame } from './TicketFrame.js';

export interface TicketCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * The paper-on-dark receipt motif (§10.4): perforated top/bottom edge, printed-paper surface.
 *
 * WS16-T3: now a thin composition of `TicketFrame` (journeys-plan §2 migration rule — the only
 * perforation CSS in the package lives in `TicketFrame`). Same perforated-both-edges paper card;
 * the roomier `px-6 py-5` body padding is preserved via `bodyClassName`.
 */
export function TicketCard({ children, className = '' }: TicketCardProps) {
  return (
    <TicketFrame perf="both" bodyClassName="px-6 py-5" className={`shadow-lg ${className}`}>
      {children}
    </TicketFrame>
  );
}
