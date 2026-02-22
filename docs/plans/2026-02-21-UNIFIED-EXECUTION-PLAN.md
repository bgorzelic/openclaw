# OpenClaw Intelligence Upgrade: Unified Execution Plan

**Status:** APPROVED FOR EXECUTION
**Date:** 2026-02-21
**Authors:** Claude (plan + review), Gemini (draft), Codex (schema validation), Kimi (dashboard)
**Objective:** Make @spookyjuiceBOT significantly smarter while keeping costs strictly controlled.

---

## Current State (Verified)

| Component     | Status      | Details                                          |
| ------------- | ----------- | ------------------------------------------------ |
| Gateway       | Running     | Port 18789, LaunchAgent, loopback bind           |
| Telegram      | Running     | Polling, @spookyjuiceBOT, streamMode: partial    |
| Gmail Hook    | Running     | Tailscale funnel, gpt-4o-mini, 60s timeout       |
| Voice Call    | Enabled     | Plugin active                                    |
| Browser       | Enabled     | Chrome extension driver, port 18792              |
| Memory        | qmd         | Obsidian vault at `~/Obsidian/Personal/Personal` |
| Skills        | 31/53 ready | No community skills installed                    |
| MCP Servers   | 0           | Docker MCP available but unconfigured for repos  |
| Cost Controls | NONE        | No timeouts, no budget caps, subagents unbounded |

### Current Model Config

```jsonc
// agents.defaults.model (CORRECT schema)
{
  "primary": "openai-codex/gpt-5.3-codex",
  "fallbacks": ["openai/gpt-4o", "openrouter/anthropic/claude-sonnet-4-6", "moonshot/kimi-k2.5"],
}
```

### Current Limits

- `maxConcurrent`: 2 (agents)
- `subagents.maxConcurrent`: 8 (no depth limit set, defaults to 1 = no nesting)
- No `timeoutSeconds` set on agent defaults
- Gmail hook: 60s timeout (good)

---

## Schema Reference (Verified Against Source)

These are the ACTUAL config fields from `src/config/zod-schema.agent-defaults.ts`. Every config change in this plan uses only valid fields.

```typescript
agents.defaults.model.primary          // string - primary model ID
agents.defaults.model.fallbacks        // string[] - ordered fallback list
agents.defaults.timeoutSeconds         // number (int, positive) - hard cap per session
agents.defaults.maxConcurrent          // number (int, positive) - max concurrent agent sessions
agents.defaults.subagents.maxConcurrent    // number (int, positive) - max concurrent subagents
agents.defaults.subagents.maxSpawnDepth    // number (int, 1-5) - 1=no nesting, 2=one level
agents.defaults.subagents.maxChildrenPerAgent // number (int, 1-20, default 5)
agents.defaults.contextPruning.mode    // "off" | "cache-ttl"
agents.defaults.contextPruning.ttl     // string e.g. "1h", "30m"
agents.defaults.thinkingDefault        // "off"|"minimal"|"low"|"medium"|"high"|"xhigh"
agents.defaults.compaction.mode        // "default" | "safeguard"

// Hook mapping fields (per entry in hooks.mappings[])
hooks.mappings[].model                 // string - model override for this hook
hooks.mappings[].thinking              // string - "off" to disable thinking
hooks.mappings[].timeoutSeconds        // number - timeout for this hook session
```

