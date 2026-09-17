---
description: WIP plus debtors per client, the money the firm has earned and does not have. The number that decides whether payroll is comfortable.
---

1. Run `npm run matters -- lockup`.
2. Lead with the one number: total lock-up, split into unbilled WIP and billed-but-unpaid.
3. Read it per client, biggest first. Lock-up concentrates: two or three clients usually hold most of it, and those are the two or three conversations that free the cash.
4. For each big line, say which half it is:
   - Mostly **WIP**: the fix is a bill. `wip` shows the matters, `bill <ref>` drafts it.
   - Mostly **debtors**: the fix is a call. `debtors` shows the age, the words go to `drafts/`.
5. If the operator wants the printable version for a partners' meeting, `npm run view -- money` renders lock-up, WIP, recovery and the aged debtors as one branded page.

Lock-up is the practice metric the incumbent charges an analytics module for. Here it is a view over your own ledger.
