import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HookHandler } from "../../hooks.js";
import { createHookEvent } from "../../hooks.js";

let handler: HookHandler;

// Track fetch calls
const fetchMock = vi.fn();

beforeAll(async () => {
  ({ default: handler } = await import("./handler.js"));
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("brain-ingest hook", () => {
  it("ignores non-message events", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const event = createHookEvent("command", "new", "agent:main:main", {});
    await handler(event);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when INTELLIGENCE_URL is not set", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "");
    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+1234567890",
      content: "Hello",
      channelId: "telegram",
    });
    await handler(event);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts user message to /ingest on message:received", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+1234567890",
      content: "Hello world",
      channelId: "telegram",
      conversationId: "chat-123",
      messageId: "msg-456",
    });
    await handler(event);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3100/ingest");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      content: "Hello world",
      session_id: "agent:main:main",
      channel: "telegram",
      user: "+1234567890",
      role: "user",
    });
    expect(body.metadata.conversation_id).toBe("chat-123");
    expect(body.metadata.message_id).toBe("msg-456");
  });

  it("posts assistant message to /ingest on message:sent", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const event = createHookEvent("message", "sent", "agent:main:main", {
      to: "+1234567890",
      content: "I can help with that",
      success: true,
      channelId: "telegram",
      conversationId: "chat-123",
    });
    await handler(event);

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      content: "I can help with that",
      session_id: "agent:main:main",
      channel: "telegram",
      user: "+1234567890",
      role: "assistant",
    });
  });

  it("skips failed message sends", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const event = createHookEvent("message", "sent", "agent:main:main", {
      to: "+1234567890",
      content: "I can help with that",
      success: false,
      error: "downstream failed",
      channelId: "telegram",
    });
    await handler(event);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles fetch errors gracefully without throwing", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));

    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+1234567890",
      content: "Hello",
      channelId: "telegram",
    });

    // Should not throw
    await expect(handler(event)).resolves.toBeUndefined();
  });

  it("logs warning on non-OK response without throwing", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" });

    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+1234567890",
      content: "Hello",
      channelId: "telegram",
    });

    await expect(handler(event)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
