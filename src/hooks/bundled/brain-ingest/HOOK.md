---
name: brain-ingest
description: "Forward conversation turns to SpookyJuice intelligence service for knowledge ingestion"
metadata:
  {
    "openclaw":
      {
        "emoji": "brain",
        "events": ["message:received", "message:sent"],
        "requires": { "env": ["INTELLIGENCE_URL"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Brain Ingest Hook

Forwards every conversation turn (incoming and outgoing messages) to a SpookyJuice intelligence service `/ingest` endpoint for knowledge graph ingestion.

## What It Does

On every message exchange:

1. **Captures message content** - User messages (`message:received`) and assistant responses (`message:sent`)
2. **POSTs to /ingest** - Sends structured payload to the intelligence service
3. **Fire-and-forget** - Runs asynchronously without blocking message flow

## Payload Format

```json
{
  "content": "message text",
  "session_id": "agent:main:main",
  "channel": "telegram",
  "user": "+1234567890",
  "role": "user",
  "metadata": {
    "conversation_id": "chat-123",
    "message_id": "msg-456",
    "timestamp": "2026-01-16T14:30:00.000Z"
  }
}
```

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
        "brain-ingest": {
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

## Requirements

- **Environment**: `INTELLIGENCE_URL` must be set (or configured via hook env)

## Disabling

```bash
openclaw hooks disable brain-ingest
```

Or via config:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "brain-ingest": { "enabled": false }
      }
    }
  }
}
```
