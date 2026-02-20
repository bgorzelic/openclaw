# Project Registry

The project registry at `~/.openclaw/cockpit/projects.json` maps local git repositories to tracked projects.

## Schema

```json
{
  "version": 1,
  "scannedAt": "2026-02-20T17:00:00Z",
  "scanRoots": ["/Users/bgorzelic/dev"],
  "projects": {
    "openclaw": {
      "path": "/Users/bgorzelic/dev/projects/openclaw",
      "enabled": true,
      "tags": ["typescript", "agent-framework"],
      "language": "typescript",
      "discovered": "2026-02-20",
      "description": "OpenClaw agent framework"
    },
    "exemplary-terra-gcp": {
      "path": "/Users/bgorzelic/dev/projects/exemplary-terra-gcp",
      "enabled": true,
      "tags": ["terraform", "gcp"],
      "language": "python",
      "discovered": "2026-02-20",
      "description": ""
    }
  }
}
```

## Fields

| Field         | Type     | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `path`        | string   | Absolute path to the git repo root                     |
| `enabled`     | bool     | Whether to include in usage aggregation and dashboards |
| `tags`        | string[] | User-defined or auto-detected tags                     |
| `language`    | string   | Primary language (auto-detected from files)            |
| `discovered`  | string   | ISO date when first discovered by scanner              |
| `description` | string   | Optional human description (user-editable)             |

## Auto-Detection

The scanner detects language/framework by checking for:

| File                                             | Detected As                  |
| ------------------------------------------------ | ---------------------------- |
| `package.json`                                   | `typescript` or `javascript` |
| `tsconfig.json`                                  | `typescript`                 |
| `pyproject.toml`, `setup.py`, `requirements.txt` | `python`                     |
| `go.mod`                                         | `go`                         |
| `Cargo.toml`                                     | `rust`                       |
| `*.tf`                                           | `terraform`                  |
| `Gemfile`                                        | `ruby`                       |
| `Makefile` (only)                                | `c` or `cpp`                 |

## Session Matching

Sessions are matched to projects using **longest-prefix match** on the `cwd` field from the session JSONL header record:

1. Read the first line of each `*.jsonl` file (the session header)
2. Extract the `cwd` field
3. Compare against all enabled project paths
4. Assign to the project whose `path` is the longest prefix of `cwd`
5. Sessions with no matching project are grouped under `_unmatched`

Example:

- Session cwd: `/Users/bgorzelic/dev/projects/openclaw/ui`
- Project path: `/Users/bgorzelic/dev/projects/openclaw`
- Match: `openclaw` (longest prefix)
