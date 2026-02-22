# OpenClaw Intelligence Master Plan: "Smart & Thrifty"

**Status:** Draft
**Date:** 2026-02-21
**Objective:** Evolve OpenClaw into a high-intelligence, strictly cost-controlled agent.
**Philosophy:** Intelligence is not just raw model power; it is the efficient application of context, tools, and memory. Every token must pay rent.

---

## 1. The Strategy

We are merging the best recommendations from Claude (Skills), Codex (Reliability), and Kimi (Architecture) into a unified execution path.

**Core Pillars:**

1.  **Financial Firewall:** Strict budgets, circuit breakers, and "cheap-first" routing.
2.  **Reliable Memory:** moving from the broken `qmd` setup to `sqlite` + robust context management.
3.  **Hierarchical Intelligence:** Use cheap models for 80% of the work (planning, classification, summarizing), and expensive models only for the 20% (reasoning, coding, synthesis).

---

## 2. Execution Phases

### Phase 1: The Guardrails (Immediate Actions)

_Goal: Stop the bleeding, fix the broken config, and ensure we never wake up to a surprise bill._

1.  **Config Hygiene (Codex):**
    - Remove invalid `openrouter/anthropic/claude-sonnet-4-6` fallback.
    - Fix the Memory Backend: Switch `memory.backend` to `sqlite` immediately to stop `ENOENT` errors.
    - Clean up `~/.openclaw/.env` to only include provider keys we _intend_ to pay for.

2.  **Strict Limits (Codex/Kimi):**
    - **Timeouts:** Set global `agents.defaults.timeoutSeconds: 120`.
    - **Concurrency:** Reduce `maxConcurrent` to 1 and `subagents.maxConcurrent` to 2.
    - **Token Caps:** Implement per-model max token limits in the config (e.g., 2000 for Codex).

3.  **The "Cheap-First" Router (Claude):**
    - Hardcode `gpt-4o-mini` (or similar) for:
      - Gmail hooks.
      - Cron jobs.
      - Summarization tasks.
    - Disable "Thinking" mode for all automated hooks.

### Phase 2: The Brain Upgrade (Memory & Context)

_Goal: Make the bot "remember" and "understand" without needing 100k context windows._

1.  **Reliable Memory:**
    - Ensure `sqlite` memory is functioning for long-term storage.
    - (Optional) If `qmd` is preferred later, properly install it, but `sqlite` is the stable choice now.

2.  **Context Pruning (Kimi):**
    - Implement "Semantic Chunking" for session history (keep the last 10 messages full, summarize the rest).
    - Aggressive caching of tool outputs (especially `web_search` and `github`).

3.  **MCP Integration (Claude):**
    - Enable **GitHub MCP** for repository context.
    - Enable **Obsidian MCP** (or filesystem) for personal knowledge base access.
    - **Crucial:** Set `cacheTtlMinutes: 60` on these MCP servers to save tokens.

### Phase 3: Capabilities & Skills

_Goal: Give the bot things to do._

1.  **YouTube Vision (Claude):**
    - Install `yt-dlp`.
    - Implement the smart transcript pipeline: `Download -> Chunk -> Summarize (Mini) -> Answer (Primary)`.

2.  **Daily Briefing Agent:**
    - A cron-triggered agent running on `gpt-4o-mini` that summarizes:
      - Yesterday's costs (from logs).
      - Pending PRs.
      - Calendar events.

3.  **Research Agent:**
    - A scoped agent for "Deep Research" that is allowed higher budgets ($0.50/run) but requires explicit user invocation.

---

## 3. Technical Implementation Details

### Recommended `openclaw.json` Snippet (Target State)

```json
{
  "agents": {
    "defaults": {
      "timeoutSeconds": 180,
      "maxConcurrent": 1,
      "models": {
        "primary": "openai-codex/gpt-5.3-codex",
        "cheap": "openai/gpt-4o-mini",
        "fallbacks": ["openai/gpt-4o-mini"]
      },
      "subagents": {
        "maxConcurrent": 2,
        "maxSpawnDepth": 1
      }
    }
  },
  "hooks": {
    "gmail": {
      "model": "openai/gpt-4o-mini",
      "thinking": "off",
      "timeoutSeconds": 60
    }
  },
  "memory": {
    "backend": "sqlite"
  }
}
```

### The "Token Budget" Logic

We will implement a wrapper around agent execution:

```typescript
if (currentSessionCost > DAILY_LIMIT) {
  throw new Error("Daily budget exceeded. Please override manually.");
}
```

---

## 4. Next Steps

1.  **Apply Phase 1 changes immediately.** (Config fix + Guardrails).
2.  **Verify Gateway Stability.** Run `openclaw gateway status`.
3.  **Proceed to Phase 2.**
