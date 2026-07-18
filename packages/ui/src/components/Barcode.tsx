import { barcodePattern } from '../format.js';

export interface BarcodeProps {
  path: string;
  className?: string;
}

/**
 * §10.4 Barcode: decorative footer motif rendering the page path as text beneath a faux
 * barcode — there is no separate short-URL system, and this isn't a scannable code.
 */
export function Barcode({ path, className = '' }: BarcodeProps) {
  const bars = barcodePattern(path);
  return (
    <div aria-hidden="true" className={`text-muted select-none ${className}`}>
      <div className="flex h-6 items-end gap-px">
        {bars.map((height, i) => (
          <span key={i} className="bg-muted w-0.5" style={{ height: `${height * 4}px` }} />
        ))}
      </div>
      <p className="font-mono mt-1 text-[10px] tracking-[0.2em]">{path}</p>
    </div>
  );
}
