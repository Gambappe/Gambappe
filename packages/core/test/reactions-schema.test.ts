/**
 * SW10-T4 (wiring-gaps doc §4): `REACTION_SET` vs `PAIRING_REACTION_SET` must stay two
 * disjoint sets — extending `REACTION_SET` would leak the pairing text presets into every
 * question-thread reaction picker (`QuestionThread.tsx`, keyed 1:1 against `copy.ts`'s
 * `reactionLabels`), unlabeled. This is the structural half of the AC's "grep test" (the UI half
 * — proving neither picker component ever renders the other set's values — lives in
 * `apps/web/test/reaction-stamps-separation.test.tsx`).
 */
import { describe, expect, it } from 'vitest';
import { PAIRING_REACTION_SET, REACTION_SET } from '../src/config.js';
import {
  createReactionBodySchema,
  createReactionResponseSchema,
  pairingReactionEmojiSchema,
  reactionEmojiSchema,
} from '../src/schemas/threads.js';

describe('REACTION_SET vs PAIRING_REACTION_SET separation', () => {
  it('the two sets share no values', () => {
    const overlap = REACTION_SET.filter((emoji) => (PAIRING_REACTION_SET as readonly string[]).includes(emoji));
    expect(overlap).toEqual([]);
  });

  it('reactionEmojiSchema (question/duo_match) rejects every PAIRING_REACTION_SET value', () => {
    for (const stamp of PAIRING_REACTION_SET) {
      expect(reactionEmojiSchema.safeParse(stamp).success).toBe(false);
    }
  });

  it('pairingReactionEmojiSchema (pairing) rejects every REACTION_SET value', () => {
    for (const emoji of REACTION_SET) {
      expect(pairingReactionEmojiSchema.safeParse(emoji).success).toBe(false);
    }
  });
});

describe('createReactionBodySchema (§9.2 POST /reactions, SW10-T4 union)', () => {
  const contextId = '018f0000-0000-7000-8000-000000000000';

  it('accepts a pairing body with a PAIRING_REACTION_SET stamp', () => {
    const result = createReactionBodySchema.safeParse({
      context_kind: 'pairing',
      context_id: contextId,
      emoji: 'Lucky',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a pairing body carrying a REACTION_SET emoji (no cross-set leakage)', () => {
    const result = createReactionBodySchema.safeParse({
      context_kind: 'pairing',
      context_id: contextId,
      emoji: '🔥',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a question body with a REACTION_SET emoji', () => {
    const result = createReactionBodySchema.safeParse({
      context_kind: 'question',
      context_id: contextId,
      emoji: '🔥',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a question body carrying a PAIRING_REACTION_SET stamp (no cross-set leakage)', () => {
    const result = createReactionBodySchema.safeParse({
      context_kind: 'question',
      context_id: contextId,
      emoji: 'Lucky',
    });
    expect(result.success).toBe(false);
  });

  it('rejects free text on either branch (P1: preset-only, no free-text input)', () => {
    expect(
      createReactionBodySchema.safeParse({ context_kind: 'pairing', context_id: contextId, emoji: 'nice one' })
        .success,
    ).toBe(false);
    expect(
      createReactionBodySchema.safeParse({ context_kind: 'question', context_id: contextId, emoji: '👍' }).success,
    ).toBe(false);
  });
});

describe('createReactionResponseSchema', () => {
  it('accepts the pairing-only "replaced" state alongside the original toggle states', () => {
    expect(createReactionResponseSchema.safeParse({ state: 'added' }).success).toBe(true);
    expect(createReactionResponseSchema.safeParse({ state: 'removed' }).success).toBe(true);
    expect(createReactionResponseSchema.safeParse({ state: 'replaced' }).success).toBe(true);
    expect(createReactionResponseSchema.safeParse({ state: 'bogus' }).success).toBe(false);
  });
});
