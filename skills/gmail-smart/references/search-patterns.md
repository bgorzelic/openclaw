# Gmail Search Patterns

Reference for Gmail search operators used with `gog gmail search` and `gog gmail messages search`.

## Core Operators

| Operator         | Example                                   | Description            |
| ---------------- | ----------------------------------------- | ---------------------- |
| `from:`          | `from:user@example.com`                   | Sender address or name |
| `to:`            | `to:me@example.com`                       | Recipient              |
| `subject:`       | `subject:meeting`                         | Subject line contains  |
| `has:attachment` | `has:attachment`                          | Has file attachment    |
| `filename:`      | `filename:pdf`                            | Attachment type        |
| `in:`            | `in:inbox`, `in:trash`, `in:anywhere`     | Location               |
| `is:`            | `is:unread`, `is:starred`, `is:important` | Message state          |
| `label:`         | `label:Triage/Receipts`                   | Has label              |
| `category:`      | `category:promotions`                     | Gmail category tab     |

## Date Operators

| Operator      | Example             | Description                      |
| ------------- | ------------------- | -------------------------------- |
| `newer_than:` | `newer_than:7d`     | Within last N days/months/years  |
| `older_than:` | `older_than:90d`    | Older than N days/months/years   |
| `after:`      | `after:2024/01/15`  | After specific date (YYYY/MM/DD) |
| `before:`     | `before:2024/06/01` | Before specific date             |

Units: `d` (days), `m` (months), `y` (years).

## Boolean Logic

| Syntax | Example                            | Description  |
| ------ | ---------------------------------- | ------------ |
| `OR`   | `from:alice OR from:bob`           | Match either |
| `-`    | `-category:promotions`             | Exclude      |
| `()`   | `(receipt OR invoice) from:amazon` | Group terms  |
| `" "`  | `"exact phrase"`                   | Exact match  |

## Size Operators

| Operator   | Example        | Description               |
| ---------- | -------------- | ------------------------- |
| `size:`    | `size:5000000` | Larger than N bytes       |
| `larger:`  | `larger:10M`   | Larger than (with units)  |
| `smaller:` | `smaller:100K` | Smaller than (with units) |

## Useful Compound Queries

### Find action items

```
is:unread in:inbox -category:promotions -category:social newer_than:7d
```

### Find large attachments to clean up

```
has:attachment larger:10M older_than:90d
```

### Find newsletter subscriptions

```
unsubscribe newer_than:180d -from:me
```

### Find unread from real people (not automated)

```
is:unread in:inbox -category:promotions -category:social -category:updates -from:(noreply OR no-reply OR notify OR notification)
```

### Find receipts for tax purposes

```
(receipt OR invoice OR "order confirmation") after:2025/01/01 before:2026/01/01
```

### Find emails from a domain

```
from:@company.com newer_than:30d
```

### Find thread starters (no replies)

```
in:inbox -in:chats is:unread
```

## gog CLI Notes

- `gog gmail search` returns one row per **thread** (conversation)
- `gog gmail messages search` returns every individual **message** (use for counting and bulk ops)
- Add `--json` for machine-readable output
- Add `--max N` to limit results
- Add `--account you@gmail.com` or set `GOG_ACCOUNT` env var
