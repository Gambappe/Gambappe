import { crowdSplit } from '../format.js';

export interface CrowdBarProps {
  yesCount: number;
  noCount: number;
  yesLabel: string;
  noLabel: string;
  className?: string;
}

/** §10.3/§10.4 CrowdBar: the crowd split, revealed at lock. Labels always ship with the color. */
export function CrowdBar({ yesCount, noCount, yesLabel, noLabel, className = '' }: CrowdBarProps) {
  const { yesPct, noPct } = crowdSplit(yesCount, noCount);
  return (
    <div className={className}>
      <div className="text-muted mb-1 flex justify-between text-xs font-medium uppercase">
        <span className="text-side-a">
          {yesLabel} {yesPct}%
        </span>
        <span className="text-side-b">
          {noLabel} {noPct}%
        </span>
      </div>
      <div
        role="img"
        aria-label={`Crowd split: ${yesLabel} ${yesPct}%, ${noLabel} ${noPct}%`}
        className="flex h-3 w-full overflow-hidden rounded-full"
      >
        <div className="bg-side-a h-full" style={{ width: `${yesPct}%` }} />
        <div className="bg-side-b h-full" style={{ width: `${noPct}%` }} />
      </div>
    </div>
  );
}
