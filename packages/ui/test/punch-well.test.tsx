/**
 * WS16-T3 · `PunchWell` — price/side well with the dashed punch circle (journeys-plan §2).
 * Pure presentational; `renderToStaticMarkup` (repo pattern). Asserts side identity, the
 * cents-of-probability print (never a money amount, INV-1/7), and the punched fill state.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { PunchWell } from '../src/components/PunchWell.js';

describe('PunchWell', () => {
  it('carries data-side and the side accent border', () => {
    const html = renderToStaticMarkup(<PunchWell side="yes" label="CUTS" yesProbability={0.71} />);
    expect(html).toContain('data-side="yes"');
    expect(html).toContain('border-side-a');
  });

  it('prints the side in cents-of-probability with an implied-probability a11y label', () => {
    const html = renderToStaticMarkup(<PunchWell side="yes" label="CUTS" yesProbability={0.71} />);
    expect(html).toContain('71¢');
    expect(html).toContain('CUTS: 71% implied');
    expect(html).not.toMatch(/\$/);
  });

  it('prints the NO side as the complement (29¢ for a 0.71 yes-prob)', () => {
    const html = renderToStaticMarkup(<PunchWell side="no" label="HOLDS" yesProbability={0.71} />);
    expect(html).toContain('data-side="no"');
    expect(html).toContain('border-side-b');
    expect(html).toContain('29¢');
  });

  it('leaves the punch circle unfilled by default (data-punched="false")', () => {
    const html = renderToStaticMarkup(<PunchWell side="yes" label="CUTS" yesProbability={0.5} />);
    expect(html).toContain('data-punched="false"');
    expect(html).toContain('border-dashed');
    expect(html).toContain('bg-transparent');
  });

  it('fills the punch circle in the side hue when punched', () => {
    const html = renderToStaticMarkup(
      <PunchWell side="no" label="HOLDS" yesProbability={0.5} punched />,
    );
    expect(html).toContain('data-punched="true"');
    expect(html).toContain('bg-side-b');
    expect(html).not.toContain('bg-transparent');
  });
});
