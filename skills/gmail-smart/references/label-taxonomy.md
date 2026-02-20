# Gmail Label Taxonomy

Hierarchical label system for inbox triage. Labels use the `Triage/` prefix to keep them grouped.

## Label Hierarchy

| Label                    | Search Pattern                                                                                                     | Action                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `Triage/Action-Required` | Emails needing a reply or decision                                                                                 | Keep in inbox            |
| `Triage/Receipts`        | `subject:(receipt OR invoice OR order confirmation OR payment confirmed)`                                          | Archive                  |
| `Triage/Shipping`        | `subject:(shipped OR tracking OR delivery OR out for delivery OR package)`                                         | Archive                  |
| `Triage/Newsletters`     | `unsubscribe AND NOT (receipt OR invoice)` from known senders                                                      | Archive                  |
| `Triage/Notifications`   | `from:(notify OR notification OR noreply OR no-reply)`                                                             | Archive                  |
| `Triage/Social`          | `category:social`                                                                                                  | Archive                  |
| `Triage/Promotions`      | `category:promotions`                                                                                              | Archive                  |
| `Triage/Finance`         | `from:(bank OR paypal OR venmo OR stripe OR chase OR wells)` or `subject:(statement OR balance OR transaction)`    | Keep                     |
| `Triage/Travel`          | `from:(airline OR hotel OR airbnb OR booking OR expedia)` or `subject:(itinerary OR boarding pass OR reservation)` | Keep                     |
| `Triage/Calendar`        | `subject:(invitation OR invite OR RSVP OR "calendar event")` or `from:(calendar-notification)`                     | Archive after processing |
| `Triage/Security`        | `subject:(password reset OR verify OR security alert OR suspicious OR two-factor OR 2FA)`                          | Keep in inbox            |
| `Triage/Automated`       | `from:(cron OR jenkins OR github OR gitlab OR sentry OR datadog)` CI/CD and monitoring                             | Archive                  |

## Classification Rules

When triaging an email, apply the **first matching** label from this priority order:

1. **Security** — Always highest priority. Password resets, 2FA codes, security alerts.
2. **Action-Required** — Emails that need a human response (questions, requests, approvals).
3. **Finance** — Bank statements, payment confirmations, financial alerts.
4. **Travel** — Itineraries, boarding passes, hotel confirmations.
5. **Receipts** — Purchase confirmations, invoices, order receipts.
6. **Shipping** — Tracking updates, delivery notifications.
7. **Calendar** — Event invitations, RSVPs.
8. **Automated** — CI/CD notifications, monitoring alerts, system emails.
9. **Newsletters** — Regular content from subscriptions with unsubscribe links.
10. **Notifications** — App notifications, social platform alerts.
11. **Social** — Gmail's social category.
12. **Promotions** — Gmail's promotions category, marketing emails.

## Custom Labels

Users may extend this taxonomy with domain-specific labels:

```
Triage/Work          — Emails from work domain (@company.com)
Triage/Family        — Emails from known family contacts
Triage/Projects      — Emails related to specific projects
```

To add a custom label, create it with:

```bash
gog gmail labels create "Triage/CustomName"
```

## Sender Reputation Patterns

Common high-volume senders to auto-archive:

| Sender Pattern                   | Category      |
| -------------------------------- | ------------- |
| `*@marketing.*`, `*@promo.*`     | Promotions    |
| `*@notifications.*`, `noreply@*` | Notifications |
| `*@github.com`                   | Automated     |
| `*@linkedin.com`                 | Social        |
| `*@facebookmail.com`             | Social        |
| `digest@*`, `newsletter@*`       | Newsletters   |
