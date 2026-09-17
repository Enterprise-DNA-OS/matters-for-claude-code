---
description: Record time in the words it happened, or read the week. The ledger every bill, every estimate alarm and every recovery number is built from.
---

The operator says what they did in their own words: "hour and a half on the Weiss mediation letter", "45 minutes with the Fletcher director", "two hours drafting, no charge".

**Recording:**
- `npm run matters -- time add <matter> "what was done" --hours=1.5 [--on=] [--lawyer=] [--no-charge] [--rate=]`
- Time reads the way people say it: `--hours=1.5`, `--minutes=90`, or `1:30`. It is stored in minutes at the lawyer's rate on the day, so a rate change never rewrites history.
- `--no-charge` for the work the firm chooses to eat; it shows in recovery honestly instead of disappearing.
- If the entry tips the matter past its estimate, the CLI says so. That is the moment to ring the client (r 3.5), not invoice time.

**Reading:**
- `npm run matters -- time [--days=7] [--lawyer=]` for who recorded what and its value.
- `npm run matters -- recovery` for the honest version: worked against billed against written off, per lawyer, with the effective rate after write-offs.

Two rules:
1. Record it the day it happens. A timesheet reconstructed at month end is fiction with numbers.
2. Never pad and never invent. The ledger becomes the bill, and the bill is a professional document.
