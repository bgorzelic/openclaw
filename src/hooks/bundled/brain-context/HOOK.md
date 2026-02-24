---
name: brain-context
description: "Retrieve relevant memories and identity from intelligence service before LLM response"
metadata:
  {
    "openclaw":
      {
        "emoji": "recall",
        "events": ["message:received"],
        "requires": { "env": ["INTELLIGENCE_URL"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Brain Context Hook

Retrieves relevant memories and identity from a SpookyJuice intelligence service `/context/inject` endpoint before every LLM response. The retrieved context is injected into the system prompt so the agent has access to relevant past interactions.

## What It Does

On every incoming user message (`message:received`):

1. **POSTs to /context/inject** - Sends the last user message to the intelligence service
2. **Caches the result** - Stores the context block in a session-scoped cache (30s TTL)
3. **System prompt injection** - The cached context is picked up by `buildAgentSystemPrompt` and included in the system prompt

## Request Format

```json
{
  "messages": [{ "role": "user", "content": "message text" }],
  "limit": 5,
  "include_identity": true,
  "include_entities": true
}
```

## Response Format

```json
{
  "context_block": "Retrieved memory text...",
  "memories_used": 3,
  "identity": "Agent identity description",
  "entities": [{ "name": "Brian", "type": "person", "summary": "Project lead" }]
}
```

## Resilience

- **2000ms timeout** per attempt (shorter than brain-ingest's 5s — latency-sensitive)
- **One retry** on timeout
- **Fire-and-forget** on failure — logs a warning but never blocks message flow
- **Token budget** — context truncated if it exceeds `BRAIN_CONTEXT_MAX_TOKENS` (default: 2000)

## Configuration

Set the intelligence service URL via environment variable:

```bash
INTELLIGENCE_URL=http://localhost:3100
```

Or via hook config in `openclaw.json`:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "brain-context": {
          "enabled": true,
          "env": {
            "INTELLIGENCE_URL": "http://localhost:3100"
          }
        }
      }
    }
  }
}
```

Optional token budget override:

```bash
BRAIN_CONTEXT_MAX_TOKENS=3000
```

## Requirements

- **Environment**: `INTELLIGENCE_URL` must be set (or configured via hook env)

## Disabling

```bash
openclaw hooks disable brain-context
```

Or via config:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "brain-context": { "enabled": false }
      }
    }
  }
}
```
