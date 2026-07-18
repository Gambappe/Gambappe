import type { MarketSide } from '../format.js';
import { impliedCents } from '../format.js';

export interface PriceTagProps {
  side: MarketSide;
  label: string;
  yesProbability: number;
  className?: string;
}

/**
 * §10.4 PriceTag: printed entry price ("YES @ 63¢"). This is cents-of-probability
 * (standard prediction-market notation), never a money amount (INV-1/7) — the a11y
 * label says so explicitly.
 */
export function PriceTag({ side, label, yesProbability, className = '' }: PriceTagProps) {
  const cents = impliedCents(side, yesProbability);
  const accentClass = side === 'yes' ? 'text-side-a' : 'text-side-b';
  return (
    <span
      className={`font-mono ${accentClass} inline-flex items-baseline gap-1.5 text-sm ${className}`}
      aria-label={`${cents}% implied`}
    >
      <span className="text-ink font-sans font-medium uppercase">{label}</span>
      <span>@ {cents}¢</span>
    </span>
  );
}
