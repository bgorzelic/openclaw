/**
 * Session-scoped cache for brain context retrieved from the intelligence service.
 *
 * Stores context blocks per session key with a short TTL (one request cycle).
 * Single-process, module-level Map — no external dependencies.
 */

export type BrainContextPayload = {
  contextBlock: string;
  memoriesUsed: number;
  retrievalMs: number;
  identity?: string;
  entities?: Array<{ name: string; type: string; summary?: string }>;
};

type CacheEntry = {
  payload: BrainContextPayload;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 30_000;

const cache = new Map<string, CacheEntry>();

export function setBrainContext(sessionKey: string, context: BrainContextPayload): void {
  cache.set(sessionKey, {
    payload: context,
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
}

export function getBrainContext(sessionKey: string): BrainContextPayload | undefined {
  const entry = cache.get(sessionKey);
  if (!entry) {
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(sessionKey);
    return undefined;
  }
  return entry.payload;
}

export function clearBrainContext(sessionKey: string): void {
  cache.delete(sessionKey);
}

/** Clear all entries (for testing). */
export function clearAllBrainContext(): void {
  cache.clear();
}
