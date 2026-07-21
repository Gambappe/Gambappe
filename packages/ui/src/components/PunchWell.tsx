import { impliedCents, type MarketSide } from '../format.js';

export interface PunchWellProps {
  side: MarketSide;
  /** Side name printed in the well, e.g. "CUTS" / "HOLDS". */
  label: string;
  /** Live venue yes-probability (0–1); the well prints the side's implied cents. */
  yesProbability: number;
  /** The pick action's visual: when true the dashed punch circle is filled in the side hue. */
  punched?: boolean;
  className?: string;
}

/**
 * WS16-T3 · `PunchWell` — a price/side well with a dashed die-cut punch circle (journeys-plan
 * §2). Replaces the ad-hoc `PriceTag` framing on the ballot: the well is the throwable target,
 * and `punched` is the pick action's visual (the circle fills in the side hue, the way a
 * conductor's punch marks a ticket). `PriceTag` itself stays for inline price chips.
 *
 * Side identity rides the coloured border + punch dot (UI elements, AA at 3:1) while the label
 * and cents stay `ink` on paper (AA at 4.5:1) — the same contrast strategy as `BallotCard`'s
 * price chips, since the bright side tokens fail AA as text on cream. `data-side` anchors the
 * axis-order tests; `data-punched` lets pick surfaces assert the filled state.
 */
export function PunchWell({ side, label, yesProbability, punched = false, className = '' }: PunchWellProps) {
  const cents = impliedCents(side, yesProbability);
  const accent = side === 'yes' ? 'border-side-a' : 'border-side-b';
  const fill = side === 'yes' ? 'bg-side-a' : 'bg-side-b';
  const dot = side === 'yes' ? 'border-side-a' : 'border-side-b';

  return (
    <div
      data-side={side}
      data-punched={punched ? 'true' : 'false'}
      className={`text-ink flex flex-1 items-center gap-2.5 rounded-md border-2 px-2.5 py-1.5 ${accent} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-5 w-5 shrink-0 rounded-full border-2 border-dashed ${dot} ${punched ? fill : 'bg-transparent'}`}
      />
      <span className="flex flex-col">
        <span className="font-mono text-[10px] font-semibold tracking-wider uppercase">{label}</span>
        <span className="font-mono text-lg font-semibold" aria-label={`${label}: ${cents}% implied`}>
          @ {cents}¢
        </span>
      </span>
    </div>
  );
}
