# OpenClaw Intelligence Upgrade Plan

**Date:** 2026-02-21
**Goal:** Make OpenClaw (@spookyjuiceBOT) significantly smarter while keeping API costs tightly controlled.
**Principle:** Every change must justify its token cost. No runaway loops, no unbounded sessions.

---

## Current State

### What's Running

- Gateway on port 18789 (LaunchAgent, auto-restart)
- Telegram channel (polling, @spookyjuiceBOT)
- Gmail watcher (Tailscale funnel, auto-triage hook)
- Voice call plugin
- Browser control (Chrome extension driver)
- Obsidian memory backend (Personal vault)
- 31/53 bundled skills ready

### Model Config

- **Primary:** `openai-codex/gpt-5.3-codex` (OAuth)
- **Fallbacks:** `openai/gpt-4o` -> `openrouter/anthropic/claude-sonnet-4-6` -> `moonshot/kimi-k2.5`
- **Max concurrent agents:** 2
- **Max concurrent subagents:** 8
- **Compaction:** safeguard mode
- **Context pruning:** cache-ttl, 1h

### Cost Controls (NONE currently configured)

- No token budgets per session
- No daily spend caps
- No model-tier routing (everything hits the primary model)
- No timeout on agent sessions (only hook timeout at 60s for gmail)
- maxConcurrent=2 is the only throttle
- Subagent depth is unbounded

---

## Phase 0: Cost Guardrails (DO FIRST)

Before adding any new capabilities, lock down spending controls.

### 0.1 — Agent Session Limits

Add to `agents.defaults` in `openclaw.json`:

```jsonc
{
  "agents": {
    "defaults": {
      "timeoutSeconds": 300, // 5-min hard cap per session
      "subagents": {
        "maxConcurrent": 4, // reduce from 8
        "maxSpawnDepth": 2, // prevent recursive spawn chains
      },
    },
  },
}
```

### 0.2 — Smart Model Routing

Route cheap tasks to cheap models. Only escalate when needed.

```jsonc
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai-codex/gpt-5.3-codex",
        "fallbacks": [
          "openai/gpt-4o",
          "openrouter/anthropic/claude-sonnet-4-6",
          "moonshot/kimi-k2.5",
        ],
      },
    },
  },
}
```

For hooks and automated triage, always use cheap models:

- Gmail triage hook: already uses `openai/gpt-4o-mini` (good)
- Future cron jobs: use `gpt-4o-mini` or `moonshot/kimi-k2.5`
- YouTube transcript analysis: use `gpt-4o-mini` for summarization
- Only interactive Telegram conversations should hit the primary model

### 0.3 — Context Pruning Tightening

Current: `cache-ttl: 1h` and `compaction: safeguard`.
Consider tightening for automated/hook sessions:

```jsonc
{
  "contextPruning": {
    "mode": "cache-ttl",
    "ttl": "30m", // 30 min for background tasks
  },
}
```

### 0.4 — Hook Timeout Enforcement

All hook mappings should have explicit `timeoutSeconds`. Current gmail hook has 60s (good). Apply to all future hooks.

### 0.5 — Monitoring

- Enable `model-usage` skill (already ready) to track per-model costs
- Set up a daily cron to report usage via Telegram
- Watch `~/.openclaw/agents/*/sessions/` for runaway session sizes

---

## Phase 1: YouTube Vision Skill

**Cost impact:** Low-medium. Transcript extraction is local (yt-dlp). Only summarization hits the API.

### Install Steps

