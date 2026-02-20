#!/usr/bin/env bash
set -euo pipefail

# Gmail Smart Triage Script
# Applies the label taxonomy to unprocessed inbox emails.
# Requires: gog CLI authenticated with Gmail.
#
# Usage:
#   scripts/triage.sh [--account you@gmail.com] [--max 200] [--archive] [--dry-run]
#
# Options:
#   --account   Gmail account (default: $GOG_ACCOUNT)
#   --max       Max messages to process per category (default: 200)
#   --archive   Archive messages after labeling (except Action-Required, Finance, Security)
#   --dry-run   Show what would be done without making changes

ACCOUNT="${GOG_ACCOUNT:-}"
MAX=200
ARCHIVE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --account) ACCOUNT="$2"; shift 2 ;;
    --max) MAX="$2"; shift 2 ;;
    --archive) ARCHIVE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$ACCOUNT" ]]; then
  echo "Error: Set GOG_ACCOUNT or pass --account"
  exit 1
fi

ACCT_FLAG="--account $ACCOUNT"

log() { echo "[triage] $*"; }

ensure_label() {
  local label_name="$1"
  if ! gog gmail labels list $ACCT_FLAG --json 2>/dev/null | grep -q "\"name\":\"$label_name\""; then
    if [[ "$DRY_RUN" == "true" ]]; then
      log "DRY-RUN: Would create label: $label_name"
    else
      gog gmail labels create "$label_name" $ACCT_FLAG 2>/dev/null || true
      log "Created label: $label_name"
    fi
  fi
}

apply_category() {
  local label_name="$1"
  local query="$2"
  local should_archive="${3:-false}"

  log "Processing: $label_name"
  log "  Query: $query"

  local count
  count=$(gog gmail messages search "$query" --max "$MAX" $ACCT_FLAG --json 2>/dev/null | jq 'length' 2>/dev/null || echo "0")

  if [[ "$count" -eq 0 ]]; then
    log "  No messages found"
    return
  fi

  log "  Found: $count messages"

  if [[ "$DRY_RUN" == "true" ]]; then
    log "  DRY-RUN: Would label $count messages as $label_name"
    if [[ "$ARCHIVE" == "true" && "$should_archive" == "true" ]]; then
      log "  DRY-RUN: Would archive $count messages"
    fi
    return
  fi

  ensure_label "$label_name"

  # Get label ID
  local label_id
  label_id=$(gog gmail labels list $ACCT_FLAG --json 2>/dev/null | jq -r ".[] | select(.name==\"$label_name\") | .id" 2>/dev/null)

  if [[ -z "$label_id" ]]; then
    log "  Warning: Could not find label ID for $label_name"
    return
  fi

  # Apply labels
  gog gmail messages search "$query" --max "$MAX" $ACCT_FLAG --json 2>/dev/null \
    | jq -r '.[].id' \
    | while read -r msg_id; do
        gog gmail messages modify "$msg_id" --add-labels "$label_id" $ACCT_FLAG 2>/dev/null || true
      done

  log "  Labeled $count messages"

  if [[ "$ARCHIVE" == "true" && "$should_archive" == "true" ]]; then
    gog gmail messages search "$query" --max "$MAX" $ACCT_FLAG --json 2>/dev/null \
      | jq -r '.[].id' \
      | while read -r msg_id; do
          gog gmail messages modify "$msg_id" --remove-labels INBOX $ACCT_FLAG 2>/dev/null || true
        done
    log "  Archived $count messages"
  fi
}

log "Starting triage for $ACCOUNT (max $MAX per category)"
log "Archive: $ARCHIVE | Dry-run: $DRY_RUN"
echo "---"

# Create all labels first
for label in \
  "Triage/Action-Required" \
  "Triage/Security" \
  "Triage/Finance" \
  "Triage/Travel" \
  "Triage/Receipts" \
  "Triage/Shipping" \
  "Triage/Calendar" \
  "Triage/Automated" \
  "Triage/Newsletters" \
  "Triage/Notifications" \
  "Triage/Social" \
  "Triage/Promotions"; do
  ensure_label "$label"
done

# Apply categories in priority order (see label-taxonomy.md)
# Labels that should NOT be archived: Security, Action-Required, Finance, Travel

apply_category "Triage/Security" \
  "in:inbox subject:(password reset OR verify OR security alert OR suspicious OR two-factor OR 2FA) newer_than:30d" \
  false

apply_category "Triage/Finance" \
  "in:inbox (from:(bank OR paypal OR venmo OR stripe OR chase OR wells) OR subject:(statement OR balance OR transaction)) newer_than:30d" \
  false

apply_category "Triage/Travel" \
  "in:inbox (from:(airline OR hotel OR airbnb OR booking OR expedia) OR subject:(itinerary OR boarding OR reservation)) newer_than:30d" \
  false

apply_category "Triage/Receipts" \
  "in:inbox subject:(receipt OR invoice OR \"order confirmation\" OR \"payment confirmed\") newer_than:30d" \
  true

apply_category "Triage/Shipping" \
  "in:inbox subject:(shipped OR tracking OR delivery OR \"out for delivery\" OR package) newer_than:30d" \
  true

apply_category "Triage/Calendar" \
  "in:inbox (subject:(invitation OR invite OR RSVP OR \"calendar event\") OR from:calendar-notification) newer_than:30d" \
  true

apply_category "Triage/Automated" \
  "in:inbox from:(cron OR jenkins OR github OR gitlab OR sentry OR datadog) newer_than:30d" \
  true

apply_category "Triage/Newsletters" \
  "in:inbox unsubscribe -subject:(receipt OR invoice) newer_than:30d" \
  true

apply_category "Triage/Notifications" \
  "in:inbox from:(notify OR notification OR noreply OR no-reply) -subject:(receipt OR invoice OR password OR security) newer_than:30d" \
  true

apply_category "Triage/Social" \
  "in:inbox category:social newer_than:30d" \
  true

apply_category "Triage/Promotions" \
  "in:inbox category:promotions newer_than:30d" \
  true

echo "---"
log "Triage complete"
