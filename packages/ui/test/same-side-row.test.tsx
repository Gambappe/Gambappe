/**
 * WS16-T3 · `SameSideRow` — two Stamps side by side with owner/mono captions + the edge line
 * (journeys-plan §2, D-J4).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { SameSideRow } from '../src/components/SameSideRow.js';
import { Stamp } from '../src/components/Stamp.js';

const left = {
  owner: 'YOU',
  caption: '@ 71¢',
  stamp: <Stamp variant="win" />,
};
const right = {
  owner: 'MARIA O.',
  caption: '@ 74¢',
  stamp: <Stamp variant="loss" />,
};

describe('SameSideRow', () => {
  it('renders both owners and captions', () => {
    const html = renderToStaticMarkup(<SameSideRow left={left} right={right} />);
    for (const s of ['YOU', 'MARIA O.', '@ 71¢', '@ 74¢']) {
      expect(html).toContain(s);
    }
  });

  it('renders the left owner strictly before the right owner', () => {
    const html = renderToStaticMarkup(<SameSideRow left={left} right={right} />);
    expect(html.indexOf('YOU')).toBeLessThan(html.indexOf('MARIA O.'));
  });

  it('renders both caller-supplied stamps', () => {
    const html = renderToStaticMarkup(<SameSideRow left={left} right={right} />);
    expect(html).toContain('WIN');
    expect(html).toContain('LOSS');
  });

  it('draws the dashed edge line between the two columns', () => {
    const html = renderToStaticMarkup(<SameSideRow left={left} right={right} />);
    expect(html).toContain('border-dashed');
    expect(html).toContain('data-testid="same-side-row"');
  });
});
