import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllBrainContext, getBrainContext } from "../../../agents/brain-context-cache.js";
import type { HookHandler } from "../../hooks.js";
import { createHookEvent } from "../../hooks.js";

let handler: HookHandler;

const fetchMock = vi.fn();

beforeAll(async () => {
  ({ default: handler } = await import("./handler.js"));
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        context_block: "Memory about prior conversation",
        memories_used: 3,
        identity: "SpookyJuice agent",
        entities: [{ name: "Brian", type: "person", summary: "Project lead" }],
      }),
  });
  vi.stubGlobal("fetch", fetchMock);
  clearAllBrainContext();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearAllBrainContext();
});

describe("brain-context hook", () => {
  it("ignores non-message events", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const event = createHookEvent("command", "new", "agent:main:main", {});
    await handler(event);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores message:sent events", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const event = createHookEvent("message", "sent", "agent:main:main", {
      to: "+15551234567",
      content: "Hello",
      success: true,
      channelId: "telegram",
    });
    await handler(event);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when INTELLIGENCE_URL is not set", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "");
    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+15551234567",
      content: "Hello",
      channelId: "telegram",
    });
    await handler(event);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retrieves context and stores in cache on message:received", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+15551234567",
      content: "Tell me about the project",
      channelId: "telegram",
      conversationId: "chat-123",
    });
    await handler(event);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3100/context/inject");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      messages: [{ role: "user", content: "Tell me about the project" }],
      limit: 5,
      include_identity: true,
      include_entities: true,
    });

    const cached = getBrainContext("agent:main:main");
    expect(cached).toBeDefined();
    expect(cached!.contextBlock).toBe("Memory about prior conversation");
    expect(cached!.memoriesUsed).toBe(3);
    expect(cached!.identity).toBe("SpookyJuice agent");
    expect(cached!.entities).toHaveLength(1);
    expect(cached!.entities![0].name).toBe("Brian");
  });

  it("does not cache when no relevant memories", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          context_block: "",
          memories_used: 0,
        }),
    });

    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+15551234567",
      content: "Hello",
      channelId: "telegram",
    });
    await handler(event);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getBrainContext("agent:main:main")).toBeUndefined();
  });

  it("retries once on timeout then gives up gracefully", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);

    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+15551234567",
      content: "Hello",
      channelId: "telegram",
    });

    // Should not throw
    await expect(handler(event)).resolves.toBeUndefined();
    // Two attempts: original + one retry
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getBrainContext("agent:main:main")).toBeUndefined();
  });

  it("succeeds on retry after first timeout", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    fetchMock.mockRejectedValueOnce(abortError).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          context_block: "Retrieved on retry",
          memories_used: 1,
        }),
    });

    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+15551234567",
      content: "Hello",
      channelId: "telegram",
    });

    await handler(event);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const cached = getBrainContext("agent:main:main");
    expect(cached).toBeDefined();
    expect(cached!.contextBlock).toBe("Retrieved on retry");
    expect(cached!.memoriesUsed).toBe(1);
  });

  it("handles fetch errors gracefully without throwing", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));

    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+15551234567",
      content: "Hello",
      channelId: "telegram",
    });

    await expect(handler(event)).resolves.toBeUndefined();
    expect(getBrainContext("agent:main:main")).toBeUndefined();
  });

  it("handles non-OK response without throwing", async () => {
    vi.stubEnv("INTELLIGENCE_URL", "http://localhost:3100");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: () => Promise.resolve({}),
    });

    const event = createHookEvent("message", "received", "agent:main:main", {
      from: "+15551234567",
      content: "Hello",
      channelId: "telegram",
    });

    await expect(handler(event)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    // Non-OK response returns empty result, so nothing cached
    expect(getBrainContext("agent:main:main")).toBeUndefined();
  });
});
