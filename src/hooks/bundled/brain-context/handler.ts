/**
 * Brain context hook handler
 *
 * Retrieves relevant memories and identity from the SpookyJuice intelligence
 * service before every LLM response and stores them in the session-scoped
 * brain context cache for injection into the system prompt.
 */

import { setBrainContext, type BrainContextPayload } from "../../../agents/brain-context-cache.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { HookHandler } from "../../hooks.js";
import { isMessageReceivedEvent, type MessageReceivedHookContext } from "../../internal-hooks.js";

const log = createSubsystemLogger("hooks/brain-context");

const TIMEOUT_MS = 2000;
const MAX_CONTEXT_CHARS =
  (parseInt(process.env.BRAIN_CONTEXT_MAX_TOKENS ?? "2000", 10) || 2000) * 4;

type InjectResponse = {
  context_block?: string;
  memories_used?: number;
  identity?: string;
  entities?: Array<{ name: string; type: string; summary?: string }>;
};

async function fetchContextInject(
  url: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<InjectResponse> {
  const response = await fetch(`${url}/context/inject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    log.warn("Intelligence service returned non-OK status", {
      status: response.status,
      statusText: response.statusText,
    });
    return {};
  }

  return (await response.json()) as InjectResponse;
}

async function fetchWithRetry(
  url: string,
  payload: Record<string, unknown>,
): Promise<{ result: InjectResponse; retrievalMs: number }> {
  const start = Date.now();

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const result = await fetchContextInject(url, payload, controller.signal);
      return { result, retrievalMs: Date.now() - start };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (attempt === 0) {
          log.warn("BRAIN_CONTEXT_TIMEOUT: retrying", { url, attempt: 1 });
          continue;
        }
        log.warn("BRAIN_CONTEXT_TIMEOUT: giving up after retry", { url });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Unreachable, but TypeScript needs it
  return { result: {}, retrievalMs: Date.now() - start };
}

function truncateContextBlock(block: string, maxChars: number): string {
  if (block.length <= maxChars) {
    return block;
  }
  return block.slice(0, maxChars) + "\n[...truncated]";
}

const brainContext: HookHandler = async (event) => {
  if (event.type !== "message") {
    return;
  }

  if (!isMessageReceivedEvent(event)) {
    return;
  }

  const intelligenceUrl = process.env.INTELLIGENCE_URL?.trim();
  if (!intelligenceUrl) {
    return;
  }

  const ctx: MessageReceivedHookContext = event.context;

  try {
    const { result, retrievalMs } = await fetchWithRetry(intelligenceUrl, {
      messages: [{ role: "user", content: ctx.content }],
      limit: 5,
      include_identity: true,
      include_entities: true,
    });

    const contextBlock = result.context_block?.trim() ?? "";
    const memoriesUsed = result.memories_used ?? 0;

    if (!contextBlock && memoriesUsed === 0) {
      log.debug("BRAIN_CONTEXT_RETRIEVED: no relevant memories", {
        sessionKey: event.sessionKey,
        retrievalMs,
      });
      return;
    }

    const payload: BrainContextPayload = {
      contextBlock: truncateContextBlock(contextBlock, MAX_CONTEXT_CHARS),
      memoriesUsed,
      retrievalMs,
      identity: result.identity,
      entities: result.entities,
    };

    setBrainContext(event.sessionKey, payload);

    log.info("BRAIN_CONTEXT_RETRIEVED", {
      sessionKey: event.sessionKey,
      memoriesUsed,
      estimatedTokens: Math.ceil(payload.contextBlock.length / 4),
      retrievalMs,
    });
  } catch (err) {
    log.warn("BRAIN_CONTEXT_FAILED", {
      error: err instanceof Error ? err.message : String(err),
      sessionKey: event.sessionKey,
    });
  }
};

export default brainContext;