1. Install yt-dlp: `brew install yt-dlp`
2. Get YouTube Vision from the community (see [discussion #21320](https://github.com/openclaw/openclaw/discussions/21320))
3. Install into `~/.openclaw/skills/youtube-vision/`
4. Configure Whisper API key (already configured in skills.entries)

### Token Optimization

- Transcripts > 20min auto-truncate to first 10min (built-in)
- Use `--from` / `--to` for targeted analysis instead of full videos
- Route transcript summarization to `gpt-4o-mini` (not the primary model)
- Consider the bundled `summarize` skill as an alternative (already ready, handles YouTube URLs)

---

## Phase 2: High-Value Bundled Skills (Zero-Cost to Enable)

These skills are already in the codebase; they just need their CLI dependencies installed.

### Priority A — Install These

| Skill            | Install                       | Token Cost                                 | Why                                   |
| ---------------- | ----------------------------- | ------------------------------------------ | ------------------------------------- |
| `1password`      | `brew install 1password-cli`  | Zero (local)                               | Stop hardcoding API keys in config    |
| `blogwatcher`    | `npm install -g blogwatcher`  | Low (RSS is local, only summaries hit API) | Monitor tech news, competitor updates |
| `mcporter`       | `npm install -g mcporter`     | Zero (tool)                                | Connect to any MCP server on the fly  |
| `spotify-player` | `brew install spotify_player` | Zero (local)                               | Music control from Telegram           |

### Priority B — Nice to Have

| Skill        | Install                      | Token Cost   | Why                     |
| ------------ | ---------------------------- | ------------ | ----------------------- |
| `things-mac` | `brew install things-cli`    | Zero (local) | Task management         |
| `bear-notes` | `npm install -g grizzly`     | Zero (local) | Note-taking alternative |
| `openhue`    | `npm install -g openhue-cli` | Zero (local) | Smart home control      |

### Priority C — Skip for Now

| Skill      | Why Skip                   |
| ---------- | -------------------------- |
| `notion`   | Obsidian covers note needs |
| `trello`   | Not using Trello           |
| `camsnap`  | No RTSP cameras configured |
| `sonoscli` | Disabled, no Sonos         |
| `ordercli` | Disabled, niche            |

---

## Phase 3: MCP Servers (Biggest Intelligence Boost)

MCP servers give the agent real-time tool access. Each server runs locally — only the LLM calls cost tokens.

### 3.1 — GitHub MCP (via Docker MCP already available)

You already have the Docker MCP GitHub tools loaded. Configure for your repos:

- `openclaw/openclaw` (this project)
- `bgorzelic/exemplary-terra-gcp`
- Any other active repos

**Token cost:** Only when the agent decides to use GitHub tools. Minimal for read operations.

### 3.2 — Filesystem/Obsidian MCP

The Obsidian MCP server gives structured search/read/write access to your vault.
Already partially configured via `memory.qmd` pointing at `~/Obsidian/Personal/Personal`.

Consider adding the [Obsidian REST API MCP](https://github.com/openclaw/openclaw/discussions) for deeper integration (search, backlinks, graph queries).

**Token cost:** Near-zero (local operations). Only the query to the LLM costs tokens.

### 3.3 — Web Search MCP

Let the bot search the web autonomously when asked questions.
Options:

- **Tavily** (cheapest, 1000 free searches/month)
- **Brave Search API** (free tier available)
- **SearXNG** (self-hosted, zero API cost)

**Token cost:** Search results are injected into context. Keep `maxResults` low (3-5) to limit context bloat.

### 3.4 — Google Calendar MCP

Schedule awareness — know what's coming up, avoid conflicts.

**Token cost:** Very low. Calendar reads are small payloads.

### MCP Token Optimization Rules

- Set `cacheTtlMinutes` on all MCP tool results to avoid redundant calls
- Limit `maxResults` on search/list operations
- Use `timeoutSeconds` on all MCP tool configs
- Prefer read-only MCP servers where possible (lower risk of runaway writes)

---

## Phase 4: Custom Skills (Session Memory + Intelligence)

### 4.1 — Daily Briefing Skill

A cron-triggered skill that runs once per morning:

- Summarizes overnight emails (from Gmail hook logs)
- Lists today's calendar events
- Checks GitHub notifications
- Reports model usage from yesterday
- Delivers to Telegram

**Model:** `gpt-4o-mini` (cheap, this is structured summarization)
**Token budget:** ~2K tokens output, ~8K context. Should cost < $0.01/day.

### 4.2 — Research Skill

When asked to research a topic:

- Uses web search MCP (3-5 results)
- Summarizes each source
- Synthesizes a brief
- Saves to Obsidian

**Model:** Primary for synthesis, `gpt-4o-mini` for per-source summaries.
**Guard:** Cap at 5 sources, 30K total context tokens.

### 4.3 — Obsidian Integration Skill

Deeper vault integration:

- Auto-link related notes
- Generate weekly review from daily notes
- Surface forgotten notes relevant to current conversation

**Model:** `gpt-4o-mini` for indexing/linking, primary for review generation.

---

## Phase 5: Channel Expansion

### 5.1 — Discord (when needed)

- Already has a config schema in the codebase
- Only enable if you have a use case (server moderation, community bot)

### 5.2 — iMessage (via imsg skill, already ready)

- Works now for sending messages
- BlueBubbles integration for full bidirectional iMessage channel

### 5.3 — WhatsApp (via wacli skill, already ready)

- Can send messages already
- Full channel would need WhatsApp Business API

---

## Token Optimization Cheat Sheet

### Model Tiers (use the cheapest that works)

| Tier         | Model                        | Use For                                            | Approx Cost     |
| ------------ | ---------------------------- | -------------------------------------------------- | --------------- |
| **Cheap**    | `openai/gpt-4o-mini`         | Triage, classification, summaries, cron jobs       | ~$0.15/1M input |
| **Mid**      | `openai/gpt-4o`              | Complex tasks, code review, research synthesis     | ~$2.50/1M input |
| **Premium**  | `openai-codex/gpt-5.3-codex` | Interactive conversations, creative work, planning | ~$5-15/1M input |
| **Fallback** | `moonshot/kimi-k2.5`         | Large context tasks (200K window), bulk processing | ~$0.50/1M input |

### Rules to Live By

1. **Hooks and cron: always `gpt-4o-mini`** unless the task genuinely needs reasoning
2. **Set timeoutSeconds on every automated session** — 60s for triage, 300s max for research
3. **Cap subagent depth at 2** — prevents recursive spawn chains that burn tokens
4. **Use compaction aggressively** — safeguard mode is good, but consider `cache-ttl: 30m` for background tasks
5. **Monitor weekly** — run `model-usage` skill every Monday, review token spend per model
6. **Transcript/document summarization: chunk locally first** — don't feed 50K tokens of raw text into the API when a 5K summary would do
7. **MCP tool results: cache aggressively** — set `cacheTtlMinutes: 15` on search, calendar, GitHub
8. **Never let the agent loop on failures** — timeouts + maxConcurrent are your circuit breakers

### Danger Patterns to Avoid

- Agent spawning subagents that spawn more subagents (token exponential)
- Web search tool with no result limit (context explosion)
- YouTube transcript of 2hr video piped directly to primary model
- Cron job running every 5min that hits the API each time
- Hook mapping without timeoutSeconds (runaway session)

---

## Implementation Order

```
Phase 0 (cost guardrails)     ← DO THIS FIRST, ~15 min
  └→ Phase 1 (YouTube Vision) ← your specific request, ~30 min
  └→ Phase 2A (bundled skills) ← brew/npm installs, ~20 min
  └→ Phase 3.1-3.2 (MCP)      ← GitHub + Obsidian, ~45 min
  └→ Phase 3.3 (web search)   ← biggest intelligence gain, ~30 min
  └→ Phase 4.1 (daily brief)  ← automation, ~1 hr
  └→ Phase 3.4 + 4.2-4.3      ← calendar + research + obsidian skills
  └→ Phase 5 (channels)       ← only when needed
```

---

## Files That Will Change

| File                                          | Changes                                                 |
| --------------------------------------------- | ------------------------------------------------------- |
| `~/.openclaw/openclaw.json`                   | Agent defaults, model routing, MCP servers, cron jobs   |
| `~/.openclaw/.env`                            | New API keys (Tavily/Brave for search, Google Calendar) |
| `/Users/bgorzelic/dev/projects/openclaw/.env` | Must stay in sync with above                            |
| `~/.openclaw/skills/youtube-vision/`          | New skill directory                                     |
| `~/.openclaw/skills/daily-briefing/`          | Custom skill                                            |
| `~/.openclaw/skills/research/`                | Custom skill                                            |
