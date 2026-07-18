import type { Config } from 'tailwindcss';

import { colors, fonts } from './src/tokens.js';

/**
 * Shared Tailwind theme (design doc §10.4). apps/web pulls this in via `@config` so the
 * token values live in exactly one place (`src/tokens.ts`) instead of being duplicated
 * into a Tailwind-only config.
 */
const config: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        bg: colors.bg,
        surface: colors.surface,
        paper: colors.paper,
        ink: colors.ink,
        muted: colors.muted,
        'side-a': colors.sideA,
        'side-b': colors.sideB,
        win: colors.win,
        loss: colors.loss,
      },
      fontFamily: {
        ui: fonts.ui.split(', '),
        mono: fonts.mono.split(', '),
      },
    },
  },
};

export default config;
