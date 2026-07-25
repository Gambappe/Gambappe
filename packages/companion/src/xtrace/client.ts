/**
 * xTrace REST client (docs/xtrace-hackathon-tasks.md XH-T2). The only file in the repo
 * allowed to call the xTrace HTTP API directly — every other task goes through this.
 *
 * Fail-open contract: `ingest` and `search` NEVER throw. Any failure (non-2xx, timeout,
 * network error, zod parse failure) logs via `logger` and degrades to `false` / `[]`. This
 * mirrors `packages/venues/src/http-client.ts`'s retry/backoff mechanics, but diverges on
 * purpose: venues throws on failure (callers zod-validate and treat errors as hard
 * failures), while a memory-store outage here must never break the request/render path.
 * The retry helper is reimplemented locally rather than imported — venues is venue-scoped.
 */
import { COMPANION_SEARCH_LIMIT, XTRACE_MAX_RETRIES, XTRACE_TIMEOUT_MS } from '@receipts/core';

import { xtraceGroupSchema, xtraceIngestAcceptedSchema, xtraceSearchResponseSchema } from './schemas.js';

export const XTRACE_DEFAULT_API_BASE = 'https://api.production.xtrace.ai';

export const pairingGroupId = (pairingId: string) => `pairing:${pairingId}`;
export const pairingConvId = (pairingId: string, profileId: string) =>
  `pairing:${pairingId}:${profileId}`;
// Reserved for a future season-episode ingest; no XH task calls this — do not invent a
// season-scoped ingest to justify it.
export const seasonConvId = (seasonId: string, profileId: string) =>
  `season:${seasonId}:${profileId}`;

export interface XtraceClientOptions {
  apiBase: string;
  apiKey: string;
  appId: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  logger?: (msg: string, err?: unknown) => void;
}

export interface IngestTurn {
  role: 'user' | 'assistant';
  content: string;
  date?: string;
}

export interface IngestArgs {
  userId: string;
  convId: string;
  messages: IngestTurn[];
  groupIds?: string[];
  agentId?: string;
}

export interface SearchArgs {
  query: string;
  userId?: string;
  groupIds?: string[];
  include?: Array<'fact' | 'artifact' | 'episode'>;
  limit?: number;
  /**
   * `'retrieve'` (default) returns ranked rows. `'compose'` additionally runs a server-side
   * context-selection pass and returns an assembled `context` block — see `searchContext`.
   */
  mode?: 'retrieve' | 'compose';
  /**
   * Reserve slots for episodes in the returned top-k. xTrace returns EVERY fact before ANY
   * episode, so a flat `limit` slice is fact-only for any subject with `limit`-many facts —
   * which silently discards the cross-record synthesis that episodes carry. See
   * docs/xtrace-episode-retrieval-findings.md.
   */
  episodeSlots?: number;
}

export interface XtraceMemory {
  id: string;
  type: string;
  text: string;
  score: number | null;
}

export interface CreateGroupArgs {
  name: string;
}

