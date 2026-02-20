#!/usr/bin/env python3
"""
Aggregate OpenClaw session usage by project.

Reads session data from ~/.openclaw/agents/*/sessions/ and maps each
session to a project using cwd (longest-prefix match) and session key
pattern matching.

Usage:
    python3 project_usage.py                          # All projects, all time, text
    python3 project_usage.py --days 7                 # Last 7 days
    python3 project_usage.py --project openclaw       # Single project
    python3 project_usage.py --format json --pretty   # JSON output
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

# Model pricing (input/output per 1M tokens, USD)
# Updated for current models; extend as needed.
MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-5.3-codex": {"input": 2.00, "output": 8.00},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "claude-opus-4-6": {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    "o3": {"input": 2.00, "output": 8.00},
    "o4-mini": {"input": 1.10, "output": 4.40},
}

# Default pricing for unknown models
DEFAULT_PRICING = {"input": 3.00, "output": 12.00}

# Idle threshold for active time calculation (seconds)
IDLE_THRESHOLD = 900  # 15 minutes


def load_project_registry(registry_path: Path) -> dict[str, Any]:
    """Load the project registry."""
    if not registry_path.exists():
        return {"projects": {}}
    with open(registry_path) as f:
        return json.load(f)


def load_sessions_index(agents_dir: Path) -> dict[str, dict[str, Any]]:
    """Load all sessions.json indexes across agent dirs."""
    all_sessions: dict[str, dict[str, Any]] = {}
    for agent_dir in agents_dir.iterdir():
        if not agent_dir.is_dir():
            continue
        sessions_json = agent_dir / "sessions" / "sessions.json"
        if sessions_json.exists():
            try:
                with open(sessions_json) as f:
                    data = json.load(f)
                for key, entry in data.items():
                    entry["_agentDir"] = str(agent_dir.name)
                    entry["_sessionKey"] = key
                    all_sessions[key] = entry
            except (json.JSONDecodeError, OSError):
                continue
    return all_sessions


def load_jsonl_header(jsonl_path: Path) -> dict[str, Any] | None:
    """Read the first line (header) of a session JSONL file."""
    try:
        with open(jsonl_path) as f:
            line = f.readline().strip()
            if line:
                return json.loads(line)
    except (json.JSONDecodeError, OSError):
        pass
    return None


def estimate_cost(
    input_tokens: int,
    output_tokens: int,
    model: str,
) -> float:
    """Estimate cost in USD from token counts and model."""
    pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
    return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000


def estimate_active_time_from_jsonl(jsonl_path: Path) -> float:
    """Estimate active time in seconds from message timestamps.

    Measures gaps between consecutive messages; gaps > IDLE_THRESHOLD
    are treated as idle and excluded.
    """
    timestamps: list[float] = []
    try:
        with open(jsonl_path) as f:
            for line in f:
                try:
                    d = json.loads(line)
                    ts = d.get("timestamp")
                    if ts:
                        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        timestamps.append(dt.timestamp())
                except (json.JSONDecodeError, ValueError):
                    continue
    except OSError:
        return 0.0

    if len(timestamps) < 2:
        return 0.0

    timestamps.sort()
    active = 0.0
    for i in range(1, len(timestamps)):
        gap = timestamps[i] - timestamps[i - 1]
        if gap <= IDLE_THRESHOLD:
            active += gap
    return active


def match_session_to_project(
    cwd: str,
    session_key: str,
    projects: dict[str, Any],
) -> str:
    """Map a session to a project name.

    Strategy:
    1. Longest-prefix match on cwd against project paths
    2. Session key pattern matching (e.g., hook:gmail → gmail-smart)
    3. Fall back to '_unmatched'
    """
    # Strategy 1: cwd prefix match
    best_match = ""
    best_len = 0
    for name, proj in projects.items():
        if not proj.get("enabled", True):
            continue
        proj_path = proj.get("path", "")
        if cwd.startswith(proj_path) and len(proj_path) > best_len:
            best_match = name
            best_len = len(proj_path)
    if best_match:
        return best_match

    # Strategy 2: session key patterns
    key_lower = session_key.lower()
    if "hook:gmail" in key_lower:
        return "_hook:gmail"
    if "hook:cockpit" in key_lower:
        return "_hook:cockpit"

    return "_unmatched"


def aggregate_usage(
    agents_dir: Path,
    registry: dict[str, Any],
    days: int | None = None,
    project_filter: str | None = None,
) -> dict[str, Any]:
    """Aggregate session usage by project."""
    projects = registry.get("projects", {})
    cutoff = None
    if days:
        cutoff = datetime.now(UTC) - timedelta(days=days)

    all_sessions = load_sessions_index(agents_dir)

    # Per-project aggregation
    project_data: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "sessions": 0,
        "totalTokens": 0,
        "inputTokens": 0,
        "outputTokens": 0,
        "estimatedCostUSD": 0.0,
        "activeTimeSeconds": 0.0,
        "models": defaultdict(lambda: {"tokens": 0, "costUSD": 0.0, "sessions": 0}),
        "sessionKeys": [],
    })

    for key, entry in all_sessions.items():
        session_id = entry.get("sessionId", "")
        if not session_id:
            continue

        # Date filter
        updated_at = entry.get("updatedAt")
        if cutoff and updated_at:
            try:
                session_time = datetime.fromtimestamp(updated_at / 1000, tz=UTC)
                if session_time < cutoff:
                    continue
            except (ValueError, OSError):
                pass

        # Get cwd from JSONL header
        agent_dir_name = entry.get("_agentDir", "main")
        jsonl_path = agents_dir / agent_dir_name / "sessions" / f"{session_id}.jsonl"
        cwd = ""
        if jsonl_path.exists():
            header = load_jsonl_header(jsonl_path)
            if header:
                cwd = header.get("cwd", "")

        # Map to project
        proj_name = match_session_to_project(cwd, key, projects)

        if project_filter and proj_name != project_filter:
            continue

        # Aggregate tokens and cost
        input_tok = entry.get("inputTokens", 0) or 0
        output_tok = entry.get("outputTokens", 0) or 0
        total_tok = entry.get("totalTokens", 0) or 0
        model = entry.get("model", "unknown")

        cost = estimate_cost(input_tok, output_tok, model)

        pd = project_data[proj_name]
        pd["sessions"] += 1
        pd["totalTokens"] += total_tok
        pd["inputTokens"] += input_tok
        pd["outputTokens"] += output_tok
        pd["estimatedCostUSD"] += cost
        pd["models"][model]["tokens"] += total_tok
        pd["models"][model]["costUSD"] += cost
        pd["models"][model]["sessions"] += 1
        pd["sessionKeys"].append(key)

        # Active time (only for non-hook sessions or when explicitly needed)
        if jsonl_path.exists() and not key.startswith("agent:main:hook:"):
            active = estimate_active_time_from_jsonl(jsonl_path)
            pd["activeTimeSeconds"] += active

    # Build output
    result: dict[str, Any] = {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "days": days,
        "projectFilter": project_filter,
        "totalProjects": len(project_data),
        "projects": {},
    }

    for name, pd in sorted(project_data.items(), key=lambda x: x[1]["estimatedCostUSD"], reverse=True):
        hours = pd["activeTimeSeconds"] / 3600
        result["projects"][name] = {
            "sessions": pd["sessions"],
            "totalTokens": pd["totalTokens"],
            "inputTokens": pd["inputTokens"],
            "outputTokens": pd["outputTokens"],
            "estimatedCostUSD": round(pd["estimatedCostUSD"], 4),
            "activeTimeHours": round(hours, 2),
            "models": {
                m: {
                    "tokens": v["tokens"],
                    "costUSD": round(v["costUSD"], 4),
                    "sessions": v["sessions"],
                }
                for m, v in sorted(pd["models"].items(), key=lambda x: x[1]["costUSD"], reverse=True)
            },
        }

    # Add totals
    total_cost = sum(p["estimatedCostUSD"] for p in result["projects"].values())
    total_tokens = sum(p["totalTokens"] for p in result["projects"].values())
    total_sessions = sum(p["sessions"] for p in result["projects"].values())
    result["totals"] = {
        "sessions": total_sessions,
        "totalTokens": total_tokens,
        "estimatedCostUSD": round(total_cost, 4),
    }

    return result


def format_duration(hours: float) -> str:
    """Format hours into human-readable string."""
    if hours < 1:
        return f"{hours * 60:.0f}m"
    return f"{hours:.1f}h"


def format_cost(cost: float) -> str:
    """Format cost as USD."""
    if cost < 0.01:
        return f"${cost:.4f}"
    return f"${cost:.2f}"


def render_text(data: dict[str, Any]) -> str:
    """Render usage data as human-readable text."""
    lines: list[str] = []
    days = data.get("days")
    period = f"last {days} days" if days else "all time"
    lines.append(f"Project Usage Summary ({period})")
    lines.append(f"{'=' * 60}")

    totals = data.get("totals", {})
    lines.append(f"Total: {totals.get('sessions', 0)} sessions, "
                 f"{totals.get('totalTokens', 0):,} tokens, "
                 f"{format_cost(totals.get('estimatedCostUSD', 0))}")
    lines.append("")

    for name, proj in data.get("projects", {}).items():
        cost = format_cost(proj["estimatedCostUSD"])
        hours = format_duration(proj["activeTimeHours"])
        lines.append(f"  {name:<30} {proj['sessions']:>3} sessions  {cost:>10}  {hours:>6} active")
        for model, mdata in proj.get("models", {}).items():
            lines.append(f"    {model:<28} {mdata['sessions']:>3} sessions  {format_cost(mdata['costUSD']):>10}")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Aggregate OpenClaw session usage by project.")
    parser.add_argument("--days", type=int, help="Limit to last N days")
    parser.add_argument("--project", help="Filter to single project name")
    parser.add_argument("--registry", help="Path to projects.json (default: ~/.openclaw/cockpit/projects.json)")
    parser.add_argument("--agents-dir", help="Path to agents dir (default: ~/.openclaw/agents)")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    parser.add_argument("--pretty", action="store_true")

    args = parser.parse_args()

    registry_path = Path(args.registry).expanduser() if args.registry else Path.home() / ".openclaw" / "cockpit" / "projects.json"
    agents_dir = Path(args.agents_dir).expanduser() if args.agents_dir else Path.home() / ".openclaw" / "agents"

    registry = load_project_registry(registry_path)
    data = aggregate_usage(agents_dir, registry, args.days, args.project)

    if args.format == "json":
        indent = 2 if args.pretty else None
        print(json.dumps(data, indent=indent))
    else:
        print(render_text(data))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
