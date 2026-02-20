# Obsidian Templates

Templates used by the daily summary generator and other cockpit integrations.

## Daily Note

Generated at `Daily/YYYY-MM-DD.md` by `scripts/obsidian_daily.py`.

### Sections

| Section                | Content                                                  |
| ---------------------- | -------------------------------------------------------- |
| **Agent Activity**     | Session count, total cost, model breakdown               |
| **Project Highlights** | Per-project sessions, active time, cost                  |
| **Git Activity**       | Commits per repo, estimated coding time, recent subjects |

### Generation

```bash
# Today's note
python3 scripts/obsidian_daily.py --vault ~/dev/obsidian-vault

# Specific date
python3 scripts/obsidian_daily.py --vault ~/dev/obsidian-vault --date 2026-02-19

# Preview without writing
python3 scripts/obsidian_daily.py --dry-run
```

### Behavior

- If the note already exists and contains `## Agent Activity`, it skips writing to avoid duplicates
- If the note exists but has no agent activity section, it appends the summary
- If the note doesn't exist, it creates a new one

## Vault Directory Structure

Expected layout in the Obsidian vault:

```
~/dev/obsidian-vault/
├── Daily/              # Daily notes from cockpit + manual
│   ├── 2026-02-20.md
│   └── ...
├── Projects/           # Project-specific docs (manual)
│   ├── openclaw.md
│   └── ...
├── Agents/             # Agent docs and logs (optional)
└── Templates/          # Note templates
```

## Linking

Daily notes can link to project pages:

```markdown
### [[openclaw]]

- 5 sessions, 2h active, $1.82
```

This creates bidirectional links in Obsidian's graph view.
