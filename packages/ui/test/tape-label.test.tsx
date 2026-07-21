/**
 * WS16-T3 · `TapeLabel` — the masking-tape state label (journeys-plan §2).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { TapeLabel } from '../src/components/TapeLabel.js';

describe('TapeLabel', () => {
  it('renders its children as a mono tape strip', () => {
    const html = renderToStaticMarkup(<TapeLabel>SAME SIDE</TapeLabel>);
    expect(html).toContain('SAME SIDE');
    expect(html).toContain('font-mono');
    expect(html).toContain('data-testid="tape-label"');
  });

  it('tilts by default and can be leveled', () => {
    expect(renderToStaticMarkup(<TapeLabel>YOU&apos;VE BEEN CALLED OUT</TapeLabel>)).toContain(
      '-rotate-2',
    );
    expect(renderToStaticMarkup(<TapeLabel tilt={false}>LEVEL</TapeLabel>)).not.toContain(
      '-rotate-2',
    );
  });

  it('appends caller classes', () => {
    const html = renderToStaticMarkup(<TapeLabel className="mt-4">X</TapeLabel>);
    expect(html).toContain('mt-4');
  });
});
