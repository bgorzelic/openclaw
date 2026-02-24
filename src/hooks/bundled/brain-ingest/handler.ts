/**
 * Brain ingest hook handler
 *
 * Forwards every conversation turn to the SpookyJuice intelligence
 * service /ingest endpoint for knowledge graph ingestion.
 */

import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { HookHandler } from "../../hooks.js";
import {
  isMessageReceivedEvent,
  isMessageSentEvent,
  type MessageReceivedHookContext,
  type MessageSentHookContext,
} from "../../internal-hooks.js";

const log = createSubsystemLogger("hooks/brain-ingest");

async function postToIngest(url: string, payload: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${url}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn("Intelligence service returned non-OK status", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

const brainIngest: HookHandler = async (event) => {
  if (event.type !== "message") {
    return;
  }

  // The hook system's requires.env check ensures this is set (either from
  // process.env or from hooks.internal.entries.brain-ingest.env in config).
  const intelligenceUrl = process.env.INTELLIGENCE_URL?.trim();
  if (!intelligenceUrl) {
    return;
  }

  try {
    if (isMessageReceivedEvent(event)) {
      const ctx: MessageReceivedHookContext = event.context;
      await postToIngest(intelligenceUrl, {
        content: ctx.content,
        session_id: event.sessionKey,
        channel: ctx.channelId,
        user: ctx.from,
        role: "user",
        metadata: {
          conversation_id: ctx.conversationId,
          message_id: ctx.messageId,
          account_id: ctx.accountId,
          timestamp: event.timestamp.toISOString(),
          ...ctx.metadata,
        },
      });

      log.debug("Ingested user message", {
        sessionKey: event.sessionKey,
        channel: ctx.channelId,
      });
    } else if (isMessageSentEvent(event)) {
      const ctx: MessageSentHookContext = event.context;

      // Only ingest successful sends
      if (!ctx.success) {
        return;
      }

      await postToIngest(intelligenceUrl, {
        content: ctx.content,
        session_id: event.sessionKey,
        channel: ctx.channelId,
        user: ctx.to,
        role: "assistant",
        metadata: {
          conversation_id: ctx.conversationId,
          message_id: ctx.messageId,
          account_id: ctx.accountId,
          timestamp: event.timestamp.toISOString(),
        },
      });

      log.debug("Ingested assistant message", {
        sessionKey: event.sessionKey,
        channel: ctx.channelId,
      });
    }
  } catch (err) {
    // Fire-and-forget: log but never block message flow
    if (err instanceof Error && err.name === "AbortError") {
      log.warn("Intelligence service request timed out", {
        url: intelligenceUrl,
      });
    } else {
      log.error("Failed to ingest message", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};

export default brainIngest;
