#!/usr/bin/env python3
"""
Track git activity across projects.

Parses git log for each enabled project, counts commits, active days,
and estimates coding hours by clustering commits into work sessions.

Usage:
    python3 git_activity.py --days 7
    python3 git_activity.py --project openclaw --days 30
    python3 git_activity.py --format json --pretty
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

# Gap between commits to consider a new work session (seconds)
SESSION_GAP = 1800  # 30 minutes

# Minimum session length when there's only one commit (seconds)
MIN_SESSION_LENGTH = 300  # 5 minutes per commit


def load_project_registry(registry_path: Path) -> dict[str, Any]:
    """Load the project registry."""
    if not registry_path.exists():
        return {"projects": {}}
    with open(registry_path) as f:
        return json.load(f)


def get_git_log(
    repo_path: Path,
    days: int | None = None,
    author: str | None = None,
) -> list[dict[str, str]]:
    """Get git log entries for a repo."""
    cmd = ["git", "log", "--format=%aI|%H|%s", "--all"]
    if days:
        cmd.append(f"--since={days} days ago")
    if author:
        cmd.extend(["--author", author])
    try:
        result = subprocess.run(
            cmd,
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return []
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []

    entries = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("|", 2)
        if len(parts) >= 3:
            entries.append({
                "date": parts[0],
                "hash": parts[1],
                "subject": parts[2],
            })
    return entries


def estimate_coding_hours(commit_dates: list[datetime]) -> float:
    """Estimate coding hours from commit timestamps.

    Clusters commits into sessions: consecutive commits within
    SESSION_GAP seconds are part of the same session. Each session's
    duration is the span between first and last commit + MIN_SESSION_LENGTH.
    """
    if not commit_dates:
        return 0.0

    sorted_dates = sorted(commit_dates)
    total_seconds = 0.0
    session_start = sorted_dates[0]
    session_end = sorted_dates[0]

    for i in range(1, len(sorted_dates)):
        gap = (sorted_dates[i] - session_end).total_seconds()
        if gap <= SESSION_GAP:
            session_end = sorted_dates[i]
        else:
            # Close current session
            span = (session_end - session_start).total_seconds()
            total_seconds += max(span, MIN_SESSION_LENGTH)
            # Start new session
            session_start = sorted_dates[i]
            session_end = sorted_dates[i]

    # Close final session
    span = (session_end - session_start).total_seconds()
    total_seconds += max(span, MIN_SESSION_LENGTH)

    return total_seconds / 3600


def analyze_project(
    name: str,
    repo_path: Path,
    days: int | None = None,
) -> dict[str, Any]:
    """Analyze git activity for a single project."""
    entries = get_git_log(repo_path, days)

    if not entries:
        return {
            "name": name,
            "path": str(repo_path),
            "commits": 0,
            "activeDays": 0,
            "estimatedHours": 0.0,
            "recentCommits": [],
            "dailyBreakdown": {},
        }

    # Parse dates
    commit_dates: list[datetime] = []
    daily_counts: dict[str, int] = defaultdict(int)
    for entry in entries:
        try:
            dt = datetime.fromisoformat(entry["date"])
            commit_dates.append(dt)
            daily_counts[dt.strftime("%Y-%m-%d")] += 1
        except ValueError:
            continue

    hours = estimate_coding_hours(commit_dates)
    active_days = len(daily_counts)

    return {
        "name": name,
        "path": str(repo_path),
        "commits": len(entries),
        "activeDays": active_days,
        "estimatedHours": round(hours, 2),
        "recentCommits": [
            {"date": e["date"][:10], "subject": e["subject"]}
            for e in entries[:5]
        ],
        "dailyBreakdown": dict(sorted(daily_counts.items(), reverse=True)),
    }


def format_duration(hours: float) -> str:
    """Format hours into human-readable string."""
    if hours < 1:
        return f"{hours * 60:.0f}m"
    return f"{hours:.1f}h"


def render_text(data: dict[str, Any]) -> str:
    """Render git activity as text."""
    lines: list[str] = []
    days = data.get("days")
    period = f"last {days} days" if days else "all time"
    lines.append(f"Git Activity ({period})")
    lines.append(f"{'=' * 60}")

    totals = data.get("totals", {})
    lines.append(f"Total: {totals.get('commits', 0)} commits across "
                 f"{totals.get('activeProjects', 0)} projects, "
                 f"~{format_duration(totals.get('estimatedHours', 0))} coding")
    lines.append("")

    for proj in data.get("projects", []):
        if proj["commits"] == 0:
            continue
        hours = format_duration(proj["estimatedHours"])
        lines.append(f"  {proj['name']:<30} {proj['commits']:>4} commits  "
                     f"{proj['activeDays']:>3} days  ~{hours:>6}")
        for c in proj.get("recentCommits", [])[:3]:
            lines.append(f"    {c['date']}  {c['subject'][:60]}")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Track git activity across projects.")
    parser.add_argument("--days", type=int, help="Limit to last N days")
    parser.add_argument("--project", help="Filter to single project name")
    parser.add_argument("--registry", help="Path to projects.json")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    parser.add_argument("--pretty", action="store_true")

    args = parser.parse_args()

    registry_path = Path(args.registry).expanduser() if args.registry else Path.home() / ".openclaw" / "cockpit" / "projects.json"
    registry = load_project_registry(registry_path)
    projects = registry.get("projects", {})

    results: list[dict[str, Any]] = []
    for name, proj in sorted(projects.items()):
        if not proj.get("enabled", True):
            continue
        if args.project and name != args.project:
            continue
        repo_path = Path(proj["path"])
        if not repo_path.exists():
            continue
        results.append(analyze_project(name, repo_path, args.days))

    # Sort by commits descending
    results.sort(key=lambda x: x["commits"], reverse=True)

    total_commits = sum(p["commits"] for p in results)
    total_hours = sum(p["estimatedHours"] for p in results)
    active_projects = sum(1 for p in results if p["commits"] > 0)

    data = {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "days": args.days,
        "projectFilter": args.project,
        "totals": {
            "commits": total_commits,
            "estimatedHours": round(total_hours, 2),
            "activeProjects": active_projects,
        },
        "projects": results,
    }

    if args.format == "json":
        indent = 2 if args.pretty else None
        print(json.dumps(data, indent=indent))
    else:
        print(render_text(data))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