export interface XtraceClient {
  ingest(args: IngestArgs): Promise<boolean>;
  search(args: SearchArgs): Promise<XtraceMemory[]>;
  /**
   * `mode: 'compose'` search returning the assembled `context` block alongside the rows.
   * Degrades to `{ memories: [], context: null }` on any failure, like `search`.
   *
   * OPTIONAL on the interface on purpose: no production surface consumes compose yet (the
   * measured win is real — see docs/xtrace-episode-retrieval-findings.md — but it adds a
   * server-side LLM pass and has not been validated end-to-end in-app). Making it required
   * would force every test fake to stub a method nothing calls. Callers must feature-check.
   */
  searchContext?(args: SearchArgs): Promise<{ memories: XtraceMemory[]; context: string | null }>;
  createGroup(args: CreateGroupArgs): Promise<string | null>;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Full jitter: uniform(0, base * 2^attempt) — avoids thundering-herd retries. */
function jitteredBackoff(attempt: number, baseDelayMs: number): number {
  const cap = baseDelayMs * 2 ** attempt;
  return Math.random() * cap;
}

/** The real client always implements `searchContext`; only fakes may omit it. */
export interface FullXtraceClient extends XtraceClient {
  searchContext(args: SearchArgs): Promise<{ memories: XtraceMemory[]; context: string | null }>;
}

export function createXtraceClient(opts: XtraceClientOptions): FullXtraceClient {
  const apiBase = opts.apiBase;
  const timeoutMs = opts.timeoutMs ?? XTRACE_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? XTRACE_MAX_RETRIES;
  const baseDelayMs = 250;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const logger = opts.logger ?? console.warn;

  /**
   * POSTs `body` to `path`, retrying on 429/5xx/network errors/timeouts up to `maxRetries`.
   * Returns the parsed JSON body on 2xx, or `undefined` if every attempt failed — the caller
   * decides the fail-open value (`false` / `[]`), never a thrown error.
   */
  async function postWithRetry(path: string, body: unknown): Promise<unknown> {
    const url = `${apiBase}${path}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': opts.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        logger(`xtrace POST ${path}: network error`, err);
        if (attempt < maxRetries) {
          await sleep(jitteredBackoff(attempt, baseDelayMs));
          continue;
        }
        return undefined;
      }
      clearTimeout(timer);

      if (!res.ok) {
        logger(`xtrace POST ${path}: status ${res.status}`);
        if (isRetryableStatus(res.status) && attempt < maxRetries) {
          await sleep(jitteredBackoff(attempt, baseDelayMs));
          continue;
        }
        return undefined;
      }

      try {
        return await res.json();
      } catch (err) {
        logger(`xtrace POST ${path}: invalid JSON response`, err);
        return undefined;
      }
    }

    return undefined;
  }

  async function ingest(args: IngestArgs): Promise<boolean> {
    const body = await postWithRetry('/v1/memories', {
      messages: args.messages,
      user_id: args.userId,
      conv_id: args.convId,
      app_id: opts.appId,
      group_ids: args.groupIds ?? [],
      agent_id: args.agentId ?? null,
    });
    if (body === undefined) return false;

    const parsed = xtraceIngestAcceptedSchema.safeParse(body);
    if (!parsed.success) {
      logger('xtrace POST /v1/memories: response failed schema validation', parsed.error);
      return false;
    }
    return true;
  }

  /**
   * Truncate to `limit` while reserving `episodeSlots` for episodes, so abundant facts cannot
   * crowd them out. Unused reserved slots are backfilled from whatever remains, in the server's
   * own order, so a caller is never short-changed when one type is scarce. With `episodeSlots`
   * unset this is exactly the previous flat slice.
   */
  function selectTopK(rows: XtraceMemory[], limit: number, episodeSlots?: number): XtraceMemory[] {
    if (!episodeSlots) return rows.slice(0, limit);
    const episodes = rows.filter((m) => m.type === 'episode');
    const rest = rows.filter((m) => m.type !== 'episode');
    const takenEpisodes = episodes.slice(0, Math.min(episodeSlots, limit));
    const picked = [...rest.slice(0, limit - takenEpisodes.length), ...takenEpisodes];
    if (picked.length < limit) {
      const used = new Set(picked.map((m) => m.id));
      picked.push(...rows.filter((m) => !used.has(m.id)).slice(0, limit - picked.length));
    }
    return picked;
  }

  async function runSearch(
    args: SearchArgs,
  ): Promise<{ memories: XtraceMemory[]; context: string | null }> {
    const body = await postWithRetry('/v1/memories/search', {
      query: args.query,
      mode: args.mode ?? 'retrieve',
      user_id: args.userId ?? null,
      group_ids: args.groupIds ?? [],
      app_id: opts.appId,
      include: args.include,
    });
    if (body === undefined) return { memories: [], context: null };

    const parsed = xtraceSearchResponseSchema.safeParse(body);
    if (!parsed.success) {
      logger('xtrace POST /v1/memories/search: response failed schema validation', parsed.error);
      return { memories: [], context: null };
    }

    const limit = args.limit ?? COMPANION_SEARCH_LIMIT;
    const rows: XtraceMemory[] = parsed.data.data.map((m) => ({
      id: m.id,
      type: m.type,
      text: m.text,
      score: m.score ?? null,
    }));
    return {
      memories: selectTopK(rows, limit, args.episodeSlots),
      context: parsed.data.context ?? null,
    };
  }

  async function search(args: SearchArgs): Promise<XtraceMemory[]> {
    return (await runSearch(args)).memories;
  }

  async function searchContext(
    args: SearchArgs,
  ): Promise<{ memories: XtraceMemory[]; context: string | null }> {
    return runSearch({ ...args, mode: 'compose' });
  }

  async function createGroup(args: CreateGroupArgs): Promise<string | null> {
    const body = await postWithRetry('/v1/groups', {
      name: args.name,
      app_id: opts.appId,
    });
    if (body === undefined) return null;

    const parsed = xtraceGroupSchema.safeParse(body);
    if (!parsed.success) {
      logger('xtrace POST /v1/groups: response failed schema validation', parsed.error);
      return null;
    }
    return parsed.data.id;
  }

  return { ingest, search, searchContext, createGroup };
}

export function xtraceClientFromEnv(env: NodeJS.ProcessEnv = process.env): XtraceClient | null {
  const apiKey = env.XTRACE_API_KEY;
  const appId = env.XTRACE_APP_ID;
  if (!apiKey || !appId) return null;

  return createXtraceClient({
    apiBase: env.XTRACE_API_BASE ?? XTRACE_DEFAULT_API_BASE,
    apiKey,
    appId,
  });
}
