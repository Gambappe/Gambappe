/**
 * Design tokens (design doc §10.4). Single source of truth: the Tailwind theme
 * (`../tailwind.config.ts`) extends from these same values, and any future non-Tailwind
 * consumer (e.g. a WS8 satori/OG template needing inline styles) should import from here
 * rather than re-declaring hex values.
 */

export const colors = {
  bg: '#0B0B0D',
  surface: '#141417',
  paper: '#F4F1E8',
  ink: '#111111',
  muted: '#8B8B93',
  sideA: '#3B82F6',
  sideB: '#F97316',
  win: '#2DD4A7',
  loss: '#F43F5E',
} as const;

export const fonts = {
  ui: 'Inter, system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

export type ColorToken = keyof typeof colors;
export type FontToken = keyof typeof fonts;
