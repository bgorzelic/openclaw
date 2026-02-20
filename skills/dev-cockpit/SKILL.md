---
name: dev-cockpit
description: "Unified dev cockpit for tracking projects, agent costs, time, and activity across ~/dev. Use when: (1) checking project-level usage/cost summaries, (2) scanning for new projects, (3) reviewing agent activity by project, (4) generating daily dev summaries for Obsidian, (5) tracking git activity and coding time, (6) budget alerts and cost thresholds. Requires: jq, python3."
metadata:
  {
    "openclaw":
      {
        "emoji": "🎛️",
        "os": ["darwin", "linux"],
        "requires": { "bins": ["jq", "python3", "git"] },
      },
  }
---

# Dev Cockpit

Unified project tracking, cost aggregation, and time analysis across your entire `~/dev` ecosystem.

## Quick Start

### Scan for projects

Auto-discover git repos in `~/dev/`:

```bash
python3 {baseDir}/scripts/project_scan.py --root ~/dev --output ~/.openclaw/cockpit/projects.json
```

### View project usage

Aggregate session costs by project:

```bash
# All projects, last 7 days
python3 {baseDir}/scripts/project_usage.py --days 7

# Single project, all time
python3 {baseDir}/scripts/project_usage.py --project openclaw

# JSON output for dashboards
python3 {baseDir}/scripts/project_usage.py --days 30 --format json --pretty
```

### Git activity

```bash
# All enabled projects, last 7 days
python3 {baseDir}/scripts/git_activity.py --days 7

# Single project
python3 {baseDir}/scripts/git_activity.py --project openclaw --days 30
```

## Project Registry

Projects are stored in `~/.openclaw/cockpit/projects.json`. The scanner auto-discovers git repos and detects language/framework.

### Registry Format

See `references/project-registry.md` for the full schema.

### Managing Projects

```bash
# Rescan (discovers new repos, preserves enabled/disabled state)
python3 {baseDir}/scripts/project_scan.py --root ~/dev --output ~/.openclaw/cockpit/projects.json

# Disable a project (edit projects.json or use the web UI toggle)
# Enable a project (same)
```

## Usage Aggregation

The usage script reads session JSONL files from `~/.openclaw/agents/*/sessions/*.jsonl` and maps each session to a project using the `cwd` field in the session header (longest-prefix match against project paths).

### What It Tracks

- **Cost**: Total spend per project (7d, 30d, all-time) with per-model breakdown
- **Sessions**: Count and duration per project
- **Active time**: Estimated from message timestamps (15-min idle threshold)
- **Subagents**: Count of subagent runs per project
- **Models**: Which models were used and their relative cost

### Output Modes

- **text** (default): Human-readable summary table
- **json**: Machine-readable for dashboards and web UI

## Git Activity Tracking

Parses `git log` for each enabled project to provide:

- Commit count and frequency
- Active days
- Estimated coding hours (clusters commits into work sessions with 30-min gap threshold)
- Recent commit subjects

## Obsidian Integration

### Daily Summaries

Generate a daily dev summary note for your Obsidian vault:

```bash
python3 {baseDir}/scripts/obsidian_daily.py --vault ~/dev/obsidian-vault --date today
```

This creates `Daily/YYYY-MM-DD.md` with agent activity, project highlights, cost breakdown, and git activity.

### Reading Context

When working on a project, check Obsidian for context:

- `obsidian-cli search "project-name"` for related notes
- Check `Daily/` for recent activity summaries
- Check `Projects/` for project-specific documentation

## Budget Alerts

Set cost thresholds in `~/.openclaw/cockpit/config.json`:

```json
{
  "alerts": {
    "dailySpendLimit": 10.0,
    "weeklyProjectLimit": 25.0,
    "alertChannel": "telegram"
  }
}
```

The usage script checks thresholds and outputs warnings when exceeded.

## References

- `references/project-registry.md` — Registry schema and configuration