**Fields that DO NOT exist (corrections from Gemini's plan):**

- ~~`agents.defaults.models.cheap`~~ — no `cheap` routing field
- ~~`hooks.gmail.model`~~ — model goes on `hooks.mappings[]`, not on `hooks.gmail`
- ~~`hooks.gmail.timeoutSeconds`~~ — same, goes on the mapping entry
- ~~`hooks.gmail.thinking`~~ — same

---

## Phase 0: Cost Guardrails

**Priority:** IMMEDIATE — do this before anything else.
**Type:** Config changes only (directly executable).
**Risk:** Zero — all changes are conservative limits on existing behavior.

### 0.1 — Agent Session Limits

Add `timeoutSeconds` and tighten subagent limits.

**Change to `~/.openclaw/openclaw.json`:**

```jsonc
{
  "agents": {
    "defaults": {
      // ... existing model, workspace, etc. unchanged ...
      "timeoutSeconds": 300, // 5-min hard cap per session (was: unlimited)
      "maxConcurrent": 2, // keep at 2 (Gemini's suggestion of 1 is too aggressive)
      "subagents": {
        "maxConcurrent": 4, // reduce from 8 to 4
        "maxSpawnDepth": 2, // allow one level of subagents (1=none, 2=one level)
        "maxChildrenPerAgent": 5, // explicit cap (already default, but good to be explicit)
      },
    },
  },
}
```

**Rationale:**

- `timeoutSeconds: 300` — 5 minutes is generous for interactive tasks, prevents runaway sessions
- `maxConcurrent: 2` — keeping at 2 (not 1). Setting to 1 blocks the bot from handling a Telegram message while processing a hook.
- `maxSpawnDepth: 2` — allows subagents (needed for research, YouTube pipeline). Setting to 1 (Gemini's suggestion) means NO subagents at all.
- `maxChildrenPerAgent: 5` — already the default, but makes intent clear

### 0.2 — Model Routing (Already Correct)

The current model config is valid and well-structured:

- Primary: `openai-codex/gpt-5.3-codex` (interactive conversations)
- Fallback 1: `openai/gpt-4o` (proven, reliable)
- Fallback 2: `openrouter/anthropic/claude-sonnet-4-6` (valid OpenRouter path)
- Fallback 3: `moonshot/kimi-k2.5` (200K context, bulk processing)

**No changes needed.** The `openrouter/anthropic/claude-sonnet-4-6` fallback IS valid (Gemini incorrectly flagged it as invalid).

### 0.3 — Hook-Level Cost Controls

Gmail hook is already well-configured. Apply same pattern to all future hooks.

**Current gmail hook mapping (ALREADY CORRECT):**

```jsonc
{
  "match": { "path": "gmail" },
  "model": "openai/gpt-4o-mini", // cheap model for triage
  "thinking": "off", // no thinking tokens
  "timeoutSeconds": 60, // 60s hard cap
}
```

**Template for all future hook mappings:**

```jsonc
{
  "model": "openai/gpt-4o-mini",
  "thinking": "off",
  "timeoutSeconds": 60,
}
```

### 0.4 — Context Pruning (Keep Current)

Current setting: `cache-ttl: 1h` with `compaction: safeguard`. This is reasonable.

**Optional tightening for later:** Consider `ttl: "30m"` if costs are too high, but 1h is fine for now.

### 0.5 — Monitoring

- [ ] Enable `model-usage` skill to track per-model costs
- [ ] Run `openclaw cost --today` daily to review spending
- [ ] Monitor `~/.openclaw/agents/*/sessions/` for runaway session sizes

**No config change needed** — these are manual checks until Phase 4 automates them.

---

## Phase 1: YouTube Vision Skill

**Priority:** HIGH (user specifically requested this)
**Type:** Skill installation + CLI dependency
**Cost impact:** Low-medium. Transcript extraction is local. Only summarization hits the API.

### 1.1 — Install yt-dlp

```bash
brew install yt-dlp
```

### 1.2 — Install YouTube Vision Skill

Install from ClawHub:

```bash
# Check available version
openclaw skills search youtube-vision

# Install
openclaw skills install youtube-vision
```

Or manually from the community repository if not on ClawHub yet:

```bash
# Clone into skills directory
mkdir -p ~/.openclaw/skills/youtube-vision
# Follow instructions from the skill's README
```

### 1.3 — Token Optimization for YouTube

- Transcripts > 20min: auto-truncate to first 10min (built-in feature of YouTube Vision v5.5)
- Use `--from` / `--to` for targeted analysis instead of full videos
- Route transcript summarization to `gpt-4o-mini` (not the primary model)
- The bundled `summarize` skill (already ready) also handles YouTube URLs as an alternative

---

## Phase 2: Bundled Skills (Zero-Cost to Enable)

**Priority:** MEDIUM
**Type:** CLI installations (brew/npm)
**Cost impact:** Near-zero — these are local tools

### Priority A — Install These

| Skill            | Install Command               | Why                                  |
| ---------------- | ----------------------------- | ------------------------------------ |
| `1password`      | `brew install 1password-cli`  | Stop hardcoding API keys in config   |
| `blogwatcher`    | `npm install -g blogwatcher`  | Monitor tech news, RSS is local      |
| `mcporter`       | `npm install -g mcporter`     | Connect to any MCP server on the fly |
| `spotify-player` | `brew install spotify_player` | Music control from Telegram          |

### Priority B — Nice to Have

| Skill        | Install Command              | Why                     |
| ------------ | ---------------------------- | ----------------------- |
| `things-mac` | `brew install things-cli`    | Task management         |
| `bear-notes` | `npm install -g grizzly`     | Note-taking alternative |
| `openhue`    | `npm install -g openhue-cli` | Smart home control      |

### Skip

| Skill      | Why                        |
| ---------- | -------------------------- |
| `notion`   | Obsidian covers note needs |
| `trello`   | Not using Trello           |
| `camsnap`  | No RTSP cameras configured |
| `sonoscli` | Already disabled, no Sonos |
| `ordercli` | Already disabled           |

---

## Phase 3: MCP Servers (Biggest Intelligence Boost)

**Priority:** HIGH
**Type:** Config changes + optional API key setup
**Cost impact:** Minimal for reads. Only LLM calls cost tokens.

### 3.1 — GitHub MCP (Already Available via Docker MCP)

Docker MCP GitHub tools are already loaded. Configure for active repos:

- `openclaw/openclaw`
- `bgorzelic/exemplary-terra-gcp`

**Cost:** Only when agent decides to use GitHub tools. Read operations are minimal.

### 3.2 — Obsidian MCP

The Obsidian MCP server (`mcp__MCP_DOCKER__obsidian_*` tools) is already available in this session. It provides:

- `obsidian_get_file_contents` — read notes
- `obsidian_simple_search` / `obsidian_complex_search` — search vault
- `obsidian_append_content` — add to notes
- `obsidian_list_files_in_vault` — browse structure
- `obsidian_get_recent_changes` — find recent edits

**Action:** Configure the Obsidian REST API MCP endpoint to point at your vault if not already done via Docker MCP.

**Cost:** Near-zero (local operations).

### 3.3 — Web Search MCP

Options ranked by cost:

1. **SearXNG** (self-hosted) — zero API cost, full control
2. **Tavily** — 1000 free searches/month, good quality
3. **Brave Search API** — free tier available

**Guard:** Set `maxResults: 5` to limit context injection.

### 3.4 — Google Calendar MCP

Schedule awareness. Very low token cost (calendar reads are small payloads).

### MCP Token Rules

For ALL MCP servers:

- Set `cacheTtlMinutes: 15` on search/list operations
- Set `timeoutSeconds: 30` on all MCP tool configs
- Limit `maxResults` on search/list operations
- Prefer read-only access where possible

---

## Phase 4: Custom Skills & Automation

**Priority:** MEDIUM-LOW
**Type:** Custom skill development (needs implementation)
**Cost impact:** Controlled — each has explicit budgets

### 4.1 — Daily Briefing Skill

A cron-triggered skill running once per morning:

- Summarize overnight emails (from Gmail hook logs)
- List today's calendar events (requires Calendar MCP from Phase 3.4)
- Check GitHub notifications
- Report model usage from yesterday
- Deliver to Telegram

**Config:**

```jsonc
{
  "model": "openai/gpt-4o-mini",
  "thinking": "off",
  "timeoutSeconds": 120,
}
```

**Estimated cost:** ~$0.01/day (structured summarization on cheap model).

### 4.2 — Research Skill

When explicitly invoked:

- Use web search MCP (3-5 results)
- Summarize each source with `gpt-4o-mini`
- Synthesize with primary model
- Save to Obsidian

**Guards:**

- Explicit user invocation only (never automated)
- Cap at 5 sources, 30K total context tokens
- Budget: $0.25 max per run

### 4.3 — Obsidian Integration Skill

Deeper vault integration:

- Auto-link related notes
- Generate weekly review from daily notes
- Surface forgotten notes relevant to current conversation

**Model:** `gpt-4o-mini` for indexing/linking, primary for review generation.

---

## Phase 5: Channel Expansion (When Needed)

| Channel  | Status              | Action                                       |
| -------- | ------------------- | -------------------------------------------- |
| Discord  | Schema exists       | Enable only if needed for a server           |
| iMessage | `imsg` skill ready  | BlueBubbles for full bidirectional           |
| WhatsApp | `wacli` skill ready | Needs WhatsApp Business API for full channel |

**No action needed now.** Enable when a specific use case arises.

---

## Memory Backend Decision

**Current:** `qmd` backend pointing at `~/Obsidian/Personal/Personal`
**Gemini recommended:** Switch to `sqlite`
**Verdict:** KEEP `qmd` for now.

**Reasoning:**

- `qmd` IS working — it's connected to your Obsidian vault and provides real-time access to your personal knowledge base
- Switching to `sqlite` would LOSE Obsidian integration (sqlite is a separate local database, not connected to your vault)
- The `ENOENT` errors Gemini referenced were from a different issue (now resolved)
- If `qmd` performance becomes a problem later, we can add `sqlite` as a secondary cache layer

---

## Execution Checklist

### Phase 0 (Do Now) — Config Changes Only

- [ ] Add `timeoutSeconds: 300` to `agents.defaults`
- [ ] Reduce `subagents.maxConcurrent` from 8 to 4
- [ ] Add `subagents.maxSpawnDepth: 2`
- [ ] Add `subagents.maxChildrenPerAgent: 5`
- [ ] Restart gateway to apply

### Phase 1 (This Week) — YouTube Vision

- [ ] `brew install yt-dlp`
- [ ] Install YouTube Vision skill from ClawHub
- [ ] Test with a short video

### Phase 2 (This Week) — Bundled Skills

- [ ] `brew install 1password-cli`
- [ ] `npm install -g blogwatcher`
- [ ] `npm install -g mcporter`
- [ ] `brew install spotify_player`
- [ ] Verify skills show in `openclaw skills list`

### Phase 3 (Next Week) — MCP Servers

- [ ] Configure GitHub MCP for active repos
- [ ] Configure Obsidian MCP endpoint
- [ ] Choose and configure web search MCP
- [ ] (Optional) Google Calendar MCP

### Phase 4 (Weeks 3-4) — Custom Skills

- [ ] Build daily briefing skill
- [ ] Build research skill
- [ ] Build Obsidian integration skill

### Phase 5 (When Needed) — Channels

- [ ] Discord / iMessage / WhatsApp as needed

---

## Token Optimization Cheat Sheet

### Model Tiers

| Tier     | Model                        | Use For                               | Approx Cost     |
| -------- | ---------------------------- | ------------------------------------- | --------------- |
| Cheap    | `openai/gpt-4o-mini`         | Hooks, cron, triage, summaries        | ~$0.15/1M input |
| Mid      | `openai/gpt-4o`              | Code review, complex tasks            | ~$2.50/1M input |
| Premium  | `openai-codex/gpt-5.3-codex` | Interactive conversations, planning   | ~$5-15/1M input |
| Fallback | `moonshot/kimi-k2.5`         | Large context (200K), bulk processing | ~$0.50/1M input |

### Rules

1. **Hooks and cron: always `gpt-4o-mini`** unless the task genuinely needs reasoning
2. **Set `timeoutSeconds` on every automated session** — 60s for triage, 300s max for research
3. **Cap subagent depth at 2** — prevents recursive chains but still allows one level
4. **Compaction: safeguard mode** — already set, keep it
5. **Monitor weekly** — run `model-usage` skill to review per-model spend
6. **Chunk before sending** — don't feed 50K tokens of raw text when a 5K summary would do
7. **Cache MCP results** — `cacheTtlMinutes: 15` on search, calendar, GitHub
8. **Never let the agent loop on failures** — timeouts + maxConcurrent are your circuit breakers

### Danger Patterns

- Agent spawning subagents that spawn more subagents (exponential cost)
- Web search with no result limit (context explosion)
- YouTube transcript of 2hr video piped directly to primary model
- Cron job every 5min hitting API each time
- Hook mapping without `timeoutSeconds` (runaway session)

---

## Corrections Log

Issues found during multi-model review:

| Issue                                              | Source                           | Correction                                                                                      |
| -------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `agents.defaults.models.cheap` doesn't exist       | Gemini plan                      | No `cheap` routing field in schema. Use `model` override on individual hooks.                   |
| `hooks.gmail.model` / `hooks.gmail.timeoutSeconds` | Gemini plan                      | These go on `hooks.mappings[]` entries, not on `hooks.gmail`. Already correct in actual config. |
| "Remove invalid openrouter fallback"               | Gemini plan, Kimi dashboard      | `openrouter/anthropic/claude-sonnet-4-6` IS a valid OpenRouter model path. Keep it.             |
| `maxConcurrent: 1`                                 | Gemini plan                      | Too aggressive. Blocks concurrent Telegram + hook processing. Keep at 2.                        |
| `maxSpawnDepth: 1`                                 | Gemini plan                      | Means NO subagents (1 = no nesting per schema). Use 2 for one level.                            |
| "Switch memory to sqlite"                          | Gemini plan                      | Would lose Obsidian vault integration. Keep `qmd` unless performance issues arise.              |
| `timeoutSeconds: 120` vs `180`                     | Gemini plan (conflicting values) | Using 300 (5 min) — generous for interactive, safe against runaway.                             |
| "Token budget circuit breaker"                     | Gemini plan                      | Conceptual only — no built-in config field for this. Would need custom wrapper code.            |
| Cost tracking percentages in dashboard             | Kimi dashboard                   | Placeholder data, not actual measurements. Will become real once monitoring is enabled.         |

---

_This plan supersedes both `OPENCLAW_INTELLIGENCE_MASTERPLAN.md` (Gemini draft) and the earlier `2026-02-21-openclaw-intelligence-upgrade.md` (Claude draft). All config snippets have been verified against the actual Zod schema in `src/config/zod-schema.agent-defaults.ts`._
