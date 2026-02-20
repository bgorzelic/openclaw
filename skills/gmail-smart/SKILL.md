---
name: gmail-smart
description: "Smart Gmail management and inbox automation via gog CLI. Use for: (1) Triaging and labeling incoming emails with a category system, (2) Bulk cleanup — archive or delete by sender, age, or category, (3) Inbox analytics — top senders, subscription detection, message stats, (4) Setting up Gmail hook automations for auto-triage, (5) Sender reputation analysis and unsubscribe discovery. Requires gog CLI authenticated with Gmail."
---

# Gmail Smart

Smart inbox management powered by `gog` CLI. Combines triage labeling, bulk operations, analytics, and hook-driven automation.

## Prerequisites

- `gog` CLI installed and authenticated: `gog auth list` to verify
- Gmail account authorized with gmail service: `gog auth add you@gmail.com --services gmail`
- Set default account: `export GOG_ACCOUNT=you@gmail.com`

## Quick Triage

Apply category labels to organize the inbox. Use the label taxonomy in `references/label-taxonomy.md`.

### Auto-Label Workflow

1. Search for emails matching a category pattern
2. Create the label if it doesn't exist
3. Apply label + optionally archive

Example — label all receipts and archive:

```bash
gog gmail messages search "subject:(receipt OR invoice OR order confirmation OR payment)" --max 200 --json \
  | jq -r '.[].id'
# Then apply label via gog gmail labels (or use the triage script)
```

For bulk triage, use `scripts/triage.sh` which applies the full label taxonomy to the inbox.

## Inbox Analytics

### Top Senders

Find who sends the most email:

```bash
gog gmail messages search "newer_than:90d" --max 500 --json \
  | jq -r '.[].from' | sort | uniq -c | sort -rn | head -20
```

### Subscription Detection

Find newsletters and mailing lists (emails containing "unsubscribe"):

```bash
gog gmail messages search "newer_than:180d unsubscribe" --max 500 --json \
  | jq -r '.[].from' | sort | uniq -c | sort -rn | head -30
```

### Inbox Stats

```bash
# Total inbox
gog gmail messages search "in:inbox" --max 1 --json | jq '.[0].resultSizeEstimate // "check manually"'

# Unread count
gog gmail messages search "is:unread" --max 1 --json | jq 'length'

# Oldest inbox email
gog gmail messages search "in:inbox" --max 1 --json | jq -r '.[0].date'
```

## Bulk Operations

### Archive by Sender

```bash
# Find and archive all emails from a sender
gog gmail messages search "from:newsletter@example.com" --max 1000 --json \
  | jq -r '.[].id' | xargs -I{} gog gmail messages modify {} --remove-labels INBOX
```

### Archive by Age

```bash
# Archive promotions older than 90 days
gog gmail messages search "category:promotions older_than:90d" --max 1000 --json \
  | jq -r '.[].id' | xargs -I{} gog gmail messages modify {} --remove-labels INBOX
```

### Archive by Category

```bash
# Archive all social notifications
gog gmail messages search "category:social" --max 1000 --json \
  | jq -r '.[].id' | xargs -I{} gog gmail messages modify {} --remove-labels INBOX
```

### Delete Old Emails

```bash
# Trash emails from a sender older than 1 year
gog gmail messages search "from:spam@example.com older_than:365d" --max 1000 --json \
  | jq -r '.[].id' | xargs -I{} gog gmail messages trash {}
```

**Always confirm before bulk delete operations.** Show the user a count and sample subjects first.

## Label Management

### Create Labels

```bash
gog gmail labels create "Triage/Receipts"
gog gmail labels create "Triage/Newsletters"
gog gmail labels create "Triage/Action-Required"
```

### Apply Labels

```bash
gog gmail messages modify <messageId> --add-labels "Label_123"
```

### List Labels

```bash
gog gmail labels list --json
```

See `references/label-taxonomy.md` for the full recommended label hierarchy.

## Hook Automation

When openclaw has Gmail hooks enabled (via `openclaw webhooks gmail setup`), incoming emails trigger the agent. Use the triage system to auto-categorize.

### Auto-Triage Hook Config

Add a mapping in `openclaw.json` to triage incoming emails:

```json5
{
  hooks: {
    presets: ["gmail"],
    mappings: [
      {
        match: { path: "gmail" },
        action: "agent",
        wakeMode: "now",
        name: "Gmail Triage",
        sessionKey: "hook:gmail:triage:{{messages[0].id}}",
        messageTemplate: "New email received. Triage it using the gmail-smart skill label taxonomy.\n\nFrom: {{messages[0].from}}\nSubject: {{messages[0].subject}}\nSnippet: {{messages[0].snippet}}\n\nApply the appropriate triage label and take action if needed.",
        deliver: false,
      },
    ],
  },
}
```

Set `deliver: true` and add `channel: "last"` to also forward a summary to your chat.

### Daily Digest Hook

For a daily summary instead of per-email triggers, use a cron mapping:

```json5
{
  hooks: {
    mappings: [
      {
        match: { path: "gmail-digest" },
        action: "agent",
        wakeMode: "now",
        name: "Gmail Daily Digest",
        sessionKey: "hook:gmail:digest:{{date}}",
        messageTemplate: "Generate a daily inbox digest. Search for emails from the last 24 hours, categorize them by the gmail-smart label taxonomy, and produce a summary with counts per category and any action items.",
      },
    ],
  },
}
```

## References

- `references/label-taxonomy.md` — Full label hierarchy with category definitions and search patterns
- `references/search-patterns.md` — Gmail search operators and advanced query patterns

## Scripts

- `scripts/triage.sh` — Bulk triage: applies the full label taxonomy to unprocessed inbox emails
