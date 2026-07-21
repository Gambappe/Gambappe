import type { ReactNode } from 'react';

export interface TapeLabelProps {
  children: ReactNode;
  /** Give the strip a slight torn-on-at-an-angle tilt (masking-tape feel). Default true; set
   * false for a level strip inside tight rows. */
  tilt?: boolean;
  className?: string;
}

/**
 * WS16-T3 · `TapeLabel` — the masking-tape state label (journeys-plan §2): "SAME SIDE",
 * "YOU'VE BEEN CALLED OUT", "SAME SIDE · EDGE DECIDES". One implementation of the tape look
 * (previously Stamp's `tape` ink, re-homed here as a first-class label so state surfaces don't
 * hand-roll it). A translucent stock strip pressed onto the card at a slight angle, mono
 * caps — deliberately low-key next to the loud rubber/foil stamps.
 *
 * Colours come from `src/tokens.ts` only: `paper` at high alpha reads as tan tape over the dark
 * stage, `ink` text keeps AA on it. The faint side rules suggest the tape's torn ends.
 */
export function TapeLabel({ children, tilt = true, className = '' }: TapeLabelProps) {
  const tiltClass = tilt ? '-rotate-2' : '';
  return (
    <span
      data-testid="tape-label"
      className={`bg-paper/90 text-ink border-x border-ink/15 inline-block px-3 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] uppercase shadow-[0_2px_6px_rgba(0,0,0,0.25)] ${tiltClass} ${className}`}
    >
      {children}
    </span>
  );
}
