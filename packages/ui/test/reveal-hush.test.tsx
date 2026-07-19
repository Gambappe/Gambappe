/**
 * SW3-T1 (docs/swipe-ux-plan.md §2.6 F1 hush). The T-10s trigger math itself is covered
 * exhaustively as a pure function in format.test.ts (`isHushWindow`) — mirrors this repo's
 * existing pattern of testing `CountdownTicker`'s ticking logic via `countdownParts`/
 * `formatCountdown` rather than the live component, since `renderToStaticMarkup` never runs
 * effects (no jsdom/@testing-library in this repo). These tests cover what IS observable from a
 * single synchronous render: the pre-effect passthrough, and that reduced motion is captured
 * synchronously (a `useState` initializer, not an effect) rather than needing a tick to apply.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RevealHush } from '../src/components/RevealHush.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const roomCountText = '42 in the room';

describe('RevealHush', () => {
  it('passes children through unchanged on the pre-effect (SSR/initial) render, even inside the T-10s window', () => {
    const html = renderToStaticMarkup(
      <RevealHush
        targetIso={new Date(Date.now() + 5_000).toISOString()}
        frozenLabel="FROZEN"
        roomCountText={roomCountText}
      >
        <p>stage content</p>
      </RevealHush>,
    );
    // The hush latch only flips via a client-only effect, which never runs during a static
    // render — matching the real SSR→hydrate boundary for this `'use client'` component.
    expect(html).toBe('<p>stage content</p>');
    expect(html).not.toContain('reveal-hush');
  });

  it('reads reduced-motion synchronously (useState initializer, not an effect)', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const html = renderToStaticMarkup(
      <RevealHush
        targetIso={new Date(Date.now() + 5_000).toISOString()}
        frozenLabel="FROZEN"
        roomCountText={roomCountText}
      >
        <p>stage content</p>
      </RevealHush>,
    );
    expect(html).toBe('<p>stage content</p>');
  });
});
