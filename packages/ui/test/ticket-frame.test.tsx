/**
 * WS16-T3 · `TicketFrame` — the one card shell (journeys-plan §2). Pure presentational; uses
 * `renderToStaticMarkup` (repo pattern, no jsdom). Asserts the header/notches/perf/stub/tone
 * slots and the conditional positioning contract.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { TicketFrame } from '../src/components/TicketFrame.js';

describe('TicketFrame', () => {
  it('renders the ADMIT header with both slots and a 2px bottom rule + .22em tracking', () => {
    const html = renderToStaticMarkup(
      <TicketFrame header={{ left: 'GAMBAPPE', right: 'ADMIT ONE' }}>body</TicketFrame>,
    );
    expect(html).toContain('GAMBAPPE');
    expect(html).toContain('ADMIT ONE');
    expect(html).toContain('border-b-2');
    expect(html).toContain('tracking-[0.22em]');
  });

  it('omits the header entirely when not given one', () => {
    const html = renderToStaticMarkup(<TicketFrame>body</TicketFrame>);
    expect(html).not.toContain('border-b-2');
  });

  it('renders perf edges only where requested', () => {
    const count = (html: string) => (html.match(/radial-gradient/g) ?? []).length;
    expect(count(renderToStaticMarkup(<TicketFrame>b</TicketFrame>))).toBe(0);
    expect(count(renderToStaticMarkup(<TicketFrame perf="top">b</TicketFrame>))).toBe(1);
    expect(count(renderToStaticMarkup(<TicketFrame perf="bottom">b</TicketFrame>))).toBe(1);
    expect(count(renderToStaticMarkup(<TicketFrame perf="both">b</TicketFrame>))).toBe(2);
    // top strip lifts up (`-translate-y-1`), bottom strip drops down (`translate-y-1`).
    expect(renderToStaticMarkup(<TicketFrame perf="top">b</TicketFrame>)).toContain('-translate-y-1');
  });

  it('renders two side notches only when notches=true', () => {
    const off = renderToStaticMarkup(<TicketFrame>b</TicketFrame>);
    expect(off).not.toContain('-left-[7px]');
    const on = renderToStaticMarkup(<TicketFrame notches>b</TicketFrame>);
    expect(on).toContain('-left-[7px]');
    expect(on).toContain('-right-[7px]');
  });

  it('renders the tear-off stub with serial, dashed rule, and optional barcode', () => {
    const withBar = renderToStaticMarkup(
      <TicketFrame stub={{ serial: '№ 2026-07-19', barcode: true }}>b</TicketFrame>,
    );
    expect(withBar).toContain('№ 2026-07-19');
    expect(withBar).toContain('border-dashed');
    expect(withBar).toContain('repeating-linear-gradient');

    const noBar = renderToStaticMarkup(
      <TicketFrame stub={{ serial: 'S', barcode: false }}>b</TicketFrame>,
    );
    expect(noBar).not.toContain('repeating-linear-gradient');
  });

  it('defaults to the paper tone and switches surface classes for board', () => {
    const paper = renderToStaticMarkup(<TicketFrame>b</TicketFrame>);
    expect(paper).toContain('data-tone="paper"');
    expect(paper).toContain('bg-paper');
    const board = renderToStaticMarkup(<TicketFrame tone="board">b</TicketFrame>);
    expect(board).toContain('data-tone="board"');
    expect(board).toContain('bg-surface');
    expect(board).toContain('text-paper');
  });

  it('only claims `relative` when it has notches or an overlay (the UnderCard position trap)', () => {
    const bare = renderToStaticMarkup(<TicketFrame perf="both">b</TicketFrame>);
    expect(bare).not.toMatch(/class="relative/);
    const withOverlay = renderToStaticMarkup(
      <TicketFrame overlay={<span data-testid="ov" />}>b</TicketFrame>,
    );
    expect(withOverlay).toContain('relative');
    expect(withOverlay).toContain('data-testid="ov"');
    const withNotches = renderToStaticMarkup(<TicketFrame notches>b</TicketFrame>);
    expect(withNotches).toContain('relative');
  });

  it('hides the frame from the a11y tree when ariaHidden', () => {
    const html = renderToStaticMarkup(<TicketFrame ariaHidden>b</TicketFrame>);
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders children in the body', () => {
    const html = renderToStaticMarkup(
      <TicketFrame>
        <span data-testid="child">hi</span>
      </TicketFrame>,
    );
    expect(html).toContain('data-testid="child"');
  });
});
