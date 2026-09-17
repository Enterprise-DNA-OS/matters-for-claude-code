---
description: Every invoice out the door and unpaid, aged into buckets, plus the drafts that never went out at all.
---

1. Run `npm run matters -- debtors`.
2. Lead with two numbers: the total outstanding and how much of it is past due.
3. Read it oldest first. An invoice over 60 days is not aging, it is being ignored, and every week makes the call harder.
4. The NOT SENT rows are drafts that never left the building. They are not debtors; they are unfinished work. Send them or void the pretence.
5. For each overdue invoice, the move is a human one: a call or a note. Draft the chasing words to `drafts/` in the firm's voice; never send from here. Small firms get paid by the partner ringing, not by a dunning sequence.
6. When money lands: `invoice paid <number> [--amount=] [--on=]`. A short payment is flagged so the balance gets chased or credited deliberately, not forgotten.

For the wider picture run `lockup`: WIP plus debtors per client is the money asleep, and it names which clients are sleeping on the most of it.
