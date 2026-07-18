export interface StreakFlameProps {
  count: number;
  frozen?: boolean;
  className?: string;
}

/** §10.4 StreakFlame: the participation streak (DD-3), count always printed in mono. */
export function StreakFlame({ count, frozen = false, className = '' }: StreakFlameProps) {
  const glyph = frozen ? '❄️' : '🔥';
  const word = frozen ? 'frozen streak' : 'day streak';
  return (
    <span
      className={`font-mono inline-flex items-center gap-1 text-sm font-semibold ${className}`}
      aria-label={`${count} ${word}`}
    >
      <span aria-hidden="true">{glyph}</span>
      {count}
    </span>
  );
}
