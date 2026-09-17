---
description: Unbilled work per matter, biggest first, with the age of the oldest entry. The firm's own money, waiting to be asked for.
---

1. Run `npm run matters -- wip`.
2. Lead with the total. That is fees the firm has earned and not billed.
3. Read the oldest-entry column before the totals column. WIP over 90 days old writes itself off eventually: the client anchors on the last bill, the detail goes stale, the discount conversation begins. The alarm exists to bill it while it is still worth face value.
4. Check the estimate column: anything OVER means the client conversation happens before the bill does (r 3.5).
5. For each matter worth billing, the move is one command: `bill <ref>`. It drafts the invoice from the unbilled ledger, marks the entries billed, and stops. A person reads the draft (`npm run docs -- invoice`) and sends it.
6. Work that will never be billed gets written off deliberately, not left to rot: `matter close <ref> --write-off` at the end, or bill the good part with `--through=<date>`.

Billing on a matter with no letter of engagement on file is refused, because the first document a client receives should not be an invoice (rr 3.4, 3.5). `record <ref> "engagement" --on=` fixes the record; `--force` exists for files that genuinely live elsewhere.
