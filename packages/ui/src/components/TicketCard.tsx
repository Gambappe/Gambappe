import type { ReactNode } from 'react';

import { colors } from '../tokens.js';

const PUNCH_SIZE = 12;
const perforationStyle = {
  backgroundImage: `radial-gradient(circle at center, ${colors.bg} 40%, transparent 42%)`,
  backgroundSize: `${PUNCH_SIZE}px ${PUNCH_SIZE}px`,
  backgroundRepeat: 'repeat-x',
  backgroundPosition: 'center',
} as const;

export interface TicketCardProps {
  children: ReactNode;
  className?: string;
}

/** The paper-on-dark receipt motif (§10.4): perforated top/bottom edge, printed-paper surface. */
export function TicketCard({ children, className = '' }: TicketCardProps) {
  return (
    <div className={`bg-paper text-ink relative rounded-md shadow-lg ${className}`}>
      <div aria-hidden="true" className="h-1.5 -translate-y-1" style={perforationStyle} />
      <div className="px-6 py-5">{children}</div>
      <div aria-hidden="true" className="h-1.5 translate-y-1" style={perforationStyle} />
    </div>
  );
}
