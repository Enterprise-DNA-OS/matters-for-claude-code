---
description: One matter in full, or open and close one. The parties, the client care file, the key dates, the undertakings, the time and the money.
---

The operator names a matter by ref ("MT-1002"), client name, or a word from the description.

**Reading one:**
1. Run `npm run matters -- matter <ref>`.
2. Summarise the card top to bottom: what it is, who has carriage, WIP against the estimate, then the sharp edges in this order: any key date (limitation first), any open undertaking, any client care file gap, missing CDD.
3. If the file has gaps, say which record and which rule wants it. The `record` command closes each one.

**Opening one:**
- `npm run matters -- matter open <client> --about="Sale of 8 Marine Parade" --type=conveyancing --estimate=1400 --against="the purchasers; their company"`
- Always pass `--against=` with every name on the other side. The conflict check runs on each name before the matter exists, hits refuse the opening, and a clean check is recorded on the file automatically. Skipping it leaves the conflict record MISSING and /compliance will say so.
- If it refuses on a conflict hit: read what it found, assess it against rr 5.4 and 6.1, and only re-run with `--force` when the operator has decided the firm can act. Then write the reasoning into the record: `record <ref> "conflict" --note="what was found and why we can act"`.
- Give the estimate at opening (`--estimate=` or `--fixed-fee=`). Rule 3.5 wants the fee basis in advance, and the over-estimate alarm needs a number to watch.

**Closing one:**
- `npm run matters -- matter close <ref>`. It refuses while an undertaking is undischarged (r 10.3) and stops on unbilled WIP: bill it (`bill <ref>`), write it off (`--write-off`), or force past deliberately.
- On close, remind the operator: closing letter to the client, and the file is kept, 6 years minimum for trust-linked records and 10 by most firms' practice.
